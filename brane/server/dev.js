#!/usr/bin/env node

/**
 * Dev orchestrator — runs both the Vite dev server and the API server.
 */

import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const colors = {
  api: "\x1b[36m",   // cyan
  vite: "\x1b[35m",  // magenta
  reset: "\x1b[0m",
};

function run(label, cmd, args, env = {}) {
  const proc = spawn(cmd, args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });

  const prefix = `${colors[label]}[${label}]${colors.reset}`;

  proc.stdout.on("data", (data) => {
    data.toString().split("\n").filter(Boolean).forEach((line) => {
      console.log(`${prefix} ${line}`);
    });
  });

  proc.stderr.on("data", (data) => {
    data.toString().split("\n").filter(Boolean).forEach((line) => {
      console.error(`${prefix} ${line}`);
    });
  });

  proc.on("exit", (code) => {
    console.log(`${prefix} exited with code ${code}`);
  });

  return proc;
}

console.log("\n  🧠 Brane — starting dev environment...\n");

// Start API server
const api = run("api", "node", ["server/index.js"]);

// Start Vite dev server
const vite = run("vite", "npx", ["vite", "--port", "5180"]);

// Handle shutdown
process.on("SIGINT", () => {
  api.kill();
  vite.kill();
  process.exit(0);
});

process.on("SIGTERM", () => {
  api.kill();
  vite.kill();
  process.exit(0);
});
