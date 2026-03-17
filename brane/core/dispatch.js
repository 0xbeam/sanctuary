import { detectAdapter } from "./adapters/index.js";
import { generateInstructionMd } from "./markdown-generator.js";
import { saveInstruction } from "./store.js";
import { generateId } from "./types.js";

/**
 * Dispatcher — auto-detects adapters and processes URLs in parallel.
 */
export class Dispatcher {
  constructor(outputDir) {
    this.outputDir = outputDir;
    /** @type {import('./types.js').DispatchJob[]} */
    this.jobs = [];
  }

  /**
   * Create a pending job stub (returned to client immediately).
   */
  createPendingJob(url, project = "") {
    const AdapterClass = detectAdapter(url);
    const existing = this.jobs.find((j) => j.url === url && j.status === "pending");
    if (existing) return existing;

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
    };
    this.jobs.push(job);
    return job;
  }

  /**
   * Dispatch a single URL for processing.
   */
  async dispatch(url, project = "") {
    const AdapterClass = detectAdapter(url);

    // Find existing pending job or create new one
    let job = this.jobs.find((j) => j.url === url && j.status === "pending");
    if (!job) {
      job = {
        id: generateId(),
        url,
        detectedSource: AdapterClass.sourceType,
        status: "processing",
        project,
        resultId: null,
        error: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
      };
      this.jobs.push(job);
    }

    job.status = "processing";

    try {
      const adapter = new AdapterClass();
      const instructionSet = await adapter.scrape(url, { project });

      // Generate markdown
      const md = generateInstructionMd(instructionSet);

      // Save to disk
      await saveInstruction(instructionSet, this.outputDir, md);

      // Download assets
      await adapter.downloadAssets(instructionSet, `${this.outputDir}/${instructionSet.id}`);

      job.resultId = instructionSet.id;
      job.status = "complete";
    } catch (err) {
      job.error = err.message;
      job.status = "error";
    }

    job.completedAt = new Date().toISOString();
    return job;
  }

  /**
   * Dispatch multiple URLs in parallel.
   */
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
