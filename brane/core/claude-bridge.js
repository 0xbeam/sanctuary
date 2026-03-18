import { spawn, execSync } from "child_process";
import { createWriteStream, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { generateId } from "./types.js";

/**
 * Common paths where the Claude CLI might be installed.
 */
const CLAUDE_PATHS = [
  "claude",
  "/usr/local/bin/claude",
  "/opt/homebrew/bin/claude",
  `${process.env.HOME}/.local/bin/claude`,
  `${process.env.HOME}/.npm-global/bin/claude`,
];

/**
 * Find the Claude CLI binary path.
 * @returns {string|null} Path to claude binary or null
 */
function findClaudeBinary() {
  for (const bin of CLAUDE_PATHS) {
    try {
      execSync(`command -v ${bin}`, { encoding: "utf-8", timeout: 3000 });
      return bin;
    } catch {
      // Try next
    }
  }

  // Also try `which`
  try {
    return execSync("which claude", { encoding: "utf-8", timeout: 3000 }).trim();
  } catch {
    return null;
  }
}

/**
 * Check if Claude Code CLI is installed and accessible.
 * @returns {{ installed: boolean, path: string|null }}
 */
export function isClaudeInstalled() {
  const bin = findClaudeBinary();
  return { installed: !!bin, path: bin };
}

/**
 * Spawn a Claude Code background agent.
 * @param {Object} options
 * @param {string} options.cwd - Working directory for the agent
 * @param {string} [options.branch] - Git branch to work on
 * @param {string} options.prompt - The prompt/task for the agent
 * @param {string} [options.name] - Optional name for the agent
 * @returns {{ id: string, pid: number|null, name: string, cwd: string, error?: string }}
 */
export function spawnAgent({ cwd, branch, prompt, name }) {
  const { installed, path: claudePath } = isClaudeInstalled();
  const agentId = generateId();
  const agentName = name || `agent-${agentId}`;

  if (!installed) {
    return {
      id: agentId,
      pid: null,
      name: agentName,
      cwd,
      error: "Claude CLI not found. Install it first.",
    };
  }

  try {
    const args = ["-p", prompt, "--output-format", "json"];

    // Log file for capturing output
    const agentsLogDir = join(homedir(), ".brane", "agents");
    mkdirSync(agentsLogDir, { recursive: true });
    const logPath = join(agentsLogDir, `${agentId}.log`);
    const logStream = createWriteStream(logPath, { flags: "a" });

    const child = spawn(claudePath, args, {
      cwd,
      detached: true,
      stdio: ["ignore", logStream, logStream],
    });

    // Allow the parent to exit independently
    child.unref();

    // Track exit
    child.on("exit", (code) => {
      logStream.write(`\n[brane] Process exited with code ${code}\n`);
      logStream.end();
    });

    return {
      id: agentId,
      pid: child.pid || null,
      name: agentName,
      cwd,
      logPath,
    };
  } catch (err) {
    return {
      id: agentId,
      pid: null,
      name: agentName,
      cwd,
      error: err.message,
    };
  }
}

/**
 * List running Claude processes.
 * @returns {{ pid: number, cwd: string, command: string }[]}
 */
export function listClaudeProcesses() {
  try {
    const output = execSync("ps aux", { encoding: "utf-8", timeout: 5000 });
    const lines = output.split("\n");

    const claudeProcesses = [];
    for (const line of lines) {
      if (!line.toLowerCase().includes("claude")) continue;
      // Skip the grep process itself
      if (line.includes("grep")) continue;

      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) continue;

      const pid = parseInt(parts[1], 10);
      const command = parts.slice(10).join(" ");

      // Try to extract cwd from /proc or lsof (macOS fallback)
      let cwd = "";
      try {
        cwd = execSync(`lsof -p ${pid} | grep cwd`, {
          encoding: "utf-8",
          timeout: 3000,
        })
          .trim()
          .split(/\s+/)
          .pop() || "";
      } catch {
        // cwd detection may fail
      }

      claudeProcesses.push({ pid, cwd, command });
    }

    return claudeProcesses;
  } catch {
    return [];
  }
}
