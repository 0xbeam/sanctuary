#!/usr/bin/env node

import { program } from "commander";
import { analyzeRepo } from "../core/analyzers/repo.js";
import { generateDiagram } from "../core/generators/diagram.js";
import { startServer } from "../core/server.js";
import { resolve } from "path";
import { existsSync } from "fs";

program
  .name("parc")
  .description("Agent-first architecture intelligence — map any repo, visualize agents, share with your team")
  .version("0.1.0");

// ─── MAP: Analyze a repo and generate architecture diagrams ───
program
  .command("map")
  .description("Analyze a git repo and generate interactive architecture diagrams")
  .argument("[path]", "Path to git repo (defaults to cwd)", ".")
  .option("-o, --output <file>", "Output HTML file path")
  .option("--json", "Also output raw analysis as JSON")
  .option("--no-open", "Skip opening diagram in browser")
  .action(async (repoPath, opts) => {
    const absPath = resolve(repoPath);

    if (!existsSync(absPath)) {
      console.error(`  Error: path does not exist: ${absPath}`);
      process.exit(1);
    }

    console.log(`\n  parc map`);
    console.log(`  ────────────────────────────────`);
    console.log(`  Repo: ${absPath}\n`);

    // Phase 1: Analyze
    console.log(`  [1/3] Scanning repo structure...`);
    const analysis = await analyzeRepo(absPath);

    console.log(`  [2/3] Detected:`);
    console.log(`         ${analysis.summary.totalFiles} files, ${analysis.summary.languages.join(", ")}`);
    console.log(`         ${analysis.routes.length} routes, ${analysis.api.length} API endpoints`);
    console.log(`         ${analysis.agents.length} agents, ${analysis.components.length} components`);
    if (analysis.database.tables.length) {
      console.log(`         ${analysis.database.tables.length} database tables`);
    }

    // Phase 2: Generate
    console.log(`  [3/3] Generating diagram...`);
    const outputPath = opts.output || resolve(absPath, "architecture.html");
    await generateDiagram(analysis, outputPath);

    if (opts.json) {
      const jsonPath = outputPath.replace(".html", ".json");
      const { writeFileSync } = await import("fs");
      writeFileSync(jsonPath, JSON.stringify(analysis, null, 2));
      console.log(`\n  JSON: ${jsonPath}`);
    }

    console.log(`  Output: ${outputPath}`);

    if (opts.open) {
      const { exec } = await import("child_process");
      exec(`open "${outputPath}"`);
    }

    console.log(`\n  Done.\n`);
  });

// ─── SERVE: Start a live dashboard for the repo ───
program
  .command("serve")
  .description("Start a live architecture dashboard with agent monitoring")
  .argument("[path]", "Path to git repo", ".")
  .option("-p, --port <number>", "Port to serve on", "4400")
  .action(async (repoPath, opts) => {
    const absPath = resolve(repoPath);
    const port = parseInt(opts.port);

    console.log(`\n  parc serve`);
    console.log(`  ────────────────────────────────`);
    console.log(`  Repo: ${absPath}`);
    console.log(`  Port: ${port}\n`);

    await startServer(absPath, port);
  });

// ─── AGENTS: List detected agents in a repo ───
program
  .command("agents")
  .description("List all AI agents detected in the repo")
  .argument("[path]", "Path to git repo", ".")
  .action(async (repoPath) => {
    const absPath = resolve(repoPath);
    const analysis = await analyzeRepo(absPath);

    if (analysis.agents.length === 0) {
      console.log("\n  No AI agents detected.\n");
      return;
    }

    console.log(`\n  ${analysis.agents.length} agent(s) detected:\n`);
    for (const agent of analysis.agents) {
      console.log(`  [${agent.tier.toUpperCase().padEnd(10)}] ${agent.name}`);
      console.log(`               ${agent.file}`);
      if (agent.description) console.log(`               ${agent.description}`);
      console.log("");
    }
  });

// ─── DIFF: Show what changed since last commit ───
program
  .command("diff")
  .description("Show architecture changes since a commit or branch")
  .argument("[ref]", "Git ref to compare against", "HEAD~1")
  .option("-p, --path <dir>", "Repo path", ".")
  .action(async (ref, opts) => {
    const absPath = resolve(opts.path);
    const { execSync } = await import("child_process");

    console.log(`\n  parc diff ${ref}`);
    console.log(`  ────────────────────────────────\n`);

    try {
      const diffOutput = execSync(
        `git -C "${absPath}" diff --name-status ${ref}`,
        { encoding: "utf8" }
      );

      const lines = diffOutput.trim().split("\n").filter(Boolean);
      const added = lines.filter(l => l.startsWith("A"));
      const modified = lines.filter(l => l.startsWith("M"));
      const deleted = lines.filter(l => l.startsWith("D"));

      const routeChanges = lines.filter(l => l.includes("/app/") || l.includes("/pages/"));
      const apiChanges = lines.filter(l => l.includes("/api/"));
      const agentChanges = lines.filter(l => l.includes("agent"));

      console.log(`  Files: +${added.length} added, ~${modified.length} modified, -${deleted.length} deleted`);
      if (routeChanges.length) console.log(`  Routes affected: ${routeChanges.length}`);
      if (apiChanges.length) console.log(`  API endpoints affected: ${apiChanges.length}`);
      if (agentChanges.length) console.log(`  Agent files affected: ${agentChanges.length}`);

      if (lines.length > 0) {
        console.log(`\n  Changes:`);
        for (const line of lines.slice(0, 30)) {
          const [status, file] = line.split("\t");
          const icon = status === "A" ? "+" : status === "D" ? "-" : "~";
          console.log(`    [${icon}] ${file}`);
        }
        if (lines.length > 30) console.log(`    ... and ${lines.length - 30} more`);
      }
    } catch (e) {
      console.error(`  Error: not a git repo or invalid ref: ${ref}`);
    }

    console.log("");
  });

program.parse();
