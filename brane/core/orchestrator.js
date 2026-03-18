import { spawn } from "child_process";
import { createWriteStream } from "fs";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { isClaudeInstalled } from "./claude-bridge.js";

const BRANE_DIR = join(homedir(), ".brane");
const ORCH_DIR = join(BRANE_DIR, "orchestrator");
const STATE_FILE = join(ORCH_DIR, "state.json");
const LOG_FILE = join(ORCH_DIR, "orchestrator.log");

const ORCHESTRATOR_PROMPT = `You are the Brane Master Orchestrator — the central coordinator for all agent operations.

Your MCP tools give you access to the Brane control plane. Use them to:

1. MONITOR: Periodically check for queued tasks with brane_get_tasks
2. DISCOVER: Check available agents with brane_get_agents
3. ASSIGN: Match tasks to agents based on their cwd (project directory), capabilities, and current load
4. COMMUNICATE: Read messages from the "orchestrator" channel with brane_get_messages for human instructions
5. RESPOND: Reply on the "orchestrator" channel with brane_publish

Decision framework for task assignment:
- Match agent cwd to task gitRepo when possible
- Prefer idle agents over active ones
- Consider agent capabilities and the task type
- For tasks tagged with approval:true, propose the assignment via message and wait

When you receive a message on the orchestrator channel:
- If it's a question, answer it based on current system state
- If it's a command (e.g., "assign task X to agent Y"), execute it
- If it's a strategic decision, provide your analysis and recommendation

Start by scanning the current state: check agents, tasks, and any pending messages.`;

/**
 * Get orchestrator state from disk.
 */
async function getState() {
  try {
    const raw = await readFile(STATE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { pid: null, startedAt: null, status: "stopped" };
  }
}

/**
 * Save orchestrator state to disk.
 */
async function saveState(state) {
  await mkdir(ORCH_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Check if a PID is alive.
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
 * Spawn the orchestrator agent.
 */
export async function spawnOrchestrator() {
  const state = await getState();

  // Already running?
  if (state.pid && isPidAlive(state.pid)) {
    return { status: "already-running", pid: state.pid, startedAt: state.startedAt };
  }

  const { installed, path: claudePath } = isClaudeInstalled();
  if (!installed) {
    return { status: "error", error: "Claude CLI not found" };
  }

  // Ensure orchestrator directory exists
  await mkdir(ORCH_DIR, { recursive: true });

  // Create MCP config for orchestrator
  const mcpConfig = {
    mcpServers: {
      brane: {
        command: "node",
        args: [join(process.cwd(), "server/mcp.js")]
      }
    }
  };
  await writeFile(join(ORCH_DIR, ".mcp.json"), JSON.stringify(mcpConfig, null, 2), "utf-8");

  // Create CLAUDE.md for orchestrator
  await writeFile(join(ORCH_DIR, "CLAUDE.md"), `# Brane Orchestrator\n\nYou are the master orchestrator. Use brane_* MCP tools to manage the agent pool and task queue.\n`, "utf-8");

  try {
    const logStream = createWriteStream(LOG_FILE, { flags: "a" });

    const child = spawn(claudePath, ["-p", ORCHESTRATOR_PROMPT, "--output-format", "json"], {
      cwd: ORCH_DIR,
      detached: true,
      stdio: ["ignore", logStream, logStream],
    });

    child.unref();

    const newState = {
      pid: child.pid,
      startedAt: new Date().toISOString(),
      status: "running",
    };
    await saveState(newState);

    // Monitor for exit
    child.on("exit", async (code) => {
      const s = await getState();
      s.status = "stopped";
      s.exitCode = code;
      s.stoppedAt = new Date().toISOString();
      await saveState(s);
    });

    return { status: "started", pid: child.pid, startedAt: newState.startedAt };
  } catch (err) {
    return { status: "error", error: err.message };
  }
}

/**
 * Stop the orchestrator.
 */
export async function stopOrchestrator() {
  const state = await getState();
  if (!state.pid || !isPidAlive(state.pid)) {
    state.status = "stopped";
    await saveState(state);
    return { status: "already-stopped" };
  }

  try {
    process.kill(state.pid, "SIGTERM");
    state.status = "stopped";
    state.stoppedAt = new Date().toISOString();
    await saveState(state);
    return { status: "stopped", pid: state.pid };
  } catch (err) {
    return { status: "error", error: err.message };
  }
}

/**
 * Get orchestrator status.
 */
export async function getOrchestratorStatus() {
  const state = await getState();

  // Verify PID is still alive
  if (state.pid && !isPidAlive(state.pid)) {
    state.status = "stopped";
    state.stoppedAt = state.stoppedAt || new Date().toISOString();
    await saveState(state);
  }

  // Read last few lines of log
  let recentLog = "";
  try {
    const log = await readFile(LOG_FILE, "utf-8");
    const lines = log.trim().split("\n");
    recentLog = lines.slice(-20).join("\n");
  } catch {}

  return {
    ...state,
    alive: state.pid ? isPidAlive(state.pid) : false,
    recentLog,
  };
}

/**
 * Ensure orchestrator is alive, restart if dead.
 */
export async function ensureOrchestratorAlive() {
  const state = await getState();
  if (state.status === "running" && state.pid && !isPidAlive(state.pid)) {
    // It died, restart it
    return spawnOrchestrator();
  }
  return state;
}
