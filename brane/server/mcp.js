#!/usr/bin/env node

/**
 * Brane MCP Server
 *
 * Exposes the Brane agent control plane as an MCP (Model Context Protocol)
 * server over stdio, so Claude Code sessions can connect and coordinate.
 *
 * Run:  node server/mcp.js
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";

// ── Paths ──────────────────────────────────────────────────────────────────────

const BRANE_HOME = path.join(os.homedir(), ".brane");
const DIRS = {
  agents: path.join(BRANE_HOME, "agents"),
  tasks: path.join(BRANE_HOME, "tasks"),
  messages: path.join(BRANE_HOME, "messages"),
  knowledge: path.join(BRANE_HOME, "knowledge"),
};

// Ensure all directories exist
for (const dir of Object.values(DIRS)) {
  fs.mkdirSync(dir, { recursive: true });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function uid() {
  return crypto.randomUUID().slice(0, 8);
}

function readJSON(filepath) {
  return JSON.parse(fs.readFileSync(filepath, "utf-8"));
}

function writeJSON(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + "\n");
}

function listJSONFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
}

function ok(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function err(message) {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
}

// ── Try-wrapper for tool handlers ──────────────────────────────────────────────

function safe(fn) {
  return async (params) => {
    try {
      return await fn(params);
    } catch (e) {
      return err(e.message);
    }
  };
}

// ── Core module imports (built in parallel — use dynamic import with fallback) ─

let coreModules = {};

async function tryImportCore() {
  const modules = [
    ["agentRegistry", "../core/agent-registry.js"],
    ["taskManager", "../core/task-manager.js"],
    ["messageBus", "../core/message-bus.js"],
    ["knowledgeStore", "../core/knowledge-store.js"],
    ["gitTracker", "../core/git-tracker.js"],
  ];
  for (const [key, modPath] of modules) {
    try {
      coreModules[key] = await import(modPath);
    } catch {
      // Core module not available yet — we'll use inline implementations
    }
  }
}

// ── Inline implementations (used when core modules aren't available yet) ───────

function inlineRegisterAgent({ name, cwd, gitBranch, model, capabilities, pid }) {
  const id = uid();
  const agent = {
    id,
    name: name || `agent-${id}`,
    cwd: cwd || process.cwd(),
    gitBranch: gitBranch || null,
    model: model || null,
    capabilities: capabilities || [],
    pid: pid || null,
    status: "active",
    registeredAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  };
  writeJSON(path.join(DIRS.agents, `${id}.json`), agent);
  return { id, status: "registered" };
}

function inlineHeartbeat({ agentId, gitBranch, status, taskIds }) {
  const filepath = path.join(DIRS.agents, `${agentId}.json`);
  if (!fs.existsSync(filepath)) throw new Error(`Agent not found: ${agentId}`);
  const agent = readJSON(filepath);
  agent.lastSeen = new Date().toISOString();
  if (gitBranch !== undefined) agent.gitBranch = gitBranch;
  if (status !== undefined) agent.status = status;
  if (taskIds !== undefined) agent.taskIds = taskIds;
  writeJSON(filepath, agent);
  return { ok: true };
}

function inlineGetAgents({ status } = {}) {
  const agents = listJSONFiles(DIRS.agents).map((f) => readJSON(path.join(DIRS.agents, f)));
  const filtered = status ? agents.filter((a) => a.status === status) : agents;
  return { agents: filtered };
}

function inlineCreateTask({ type, title, description, agentId, gitBranch, priority, input, dependencies }) {
  const id = uid();
  const task = {
    id,
    type: type || "general",
    title,
    description: description || null,
    agentId: agentId || null,
    gitBranch: gitBranch || null,
    priority: priority || "normal",
    status: "queued",
    input: input || null,
    dependencies: dependencies || [],
    output: null,
    activity: [],
    commits: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeJSON(path.join(DIRS.tasks, `${id}.json`), task);
  return { id, status: "queued" };
}

function inlineGetTasks({ agentId, status, type, gitBranch } = {}) {
  let tasks = listJSONFiles(DIRS.tasks).map((f) => readJSON(path.join(DIRS.tasks, f)));
  if (agentId) tasks = tasks.filter((t) => t.agentId === agentId);
  if (status) tasks = tasks.filter((t) => t.status === status);
  if (type) tasks = tasks.filter((t) => t.type === type);
  if (gitBranch) tasks = tasks.filter((t) => t.gitBranch === gitBranch);
  return { tasks };
}

function inlineUpdateTask({ taskId, status, output, activity, commits }) {
  const filepath = path.join(DIRS.tasks, `${taskId}.json`);
  if (!fs.existsSync(filepath)) throw new Error(`Task not found: ${taskId}`);
  const task = readJSON(filepath);
  if (status !== undefined) task.status = status;
  if (output !== undefined) task.output = output;
  if (activity !== undefined) task.activity = [...(task.activity || []), ...([].concat(activity))];
  if (commits !== undefined) task.commits = [...(task.commits || []), ...([].concat(commits))];
  task.updatedAt = new Date().toISOString();
  writeJSON(filepath, task);
  return { ok: true };
}

function inlinePublish({ channel, type, payload, to }) {
  const id = uid();
  const message = {
    id,
    channel,
    type: type || "message",
    payload,
    to: to || null,
    timestamp: new Date().toISOString(),
  };
  const filepath = path.join(DIRS.messages, `${channel}.jsonl`);
  fs.appendFileSync(filepath, JSON.stringify(message) + "\n");
  return { id, published: true };
}

function inlineGetMessages({ channel, since, limit }) {
  const filepath = path.join(DIRS.messages, `${channel}.jsonl`);
  if (!fs.existsSync(filepath)) return { messages: [] };
  let lines = fs.readFileSync(filepath, "utf-8").trim().split("\n").filter(Boolean);
  let messages = lines.map((l) => JSON.parse(l));
  if (since) {
    const sinceDate = new Date(since);
    messages = messages.filter((m) => new Date(m.timestamp) > sinceDate);
  }
  if (limit) messages = messages.slice(-limit);
  return { messages };
}

function inlineAddKnowledge({ type, title, content, tags, project, source }) {
  const id = uid();
  const meta = {
    id,
    type: type || "note",
    title,
    tags: tags || [],
    project: project || null,
    source: source || null,
    createdAt: new Date().toISOString(),
  };

  // Write the content as markdown
  const header = `---\n${Object.entries(meta).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n")}\n---\n\n`;
  fs.writeFileSync(path.join(DIRS.knowledge, `${id}.md`), header + content + "\n");

  // Update index
  const indexPath = path.join(DIRS.knowledge, "index.json");
  const index = fs.existsSync(indexPath) ? readJSON(indexPath) : { entries: [] };
  index.entries.push(meta);
  writeJSON(indexPath, index);

  return { id, stored: true };
}

function inlineGetKnowledge({ query, tags, project, type } = {}) {
  const indexPath = path.join(DIRS.knowledge, "index.json");
  if (!fs.existsSync(indexPath)) return { entries: [] };
  let { entries } = readJSON(indexPath);

  if (type) entries = entries.filter((e) => e.type === type);
  if (project) entries = entries.filter((e) => e.project === project);
  if (tags && tags.length > 0) {
    entries = entries.filter((e) => tags.some((t) => (e.tags || []).includes(t)));
  }
  if (query) {
    const q = query.toLowerCase();
    entries = entries.filter((e) => {
      if (e.title.toLowerCase().includes(q)) return true;
      // Also search file content
      const fp = path.join(DIRS.knowledge, `${e.id}.md`);
      if (fs.existsSync(fp)) {
        return fs.readFileSync(fp, "utf-8").toLowerCase().includes(q);
      }
      return false;
    });
  }

  return { entries };
}

function inlineGitStatus({ cwd }) {
  const run = (cmd) => execSync(cmd, { cwd, encoding: "utf-8", timeout: 10000 }).trim();
  try {
    const branch = run("git rev-parse --abbrev-ref HEAD");
    const statusOutput = run("git status --porcelain");
    const dirty = statusOutput.length > 0;
    const uncommittedFiles = dirty
      ? statusOutput.split("\n").filter(Boolean).map((l) => l.trim())
      : [];
    let recentCommits = [];
    try {
      recentCommits = run('git log --oneline -10')
        .split("\n")
        .filter(Boolean)
        .map((l) => {
          const [hash, ...rest] = l.split(" ");
          return { hash, message: rest.join(" ") };
        });
    } catch {
      // no commits yet
    }
    return { branch, dirty, uncommittedFiles, recentCommits };
  } catch (e) {
    throw new Error(`Git error in ${cwd}: ${e.message}`);
  }
}

// ── MCP Server Setup ───────────────────────────────────────────────────────────

const server = new McpServer({
  name: "brane",
  version: "1.0.0",
  description: "Brane agent control plane — coordinate Claude Code sessions",
});

// ── Tool Definitions ───────────────────────────────────────────────────────────

server.tool(
  "brane_register",
  "Register a new agent with the Brane control plane. Returns the agent's unique ID.",
  {
    name: z.string().optional().describe("Human-readable agent name"),
    cwd: z.string().optional().describe("Working directory of the agent"),
    gitBranch: z.string().optional().describe("Current git branch"),
    model: z.string().optional().describe("Model being used (e.g. claude-opus-4-20250514)"),
    capabilities: z.array(z.string()).optional().describe("List of capabilities"),
    pid: z.number().optional().describe("Process ID of the agent"),
  },
  safe((params) => {
    const fn = coreModules.agentRegistry?.registerAgent || inlineRegisterAgent;
    return ok(fn(params));
  })
);

server.tool(
  "brane_heartbeat",
  "Send a heartbeat to indicate this agent is still alive. Call periodically.",
  {
    agentId: z.string().describe("The agent ID returned from brane_register"),
    gitBranch: z.string().optional().describe("Current git branch (if changed)"),
    status: z.string().optional().describe("Current status"),
    taskIds: z.array(z.string()).optional().describe("Task IDs the agent is working on"),
  },
  safe((params) => {
    const fn = coreModules.agentRegistry?.heartbeat || inlineHeartbeat;
    return ok(fn(params));
  })
);

server.tool(
  "brane_get_agents",
  "List all registered agents. Optionally filter by status.",
  {
    status: z.string().optional().describe("Filter by status (e.g. 'active', 'idle')"),
  },
  safe((params) => {
    const fn = coreModules.agentRegistry?.getAgents || inlineGetAgents;
    return ok(fn(params));
  })
);

server.tool(
  "brane_create_task",
  "Create a new task for agents to pick up. Returns the task ID.",
  {
    type: z.string().optional().describe("Task type (e.g. 'code', 'review', 'test')"),
    title: z.string().describe("Short title for the task"),
    description: z.string().optional().describe("Detailed task description"),
    agentId: z.string().optional().describe("Assign to a specific agent"),
    gitBranch: z.string().optional().describe("Associated git branch"),
    priority: z.enum(["low", "normal", "high", "critical"]).optional().describe("Task priority"),
    input: z.any().optional().describe("Arbitrary input data for the task"),
    dependencies: z.array(z.string()).optional().describe("Task IDs this depends on"),
  },
  safe((params) => {
    const fn = coreModules.taskManager?.createTask || inlineCreateTask;
    return ok(fn(params));
  })
);

server.tool(
  "brane_get_tasks",
  "Query tasks. Filter by agent, status, type, or git branch.",
  {
    agentId: z.string().optional().describe("Filter by assigned agent"),
    status: z.string().optional().describe("Filter by status (queued, active, done, failed)"),
    type: z.string().optional().describe("Filter by task type"),
    gitBranch: z.string().optional().describe("Filter by git branch"),
  },
  safe((params) => {
    const fn = coreModules.taskManager?.getTasks || inlineGetTasks;
    return ok(fn(params));
  })
);

server.tool(
  "brane_update_task",
  "Update a task's status, output, activity log, or commits.",
  {
    taskId: z.string().describe("The task ID to update"),
    status: z.string().optional().describe("New status"),
    output: z.any().optional().describe("Task output/result"),
    activity: z.any().optional().describe("Activity entry or entries to append"),
    commits: z.any().optional().describe("Commit hash(es) to append"),
  },
  safe((params) => {
    const fn = coreModules.taskManager?.updateTask || inlineUpdateTask;
    return ok(fn(params));
  })
);

server.tool(
  "brane_publish",
  "Publish a message to a named channel. Other agents can read it.",
  {
    channel: z.string().describe("Channel name (e.g. 'coordination', 'status')"),
    type: z.string().optional().describe("Message type"),
    payload: z.any().describe("Message payload (any JSON)"),
    to: z.string().optional().describe("Target agent ID (for directed messages)"),
  },
  safe((params) => {
    const fn = coreModules.messageBus?.publish || inlinePublish;
    return ok(fn(params));
  })
);

server.tool(
  "brane_get_messages",
  "Read messages from a channel. Optionally filter by time or limit count.",
  {
    channel: z.string().describe("Channel name to read from"),
    since: z.string().optional().describe("ISO timestamp — only return messages after this time"),
    limit: z.number().optional().describe("Maximum number of messages to return"),
  },
  safe((params) => {
    const fn = coreModules.messageBus?.getMessages || inlineGetMessages;
    return ok(fn(params));
  })
);

server.tool(
  "brane_add_knowledge",
  "Store a piece of knowledge (decision, pattern, context) for other agents to find.",
  {
    type: z.string().optional().describe("Knowledge type (e.g. 'decision', 'pattern', 'context')"),
    title: z.string().describe("Title for this knowledge entry"),
    content: z.string().describe("The knowledge content (markdown)"),
    tags: z.array(z.string()).optional().describe("Tags for searchability"),
    project: z.string().optional().describe("Project name"),
    source: z.string().optional().describe("Where this knowledge came from"),
  },
  safe((params) => {
    const fn = coreModules.knowledgeStore?.addKnowledge || inlineAddKnowledge;
    return ok(fn(params));
  })
);

server.tool(
  "brane_get_knowledge",
  "Search stored knowledge by query, tags, project, or type.",
  {
    query: z.string().optional().describe("Free-text search query"),
    tags: z.array(z.string()).optional().describe("Filter by tags"),
    project: z.string().optional().describe("Filter by project"),
    type: z.string().optional().describe("Filter by knowledge type"),
  },
  safe((params) => {
    const fn = coreModules.knowledgeStore?.getKnowledge || inlineGetKnowledge;
    return ok(fn(params));
  })
);

server.tool(
  "brane_git_status",
  "Get git status for a directory: branch, dirty state, uncommitted files, recent commits.",
  {
    cwd: z.string().describe("Directory to check git status in"),
  },
  safe((params) => {
    const fn = coreModules.gitTracker?.getBranchInfo || inlineGitStatus;
    return ok(fn(params));
  })
);

// ── Start ──────────────────────────────────────────────────────────────────────

async function main() {
  await tryImportCore();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("Brane MCP server failed to start:", e);
  process.exit(1);
});
