import { readdir, readFile, writeFile, unlink } from "fs/promises";
import { join, basename } from "path";
import { homedir } from "os";
import { execSync } from "child_process";
import { generateId } from "./types.js";

const BRANE_DIR = join(homedir(), ".brane");
const AGENTS_DIR = join(BRANE_DIR, "agents");
const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

/**
 * Read the last N lines from a file efficiently.
 * Reads the file and splits, returning only the tail.
 * @param {string} filePath
 * @param {number} n
 * @returns {Promise<string[]>}
 */
async function readLastLines(filePath, n = 20) {
  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines.slice(-n);
  } catch {
    return [];
  }
}

/**
 * Parse a single JSONL line safely.
 * @param {string} line
 * @returns {Object|null}
 */
function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/**
 * Check if a process with the given PID is alive.
 * @param {number} pid
 * @returns {boolean}
 */
function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Try to find a running Claude process associated with a session or cwd.
 * @param {string} sessionId
 * @param {string} cwd
 * @returns {number|null} PID or null
 */
function findClaudePid(sessionId, cwd) {
  try {
    const result = execSync(
      `pgrep -f "claude"`,
      { encoding: "utf-8", timeout: 3000 }
    ).trim();
    const pids = result.split("\n").filter(Boolean).map(Number);
    return pids[0] || null;
  } catch {
    return null;
  }
}

/**
 * Scan all Claude Code session JSONL files under ~/.claude/projects/
 * and create/update agent records in ~/.brane/agents/.
 * @returns {Promise<Object[]>} Array of agent objects created or updated
 */
export async function scanClaudeSessions() {
  const agents = [];

  let projectDirs;
  try {
    projectDirs = await readdir(CLAUDE_PROJECTS_DIR);
  } catch {
    return agents;
  }

  // Collect all session entries keyed by sessionId
  const sessionMap = new Map();

  for (const dir of projectDirs) {
    const dirPath = join(CLAUDE_PROJECTS_DIR, dir);
    let files;
    try {
      files = await readdir(dirPath);
    } catch {
      continue;
    }

    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

    for (const file of jsonlFiles) {
      const filePath = join(dirPath, file);
      const lines = await readLastLines(filePath, 20);

      for (const line of lines) {
        const entry = parseLine(line);
        if (!entry || !entry.sessionId) continue;

        const existing = sessionMap.get(entry.sessionId);
        if (!existing || (entry.timestamp && entry.timestamp > existing.timestamp)) {
          sessionMap.set(entry.sessionId, entry);
        }
      }
    }
  }

  // Load existing agents to avoid duplicates
  const existingAgents = await getAgents();
  const existingBySession = new Map();
  for (const agent of existingAgents) {
    if (agent.meta?.sessionId) {
      existingBySession.set(agent.meta.sessionId, agent);
    }
  }

  // Create/update agents from sessions
  for (const [sessionId, entry] of sessionMap) {
    const pid = findClaudePid(sessionId, entry.cwd);
    const isAlive = isPidAlive(pid);

    const agentData = {
      name: entry.slug || basename(entry.cwd || "unknown"),
      cwd: entry.cwd || null,
      gitBranch: entry.gitBranch || null,
      gitRepo: entry.cwd ? basename(entry.cwd) : null,
      pid: pid,
      model: entry.version || null,
      status: isAlive ? "active" : "idle",
      meta: {
        sessionId: sessionId,
        slug: entry.slug || null,
        version: entry.version || null,
      },
    };

    const existing = existingBySession.get(sessionId);
    if (existing) {
      const updated = await updateAgent(existing.id, {
        ...agentData,
        lastSeen: new Date().toISOString(),
      });
      agents.push(updated);
    } else {
      const registered = await registerAgent(agentData);
      agents.push(registered);
    }
  }

  return agents;
}

/**
 * Register a new agent in the filesystem.
 * @param {Object} data - Agent data to merge with defaults
 * @returns {Promise<Object>} The saved agent object
 */
export async function registerAgent(data) {
  const now = new Date().toISOString();
  const agent = {
    id: generateId(),
    name: data.name || "unnamed-agent",
    status: data.status || "idle",
    cwd: data.cwd || null,
    gitBranch: data.gitBranch || null,
    gitRepo: data.gitRepo || null,
    pid: data.pid || null,
    model: data.model || null,
    parentAgentId: data.parentAgentId || null,
    taskIds: data.taskIds || [],
    capabilities: data.capabilities || [],
    lastSeen: now,
    createdAt: now,
    meta: {
      sessionId: data.meta?.sessionId || null,
      slug: data.meta?.slug || null,
      version: data.meta?.version || null,
    },
    ...data,
  };
  // Ensure id is always generated fresh if not provided
  if (!data.id) agent.id = generateId();

  const filePath = join(AGENTS_DIR, `${agent.id}.json`);
  await writeFile(filePath, JSON.stringify(agent, null, 2), "utf-8");
  return agent;
}

/**
 * Get all registered agents.
 * @returns {Promise<Object[]>} Array of agent objects
 */
export async function getAgents() {
  try {
    const files = await readdir(AGENTS_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    const agents = [];

    for (const file of jsonFiles) {
      try {
        const raw = await readFile(join(AGENTS_DIR, file), "utf-8");
        agents.push(JSON.parse(raw));
      } catch {
        // Skip malformed files
      }
    }

    return agents;
  } catch {
    return [];
  }
}

/**
 * Get a single agent by ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getAgent(id) {
  try {
    const raw = await readFile(join(AGENTS_DIR, `${id}.json`), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Update an agent with a partial patch (read-modify-write).
 * @param {string} id
 * @param {Object} patch - Fields to merge
 * @returns {Promise<Object|null>} Updated agent or null if not found
 */
export async function updateAgent(id, patch) {
  const agent = await getAgent(id);
  if (!agent) return null;

  const updated = { ...agent, ...patch };
  // Deep merge meta
  if (patch.meta) {
    updated.meta = { ...agent.meta, ...patch.meta };
  }

  const filePath = join(AGENTS_DIR, `${id}.json`);
  await writeFile(filePath, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

/**
 * Check if an agent's PID is still alive.
 * @param {Object} agent
 * @returns {boolean}
 */
export function checkLiveness(agent) {
  return isPidAlive(agent.pid);
}

/**
 * Remove an agent file from the registry.
 * @param {string} id
 * @returns {Promise<boolean>} true if removed
 */
export async function removeAgent(id) {
  try {
    await unlink(join(AGENTS_DIR, `${id}.json`));
    return true;
  } catch {
    return false;
  }
}

/**
 * Update an agent's heartbeat (lastSeen) and merge optional patch.
 * @param {string} id
 * @param {Object} [patch={}]
 * @returns {Promise<Object|null>}
 */
export async function heartbeat(id, patch = {}) {
  return updateAgent(id, {
    ...patch,
    lastSeen: new Date().toISOString(),
  });
}

export async function pauseAgent(id) {
  return updateAgent(id, { status: "paused" });
}

export async function resumeAgent(id) {
  return updateAgent(id, { status: "active" });
}

export async function decommissionAgent(id) {
  return updateAgent(id, { status: "decommissioned" });
}
