import express from "express";
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdir } from "fs/promises";
import { homedir } from "os";
import { Dispatcher } from "../core/dispatch.js";
import { loadIndex, loadInstruction } from "../core/store.js";
import { getBrowserManager } from "../core/browser/index.js";
import { scanClaudeSessions, getAgents, getAgent, registerAgent, updateAgent, heartbeat, removeAgent } from "../core/agent-registry.js";
import { createTask, getTasks, getTask, updateTask, assignTask, cancelTask } from "../core/task-manager.js";
import { publish, getMessages, getChannels, bus } from "../core/message-bus.js";
import { addKnowledge, getKnowledge, getKnowledgeById, searchKnowledge, promoteToSkill, promoteToInstruction, syncFromScraped } from "../core/knowledge-store.js";
import { getBranchInfo, getRecentCommits, switchBranch, listBranches } from "../core/git-tracker.js";
import { spawnAgent, listClaudeProcesses } from "../core/claude-bridge.js";

config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = process.env.OUTPUT_DIR || join(__dirname, "..", "output");
const PORT = process.env.API_PORT || 3210;

const app = express();
app.use(express.json());

// CORS for dev
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Dispatcher instance (persistent across requests)
const dispatcher = new Dispatcher(OUTPUT_DIR);

// ─── API Routes ───

// GET /api/index — load instruction index
app.get("/api/index", async (req, res) => {
  try {
    const index = await loadIndex(OUTPUT_DIR);
    res.json(index);
  } catch (err) {
    res.json({ instructions: [] });
  }
});

// GET /api/instructions/:id — load full instruction detail
app.get("/api/instructions/:id", async (req, res) => {
  try {
    const data = await loadInstruction(OUTPUT_DIR, req.params.id);
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: "Instruction not found" });
  }
});

// POST /api/scrape — dispatch a single URL
app.post("/api/scrape", async (req, res) => {
  const { url, project } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });

  const jobStub = dispatcher.createPendingJob(url, project || "");
  res.json({ job: jobStub });

  dispatcher.dispatch(url, project || "").catch((err) => {
    console.error(`Scrape failed for ${url}:`, err.message);
  });
});

// POST /api/dispatch — dispatch multiple URLs in parallel
app.post("/api/dispatch", async (req, res) => {
  const { urls, project } = req.body;
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "urls array is required" });
  }

  const stubs = urls.map((url) => dispatcher.createPendingJob(url, project || ""));
  res.json({ jobs: stubs });

  dispatcher.dispatchBatch(urls, project || "").catch((err) => {
    console.error("Batch dispatch error:", err.message);
  });
});

// GET /api/jobs — list all dispatch jobs with activity logs
app.get("/api/jobs", (req, res) => {
  res.json({ jobs: dispatcher.getJobs() });
});

// GET /api/jobs/:id — get single job status
app.get("/api/jobs/:id", (req, res) => {
  const job = dispatcher.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({ job });
});

// Serve output files statically
app.use("/output", express.static(OUTPUT_DIR));

// ─── Agent Routes ───

