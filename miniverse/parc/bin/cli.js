#!/usr/bin/env node

import { program } from "commander";
import { analyzeRepo } from "../core/analyzers/repo.js";
import { generateDiagram } from "../core/generators/diagram.js";
import { startServer } from "../core/server.js";
import { resolve, join } from "path";
import { existsSync, readFileSync } from "fs";

// ─── Config loading ───
function loadConfig(repoPath) {
  const configPath = join(repoPath, ".parc.json");
  const defaults = { ignore: [], agentPatterns: [], port: 4400 };
  if (!existsSync(configPath)) return defaults;
  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch (e) {
    log("warn", `Could not parse .parc.json: ${e.message}. Using defaults.`);
    return defaults;
  }
}

// ─── Progress / logging helpers ───
function timestamp() {
  return new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function log(level, msg) {
  const prefix = { info: "  ", ok: "  ✓", warn: "  ⚠", err: "  ✗" }[level] || "  ";
  console.log(`${prefix} [${timestamp()}] ${msg}`);
}

// ─── Pre-flight checks ───
function preflight(absPath) {
  if (!existsSync(absPath)) {
    console.error(`\n  ✗ Path does not exist: ${absPath}`);
    console.error(`    Check the path and try again.\n`);
    process.exit(1);
  }

  const hasGit = existsSync(join(absPath, ".git"));
  if (!hasGit) {
    console.log(`\n  ⚠ No .git directory found in ${absPath}`);
    console.log(`    Some features (diff, branch info) require a git repo.`);
    console.log(`    Continuing without git context...\n`);
  }

  const hasPkg = existsSync(join(absPath, "package.json"));
  if (!hasPkg) {
    console.log(`  ⚠ No package.json found — framework detection may be limited.`);
  }

  return { hasGit, hasPkg };
}

// ─── Global options ───
program
  .name("parc")
  .description("Agent-first architecture intelligence — map any repo, visualize agents, share with your team")
  .version("0.1.0")
  .option("--config <path>", "Path to .parc.json config file (default: auto-detect in repo root)");

// ─── MAP: Analyze a repo and generate architecture diagrams ───
program
  .command("map")
  .description("Analyze a git repo and generate interactive architecture diagrams")
  .argument("[path]", "Path to git repo (defaults to cwd)", ".")
  .option("-o, --output <file>", "Output HTML file path")
  .option("--format <type>", "Output format: html (default) or json", "html")
  .option("--json", "Also output raw analysis as JSON")
  .option("--no-open", "Skip opening diagram in browser")
  .action(async (repoPath, opts) => {
    const absPath = resolve(repoPath);
    const { hasGit } = preflight(absPath);
    const config = loadConfig(absPath);

    console.log(`\n  parc map`);
    console.log(`  ────────────────────────────────`);
    console.log(`  Repo: ${absPath}\n`);

    // Phase 1: Analyze
    log("info", "Scanning files...");
    const analysis = await analyzeRepo(absPath, { config });

    log("info", "Detecting routes...");
    console.log(`         ${analysis.routes.length} routes found`);

    log("info", "Detecting API endpoints...");
    console.log(`         ${analysis.api.length} API endpoints found`);

    log("info", "Detecting agents...");
    console.log(`         ${analysis.agents.length} agents found`);

    log("info", "Detecting components...");
    console.log(`         ${analysis.components.length} components found`);

    console.log(`\n  Summary:`);
    console.log(`         ${analysis.summary.totalFiles} files, ${analysis.summary.languages.join(", ")}`);
    console.log(`         ${analysis.routes.length} routes, ${analysis.api.length} API endpoints`);
    console.log(`         ${analysis.agents.length} agents, ${analysis.components.length} components`);
    if (analysis.database.tables.length) {
      console.log(`         ${analysis.database.tables.length} database tables`);
    }

    // Phase 2: Generate output
    if (opts.format === "json") {
      log("info", "Writing JSON analysis...");
      const outputPath = opts.output || resolve(absPath, "architecture.json");
      const { writeFileSync } = await import("fs");
      writeFileSync(outputPath, JSON.stringify(analysis, null, 2));
      console.log(`  Output: ${outputPath}`);
    } else {
      log("info", "Generating diagram...");
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
    }

    console.log(`\n  Done.\n`);
  });

// ─── SERVE: Start a live dashboard for the repo ───
program
  .command("serve")
  .description("Start a live architecture dashboard with agent monitoring")
  .argument("[path]", "Path to git repo", ".")
  .option("-p, --port <number>", "Port to serve on", "4400")
  .option("--watch", "Auto-rescan on file changes")
  .action(async (repoPath, opts) => {
    const absPath = resolve(repoPath);
    const config = loadConfig(absPath);
    const port = parseInt(opts.port || config.port);

    preflight(absPath);

    console.log(`\n  parc serve`);
    console.log(`  ────────────────────────────────`);
    console.log(`  Repo: ${absPath}`);
    console.log(`  Port: ${port}`);
    if (opts.watch) console.log(`  Watch: enabled (auto-rescan on file changes)`);
    console.log("");

    log("info", "Starting server...");
    await startServer(absPath, port, { watch: opts.watch || false, config });
  });

// ─── AGENTS: List detected agents in a repo ───
program
  .command("agents")
  .description("List all AI agents detected in the repo")
  .argument("[path]", "Path to git repo", ".")
  .action(async (repoPath) => {
    const absPath = resolve(repoPath);
    preflight(absPath);
    const config = loadConfig(absPath);

    log("info", "Scanning for agents...");
    const analysis = await analyzeRepo(absPath, { config });

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

    if (!existsSync(join(absPath, ".git"))) {
      console.error(`\n  ✗ Not a git repository: ${absPath}`);
      console.error(`    The diff command requires a git repo. Run 'git init' first.\n`);
      process.exit(1);
    }

    const { execSync } = await import("child_process");

    console.log(`\n  parc diff ${ref}`);
    console.log(`  ────────────────────────────────\n`);

    try {
      // Try architecture-level diff first
      let analyzeRepoDiff;
      try {
        const mod = await import("../core/analyzers/diff.js");
        analyzeRepoDiff = mod.analyzeRepoDiff;
      } catch (_) {
        // Module not available, fall through
      }

      if (analyzeRepoDiff) {
        log("info", "Running architecture-level diff...");
        const archDiff = await analyzeRepoDiff(absPath, ref);
        printArchDiff(archDiff);
      } else {
        // Fall back to enhanced git diff parsing
        log("info", "Scanning changes...");

        const diffOutput = execSync(
          `git -C "${absPath}" diff --name-status ${ref}`,
          { encoding: "utf8" }
        );

        const lines = diffOutput.trim().split("\n").filter(Boolean);
        const added = lines.filter(l => l.startsWith("A"));
        const modified = lines.filter(l => l.startsWith("M"));
        const deleted = lines.filter(l => l.startsWith("D"));

        // Classify changes by architecture concern
        const routeFiles = lines.filter(l => l.includes("/app/") || l.includes("/pages/") || l.includes("routes"));
        const apiFiles = lines.filter(l => l.includes("/api/") || l.includes("endpoint"));
        const agentFiles = lines.filter(l => /agent|bot|ai|llm/i.test(l));
        const componentFiles = lines.filter(l => /component|\.tsx$|\.vue$/i.test(l) && !l.includes("/api/"));
        const configFiles = lines.filter(l => /config|\.env|package\.json|tsconfig/i.test(l));
        const dbFiles = lines.filter(l => /schema|migration|prisma|\.sql/i.test(l));

        console.log(`  Overview: +${added.length} added, ~${modified.length} modified, -${deleted.length} deleted\n`);

        // Architecture-level summary
        if (routeFiles.length) {
          const addedRoutes = routeFiles.filter(l => l.startsWith("A")).map(l => l.split("\t")[1]);
          const modifiedRoutes = routeFiles.filter(l => l.startsWith("M")).map(l => l.split("\t")[1]);
          const deletedRoutes = routeFiles.filter(l => l.startsWith("D")).map(l => l.split("\t")[1]);
          console.log(`  Routes (${routeFiles.length} affected):`);
          if (addedRoutes.length) console.log(`    Added:    ${addedRoutes.map(r => shortPath(r)).join(", ")}`);
          if (modifiedRoutes.length) console.log(`    Modified: ${modifiedRoutes.map(r => shortPath(r)).join(", ")}`);
          if (deletedRoutes.length) console.log(`    Deleted:  ${deletedRoutes.map(r => shortPath(r)).join(", ")}`);
          console.log("");
        }

        if (apiFiles.length) {
          const addedAPIs = apiFiles.filter(l => l.startsWith("A")).map(l => l.split("\t")[1]);
          const modifiedAPIs = apiFiles.filter(l => l.startsWith("M")).map(l => l.split("\t")[1]);
          console.log(`  API Endpoints (${apiFiles.length} affected):`);
          if (addedAPIs.length) console.log(`    New endpoints:      ${addedAPIs.map(r => shortPath(r)).join(", ")}`);
          if (modifiedAPIs.length) console.log(`    Modified endpoints: ${modifiedAPIs.map(r => shortPath(r)).join(", ")}`);
          console.log("");
        }

        if (agentFiles.length) {
          const addedAgents = agentFiles.filter(l => l.startsWith("A")).map(l => l.split("\t")[1]);
          const modifiedAgents = agentFiles.filter(l => l.startsWith("M")).map(l => l.split("\t")[1]);
          console.log(`  Agents (${agentFiles.length} affected):`);
          if (addedAgents.length) console.log(`    Added:    ${addedAgents.map(r => shortPath(r)).join(", ")}`);
          if (modifiedAgents.length) console.log(`    Modified: ${modifiedAgents.map(r => shortPath(r)).join(", ")}`);
          console.log("");
        }

        if (componentFiles.length) {
          const addedComps = componentFiles.filter(l => l.startsWith("A")).map(l => l.split("\t")[1]);
          const modifiedComps = componentFiles.filter(l => l.startsWith("M")).map(l => l.split("\t")[1]);
          console.log(`  Components (${componentFiles.length} affected):`);
          if (addedComps.length) console.log(`    Added:    ${addedComps.map(r => shortPath(r)).join(", ")}`);
          if (modifiedComps.length) console.log(`    Modified: ${modifiedComps.map(r => shortPath(r)).join(", ")}`);
          console.log("");
        }

        if (dbFiles.length) {
          console.log(`  Database (${dbFiles.length} affected):`);
          for (const l of dbFiles) {
            const [status, file] = l.split("\t");
            const icon = status === "A" ? "+" : status === "D" ? "-" : "~";
            console.log(`    [${icon}] ${shortPath(file)}`);
          }
          console.log("");
        }

        if (configFiles.length) {
          console.log(`  Config (${configFiles.length} affected):`);
          for (const l of configFiles) {
            const [status, file] = l.split("\t");
            const icon = status === "A" ? "+" : status === "D" ? "-" : "~";
            console.log(`    [${icon}] ${shortPath(file)}`);
          }
          console.log("");
        }

        // Remaining files not captured above
        const classified = new Set([...routeFiles, ...apiFiles, ...agentFiles, ...componentFiles, ...configFiles, ...dbFiles]);
        const other = lines.filter(l => !classified.has(l));
        if (other.length) {
          console.log(`  Other files (${other.length}):`);
          for (const l of other.slice(0, 15)) {
            const [status, file] = l.split("\t");
            const icon = status === "A" ? "+" : status === "D" ? "-" : "~";
            console.log(`    [${icon}] ${file}`);
          }
          if (other.length > 15) console.log(`    ... and ${other.length - 15} more`);
        }
      }
    } catch (e) {
      if (e.message && e.message.includes("not a git repository")) {
        console.error(`  ✗ Not a git repository: ${absPath}`);
        console.error(`    Initialize git with 'git init' and make at least one commit.`);
      } else if (e.message && e.message.includes("unknown revision")) {
        console.error(`  ✗ Unknown git ref: ${ref}`);
        console.error(`    Make sure the ref exists. Try 'git log --oneline' to find valid refs.`);
      } else {
        console.error(`  ✗ Error running diff: ${e.message}`);
        console.error(`    Ensure you're in a git repo and the ref '${ref}' is valid.`);
      }
    }

    console.log("");
  });

// ─── Helpers ───
function shortPath(filepath) {
  if (!filepath) return "";
  const parts = filepath.split("/");
  return parts.length > 3 ? ".../" + parts.slice(-2).join("/") : filepath;
}

function printArchDiff(diff) {
  if (diff.routes) {
    console.log(`  Routes:`);
    if (diff.routes.added?.length) console.log(`    Added:    ${diff.routes.added.join(", ")}`);
    if (diff.routes.modified?.length) console.log(`    Modified: ${diff.routes.modified.join(", ")}`);
    if (diff.routes.deleted?.length) console.log(`    Deleted:  ${diff.routes.deleted.join(", ")}`);
    console.log("");
  }
  if (diff.agents) {
    console.log(`  Agents:`);
    if (diff.agents.added?.length) console.log(`    Added:    ${diff.agents.added.join(", ")}`);
    if (diff.agents.modified?.length) console.log(`    Modified: ${diff.agents.modified.join(", ")}`);
    console.log("");
  }
  if (diff.api) {
    console.log(`  API Endpoints:`);
    if (diff.api.added?.length) console.log(`    New:      ${diff.api.added.join(", ")}`);
    if (diff.api.modified?.length) console.log(`    Modified: ${diff.api.modified.join(", ")}`);
    console.log("");
  }
  if (diff.components) {
    console.log(`  Components:`);
    if (diff.components.added?.length) console.log(`    Added:    ${diff.components.added.join(", ")}`);
    if (diff.components.modified?.length) console.log(`    Modified: ${diff.components.modified.join(", ")}`);
    console.log("");
  }
}

program.parse();
