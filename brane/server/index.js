import express from "express";
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Dispatcher } from "../core/dispatch.js";
import { loadIndex, loadInstruction } from "../core/store.js";
import { getBrowserManager } from "../core/browser/index.js";

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
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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

// Health check — includes browser engine status
app.get("/api/health", (req, res) => {
  const browserManager = getBrowserManager();
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
  });
});

// ─── Startup ───
async function start() {
  // Initialize browser manager (non-blocking, graceful if none available)
  const browserManager = getBrowserManager();
  await browserManager.init().catch((err) => {
    console.warn(`  ⚠ Browser engine init failed: ${err.message}`);
  });

  app.listen(PORT, () => {
    console.log(`\n  ⚡ Brane API server running on http://localhost:${PORT}`);
    console.log(`     Output:     ${OUTPUT_DIR}`);
    console.log(`     Slack:      ${process.env.SLACK_BOT_TOKEN ? "✓ connected" : "✗ no token"}`);
    console.log(`     Figma:      ${process.env.FIGMA_TOKEN ? "✓ connected" : "✗ no token"}`);
    console.log(`     Cloudflare: ${process.env.CF_API_TOKEN ? "✓ configured" : "✗ no token"}`);
    console.log(`     Lightpanda: ${process.env.LIGHTPANDA_URL || "✗ not configured"}`);
    console.log(`     Browser:    ${browserManager.activeEngine?.name || "none (fetch-only mode)"}\n`);
  });
}

start();

export default app;
