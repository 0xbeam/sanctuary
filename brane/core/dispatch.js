import { detectAdapter } from "./adapters/index.js";
import { generateInstructionMd } from "./markdown-generator.js";
import { saveInstruction } from "./store.js";
import { getBrowserManager, needsBrowser } from "./browser/index.js";
import { createTask, getTask, getTasks } from "./task-manager.js";
import { writeFile, readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { syncFromScraped } from "./knowledge-store.js";

const TASKS_DIR = join(homedir(), ".brane", "tasks");

/**
 * Pipeline stages for activity tracking.
 */
const STAGES = [
  { id: "detect", label: "Detecting source", icon: "🔍" },
  { id: "connect", label: "Connecting to source", icon: "🔗" },
  { id: "fetch", label: "Fetching content", icon: "📡" },
  { id: "parse", label: "Parsing entries", icon: "🧩" },
  { id: "categorize", label: "Categorizing feedback", icon: "🏷️" },
  { id: "markdown", label: "Generating instructions", icon: "📝" },
  { id: "assets", label: "Downloading assets", icon: "🖼️" },
  { id: "save", label: "Saving to disk", icon: "💾" },
  { id: "done", label: "Complete", icon: "✓" },
];

/** Max concurrent dispatch jobs */
const MAX_CONCURRENT = 5;

/**
 * Push activity entry to local job object (in-memory for fast polling).
 */
function logLocal(job, stageId, message) {
  const stage = STAGES.find((s) => s.id === stageId);
  const entry = {
    stage: stageId,
    label: stage?.label || stageId,
    message,
    timestamp: Date.now(),
  };
  job.activity.push(entry);
  job.currentStage = stageId;
  job.stageIndex = STAGES.findIndex((s) => s.id === stageId);
}

/**
 * Persist the current in-memory job state to the task file.
 * Does a direct read-modify-write to *replace* activity (not append),
 * since we hold the full activity array in memory.
 */
async function persistJob(job) {
  try {
    const filePath = join(TASKS_DIR, `${job.id}.json`);
    const raw = await readFile(filePath, "utf-8");
    const task = JSON.parse(raw);

    // Overwrite with in-memory state (activity is replaced, not appended)
    task.status = job.status;
    task.activity = job.activity;
    task.currentStage = job.currentStage;
    task.stageIndex = job.stageIndex;
    task.totalStages = job.totalStages;
    task.input = { ...task.input, ...job.input };
    task.output = job.output;
    task.completedAt = job.completedAt;

    await writeFile(filePath, JSON.stringify(task, null, 2), "utf-8");
  } catch (err) {
    // Non-fatal — don't break the pipeline if persist fails
    console.error(`[dispatch] persist failed for ${job.id}:`, err.message);
  }
}

/**
 * Map a task-manager task object to the shape the UI expects.
 */
function taskToJob(task) {
  if (!task) return null;
  return {
    id: task.id,
    url: task.input?.url || "",
    detectedSource: task.input?.detectedSource || null,
    status: task.status,
    project: task.input?.project || "",
    resultId: task.output?.resultId || null,
    error: task.output?.error || null,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
    activity: task.activity || [],
    currentStage: task.currentStage,
    stageIndex: task.stageIndex ?? -1,
    totalStages: task.totalStages || STAGES.length,
    stats: task.output?.stats || null,
    engine: task.input?.engine || null,
  };
}

/**
 * Dispatcher — auto-detects adapters and processes URLs in parallel.
 * Tracks pipeline activity per job for live visualization.
 * Supports browser engine fallback chain.
 *
 * Jobs are persisted to ~/.brane/tasks/ via task-manager so they
 * survive server restarts and page refreshes.
 */
export class Dispatcher {
  constructor(outputDir) {
    this.outputDir = outputDir;
    // In-memory cache for active jobs (fast polling during dispatch)
    this._activeJobs = new Map();
    this._activeCount = 0;
    this._queue = [];
  }

  async createPendingJob(url, project = "") {
    const AdapterClass = detectAdapter(url);

    // Check for existing pending task for the same URL
    const existing = await getTasks({ type: "scrape", status: "pending" });
    const dup = existing.find((t) => t.input?.url === url);
    if (dup) return taskToJob(dup);

    const browserManager = getBrowserManager();
    const willUseBrowser = needsBrowser(url) && browserManager.isAvailable();
    const engine = willUseBrowser ? browserManager.activeEngine?.name : "fetch";

    const task = await createTask({
      type: "scrape",
      title: url,
      status: "pending",
      totalStages: STAGES.length,
      input: {
        url,
        project,
        detectedSource: AdapterClass.sourceType,
        engine,
      },
      output: {},
      activity: [],
      currentStage: null,
      stageIndex: -1,
    });

    return taskToJob(task);
  }

  async dispatch(url, project = "") {
    // Concurrency gate
    if (this._activeCount >= MAX_CONCURRENT) {
      await new Promise((resolve) => this._queue.push(resolve));
    }
    this._activeCount++;

    const AdapterClass = detectAdapter(url);

    // Find or create the pending task
    let tasks = await getTasks({ type: "scrape", status: "pending" });
    let task = tasks.find((t) => t.input?.url === url);
    if (!task) {
      const stub = await this.createPendingJob(url, project);
      task = await getTask(stub.id);
    }

    // Build in-memory job for fast polling
    const job = {
      id: task.id,
      status: "processing",
      activity: [],
      currentStage: null,
      stageIndex: -1,
      totalStages: STAGES.length,
      input: { ...task.input },
      output: {},
      completedAt: null,
    };
    this._activeJobs.set(job.id, job);

    // Persist initial processing status
    await persistJob(job);

    try {
      // Stage 1: Detect
      const browserManager = getBrowserManager();
      const engineName = (needsBrowser(url) && browserManager.isAvailable())
        ? browserManager.activeEngine?.name
        : "fetch";
      job.input.engine = engineName;

      logLocal(job, "detect", `Source: ${AdapterClass.sourceType} · Engine: ${engineName}`);
      await tick();

      // Stage 2: Connect
      logLocal(job, "connect", `Initializing ${AdapterClass.sourceType} adapter`);
      const adapter = new AdapterClass();
      await tick();

      // Persist after connect stage
      await persistJob(job);

      // Stage 3-5: Fetch, Parse, Categorize
      logLocal(job, "fetch", `Requesting content from ${truncateUrl(url)}`);
      const instructionSet = await adapter.scrape(url, { project });

      const actualEngine = instructionSet.meta?.engine || engineName;
      job.input.engine = actualEngine;

      logLocal(job, "parse", `Found ${instructionSet.stats.totalEntries} entries via ${actualEngine}`);
      await tick();

      logLocal(job, "categorize", `${instructionSet.stats.blockerCount || 0} blockers, ${instructionSet.stats.revisionCount || 0} changes, ${instructionSet.stats.imageCount || 0} images`);
      await tick();

      // Persist after categorize
      await persistJob(job);

      // Stage 6: Generate markdown
      logLocal(job, "markdown", `Building agent instruction document`);
      const md = generateInstructionMd(instructionSet);
      await tick();

      // Stage 7: Save
      logLocal(job, "save", `Writing to ${instructionSet.id}/`);
      await saveInstruction(instructionSet, this.outputDir, md);

      // Stage 8: Assets
      logLocal(job, "assets", `Downloading ${instructionSet.stats.imageCount} images`);
      const assetResult = await adapter.downloadAssets(instructionSet, `${this.outputDir}/${instructionSet.id}`);
      if (assetResult.total > 0) {
        logLocal(job, "assets", `Downloaded ${assetResult.downloaded}/${assetResult.total} assets`);
      }

      // Done
      logLocal(job, "done", `Instruction set ready: ${instructionSet.title}`);
      job.output = { resultId: instructionSet.id, stats: instructionSet.stats };
      job.status = "complete";
    } catch (err) {
      job.activity.push({
        stage: "error",
        label: "Error",
        message: err.message,
        timestamp: Date.now(),
      });
      job.output = { error: err.message };
      job.status = "error";
    }

    job.completedAt = new Date().toISOString();

    // Final persist
    await persistJob(job);

    // Remove from active cache
    this._activeJobs.delete(job.id);

    // Auto-sync knowledge from scraped output
    if (job.status === "complete") {
      try {
        await syncFromScraped(this.outputDir);
      } catch (err) {
        console.error(`[dispatch] knowledge sync failed:`, err.message);
      }
    }

    // Release concurrency slot
    this._activeCount--;
    if (this._queue.length > 0) {
      const next = this._queue.shift();
      next();
    }

    return taskToJob(job);
  }

  async dispatchBatch(urls, project = "") {
    const results = await Promise.allSettled(
      urls.map((url) => this.dispatch(url, project))
    );
    return results.map((r) => (r.status === "fulfilled" ? r.value : r.reason));
  }

  async getJobs() {
    // Merge persisted tasks with in-memory active jobs (active have fresher data)
    const tasks = await getTasks({ type: "scrape" });
    const jobs = tasks.map((t) => {
      // If this task is currently active, use the in-memory version for freshness
      const active = this._activeJobs.get(t.id);
      if (active) {
        return taskToJob(active);
      }
      return taskToJob(t);
    });
    return jobs;
  }

  async getJob(id) {
    // Prefer in-memory active job for freshness
    const active = this._activeJobs.get(id);
    if (active) return taskToJob(active);

    const task = await getTask(id);
    if (!task || task.type !== "scrape") return null;
    return taskToJob(task);
  }
}

// Small delay to let polling pick up stage changes
function tick() {
  return new Promise((r) => setTimeout(r, 80));
}

function truncateUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname.slice(0, 30) + (u.pathname.length > 30 ? "…" : "");
  } catch {
    return url.slice(0, 50);
  }
}