// POST /api/agents/spawn — spawn a new Claude agent (BEFORE /:id)
app.post("/api/agents/spawn", async (req, res) => {
  try {
    const result = await spawnAgent(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents — list agents
app.get("/api/agents", async (req, res) => {
  try {
    let agents = await getAgents();
    if (req.query.status) {
      agents = agents.filter((a) => a.status === req.query.status);
    }
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:id — get single agent
app.get("/api/agents/:id", async (req, res) => {
  try {
    const agent = await getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents — register agent
app.post("/api/agents", async (req, res) => {
  try {
    const agent = await registerAgent(req.body);
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/agents/:id — update agent
app.patch("/api/agents/:id", async (req, res) => {
  try {
    const agent = await updateAgent(req.params.id, req.body);
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/agents/:id — remove agent
app.delete("/api/agents/:id", async (req, res) => {
  try {
    const result = await removeAgent(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Task Routes ───

// GET /api/tasks/branch/:branch — tasks by branch (BEFORE /:id)
app.get("/api/tasks/branch/:branch", async (req, res) => {
  try {
    const tasks = await getTasks({ gitBranch: req.params.branch });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/agent/:agentId — tasks by agent (BEFORE /:id)
app.get("/api/tasks/agent/:agentId", async (req, res) => {
  try {
    const tasks = await getTasks({ agentId: req.params.agentId });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks — list tasks with optional filters
app.get("/api/tasks", async (req, res) => {
  try {
    const tasks = await getTasks(req.query);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks — create task
app.post("/api/tasks", async (req, res) => {
  try {
    const task = await createTask(req.body);
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/:id — get single task
app.get("/api/tasks/:id", async (req, res) => {
  try {
    const task = await getTask(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tasks/:id — update task
app.patch("/api/tasks/:id", async (req, res) => {
  try {
    const task = await updateTask(req.params.id, req.body);
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks/:id/assign — assign task to agent
app.post("/api/tasks/:id/assign", async (req, res) => {
  try {
    const task = await assignTask(req.params.id, req.body.agentId);
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Message Routes ───

// GET /api/channels — list channels
app.get("/api/channels", async (req, res) => {
  try {
    const channels = await getChannels();
    res.json(channels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/messages/:channel/stream — SSE endpoint (BEFORE /:channel GET)
app.get("/api/messages/:channel/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const handler = (msg) => {
    res.write(`data: ${JSON.stringify(msg)}\n\n`);
  };

  bus.on(`message:${req.params.channel}`, handler);
  req.on("close", () => {
    bus.off(`message:${req.params.channel}`, handler);
  });
});

// GET /api/messages/:channel — get messages
app.get("/api/messages/:channel", async (req, res) => {
  try {
    const messages = await getMessages(req.params.channel, {
      since: req.query.since,
      limit: req.query.limit,
    });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/:channel — publish message
app.post("/api/messages/:channel", async (req, res) => {
  try {
    const result = await publish(req.params.channel, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Knowledge Routes ───

// GET /api/knowledge/search — search knowledge (BEFORE /:id)
app.get("/api/knowledge/search", async (req, res) => {
  try {
    const results = await searchKnowledge(req.query.q);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/knowledge — list knowledge
app.get("/api/knowledge", async (req, res) => {
  try {
    const knowledge = await getKnowledge(req.query);
    res.json(knowledge);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/knowledge — add knowledge
app.post("/api/knowledge", async (req, res) => {
  try {
    const entry = await addKnowledge(req.body);
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/knowledge/:id — get knowledge by id
app.get("/api/knowledge/:id", async (req, res) => {
  try {
    const entry = await getKnowledgeById(req.params.id);
    if (!entry) return res.status(404).json({ error: "Knowledge entry not found" });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/knowledge/:id/promote — promote knowledge to skill or instruction
app.post("/api/knowledge/:id/promote", async (req, res) => {
  try {
    const { target, name, projectPath } = req.body;
    let result;
    if (target === "skill") {
      result = await promoteToSkill(req.params.id, { name, projectPath });
    } else if (target === "instruction") {
      result = await promoteToInstruction(req.params.id, { name, projectPath });
    } else {
      return res.status(400).json({ error: "target must be 'skill' or 'instruction'" });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Git Routes ───

// GET /api/git/branches — branch info for all agents with unique cwds
app.get("/api/git/branches", async (req, res) => {
  try {
    const agents = await getAgents();
    const seen = new Set();
    const results = [];
    for (const agent of agents) {
      if (agent.cwd && !seen.has(agent.cwd)) {
        seen.add(agent.cwd);
        try {
          const info = await getBranchInfo(agent.cwd);
          results.push({ agentId: agent.id, cwd: agent.cwd, ...info });
        } catch (e) {
          results.push({ agentId: agent.id, cwd: agent.cwd, error: e.message });
        }
      }
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/git/:agentId/status — git status for an agent
app.get("/api/git/:agentId/status", async (req, res) => {
  try {
    const agent = await getAgent(req.params.agentId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    const [branchInfo, commits] = await Promise.all([
      getBranchInfo(agent.cwd),
      getRecentCommits(agent.cwd),
    ]);
    res.json({ agentId: agent.id, cwd: agent.cwd, branch: branchInfo, commits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/git/:agentId/branches — list branches for an agent's repo
app.get("/api/git/:agentId/branches", async (req, res) => {
  try {
    const agent = await getAgent(req.params.agentId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    const branches = await listBranches(agent.cwd);
    res.json({ agentId: agent.id, cwd: agent.cwd, branches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/git/:agentId/checkout — switch branch for an agent
app.post("/api/git/:agentId/checkout", async (req, res) => {
  try {
    const agent = await getAgent(req.params.agentId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    const result = await switchBranch(agent.cwd, req.body.branch);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Health & Status ───

// Health check — includes browser engine status + agent/task/knowledge stats
app.get("/api/health", async (req, res) => {
  try {
    const browserManager = getBrowserManager();
    const [allAgents, allTasks, allKnowledge, runningTasks] = await Promise.all([
      getAgents(),
      getTasks(),
      getKnowledge(),
      getTasks({ status: "running" }),
    ]);
    res.json({
      status: "ok",
      name: "brane",
      version: "1.1.0",
      uptime: process.uptime(),
      env: {
        slack: !!process.env.SLACK_BOT_TOKEN,
        figma: !!process.env.FIGMA_TOKEN,
        cloudflare: !!(process.env.CF_API_TOKEN && process.env.CF_ACCOUNT_ID),
        lightpanda: !!process.env.LIGHTPANDA_URL,
        output: OUTPUT_DIR,
      },
      browser: browserManager.getStatus(),
      jobs: {
        total: dispatcher.getJobs().length,
        active: dispatcher.getJobs().filter((j) => j.status === "processing" || j.status === "pending").length,
        complete: dispatcher.getJobs().filter((j) => j.status === "complete").length,
        errors: dispatcher.getJobs().filter((j) => j.status === "error").length,
      },
      agents: {
        total: allAgents.length,
        active: allAgents.filter((a) => a.status === "active").length,
      },
      tasks: {
        total: allTasks.length,
        running: runningTasks.length,
      },
      knowledge: {
        total: allKnowledge.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Startup ───
async function start() {
  // Ensure ~/.brane/ directories exist
  const braneHome = join(homedir(), ".brane");
  await mkdir(braneHome, { recursive: true });
  await mkdir(join(braneHome, "agents"), { recursive: true });
  await mkdir(join(braneHome, "tasks"), { recursive: true });
  await mkdir(join(braneHome, "knowledge"), { recursive: true });
  await mkdir(join(braneHome, "messages"), { recursive: true });

  // Initialize browser manager (non-blocking, graceful if none available)
  const browserManager = getBrowserManager();
  await browserManager.init().catch((err) => {
    console.warn(`  ⚠ Browser engine init failed: ${err.message}`);
  });

  // Initial scan of Claude sessions
  await scanClaudeSessions().catch((err) => {
    console.warn(`  ⚠ Initial session scan failed: ${err.message}`);
  });

  // Periodic session scanning every 10 seconds
  setInterval(scanClaudeSessions, 10000);

  // Sync existing scraped content to knowledge store
  await syncFromScraped(OUTPUT_DIR).catch((err) => {
    console.warn(`  ⚠ Knowledge sync from scraped failed: ${err.message}`);
  });

  app.listen(PORT, () => {
    console.log(`\n  ⚡ Brane API server running on http://localhost:${PORT}`);
    console.log(`     Output:     ${OUTPUT_DIR}`);
    console.log(`     Slack:      ${process.env.SLACK_BOT_TOKEN ? "✓ connected" : "✗ no token"}`);
    console.log(`     Figma:      ${process.env.FIGMA_TOKEN ? "✓ connected" : "✗ no token"}`);
    console.log(`     Cloudflare: ${process.env.CF_API_TOKEN ? "✓ configured" : "✗ no token"}`);
    console.log(`     Lightpanda: ${process.env.LIGHTPANDA_URL || "✗ not configured"}`);
    console.log(`     Browser:    ${browserManager.activeEngine?.name || "none (fetch-only mode)"}`);
    console.log(`     Agents:     scanning every 10s`);
    console.log(`     Brane home: ${braneHome}\n`);
  });
}

start();

export default app;
