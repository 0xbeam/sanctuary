import { detectAdapter } from "./adapters/index.js";
import { generateInstructionMd } from "./markdown-generator.js";
import { saveInstruction } from "./store.js";
import { generateId } from "./types.js";
import { getBrowserManager, needsBrowser } from "./browser/index.js";

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

function log(job, stageId, message) {
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
 * Dispatcher — auto-detects adapters and processes URLs in parallel.
 * Tracks pipeline activity per job for live visualization.
 * Supports browser engine fallback chain.
 */
export class Dispatcher {
  constructor(outputDir) {
    this.outputDir = outputDir;
    this.jobs = [];
    this._activeCount = 0;
    this._queue = [];
  }

  createPendingJob(url, project = "") {
    const AdapterClass = detectAdapter(url);
    const existing = this.jobs.find((j) => j.url === url && j.status === "pending");
    if (existing) return existing;

    const browserManager = getBrowserManager();
    const willUseBrowser = needsBrowser(url) && browserManager.isAvailable();

    const job = {
      id: generateId(),
      url,
      detectedSource: AdapterClass.sourceType,
      status: "pending",
      project,
      resultId: null,
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      // Activity tracking
      activity: [],
      currentStage: null,
      stageIndex: -1,
      totalStages: STAGES.length,
      stats: null,
      // Engine info
      engine: willUseBrowser ? browserManager.activeEngine?.name : "fetch",
    };
    this.jobs.push(job);
    return job;
  }

  async dispatch(url, project = "") {
    // Concurrency gate
    if (this._activeCount >= MAX_CONCURRENT) {
      await new Promise((resolve) => this._queue.push(resolve));
    }
    this._activeCount++;

    const AdapterClass = detectAdapter(url);
    let job = this.jobs.find((j) => j.url === url && j.status === "pending");
    if (!job) {
      job = this.createPendingJob(url, project);
    }

    job.status = "processing";
    job.activity = [];

    try {
      // Stage 1: Detect
      const browserManager = getBrowserManager();
      const engineName = (needsBrowser(url) && browserManager.isAvailable())
        ? browserManager.activeEngine?.name
        : "fetch";
      job.engine = engineName;

      log(job, "detect", `Source: ${AdapterClass.sourceType} · Engine: ${engineName}`);
      await tick();

      // Stage 2: Connect
      log(job, "connect", `Initializing ${AdapterClass.sourceType} adapter`);
      const adapter = new AdapterClass();
      await tick();

      // Stage 3-5: Fetch, Parse, Categorize
      log(job, "fetch", `Requesting content from ${truncateUrl(url)}`);
      const instructionSet = await adapter.scrape(url, { project });

      const actualEngine = instructionSet.meta?.engine || engineName;
      job.engine = actualEngine;

      log(job, "parse", `Found ${instructionSet.stats.totalEntries} entries via ${actualEngine}`);
      await tick();

      log(job, "categorize", `${instructionSet.stats.blockerCount || 0} blockers, ${instructionSet.stats.revisionCount || 0} changes, ${instructionSet.stats.imageCount || 0} images`);
      await tick();

      // Stage 6: Generate markdown
      log(job, "markdown", `Building agent instruction document`);
      const md = generateInstructionMd(instructionSet);
      await tick();

      // Stage 7: Save
      log(job, "save", `Writing to ${instructionSet.id}/`);
      await saveInstruction(instructionSet, this.outputDir, md);

      // Stage 8: Assets
      log(job, "assets", `Downloading ${instructionSet.stats.imageCount} images`);
      const assetResult = await adapter.downloadAssets(instructionSet, `${this.outputDir}/${instructionSet.id}`);
      if (assetResult.total > 0) {
        log(job, "assets", `Downloaded ${assetResult.downloaded}/${assetResult.total} assets`);
      }

      // Done
      log(job, "done", `Instruction set ready: ${instructionSet.title}`);
      job.resultId = instructionSet.id;
      job.status = "complete";
      job.stats = instructionSet.stats;
    } catch (err) {
      job.activity.push({
        stage: "error",
        label: "Error",
        message: err.message,
        timestamp: Date.now(),
      });
      job.error = err.message;
      job.status = "error";
    }

    job.completedAt = new Date().toISOString();

    // Release concurrency slot
    this._activeCount--;
    if (this._queue.length > 0) {
      const next = this._queue.shift();
      next();
    }

    return job;
  }

  async dispatchBatch(urls, project = "") {
    const results = await Promise.allSettled(
      urls.map((url) => this.dispatch(url, project))
    );
    return results.map((r) => (r.status === "fulfilled" ? r.value : r.reason));
  }

  getJobs() {
    return this.jobs;
  }

  getJob(id) {
    return this.jobs.find((j) => j.id === id);
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
