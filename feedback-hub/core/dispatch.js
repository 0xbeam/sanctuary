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
   * Dispatch a single URL for processing.
   * @param {string} url
   * @param {string} project
   * @returns {Promise<import('./types.js').DispatchJob>}
   */
  async dispatch(url, project = "") {
    const AdapterClass = detectAdapter(url);
    const job = {
      id: generateId(),
      url,
      detectedSource: AdapterClass.sourceType,
      status: "processing",
      project,
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    this.jobs.push(job);

    try {
      const adapter = new AdapterClass();
      const instructionSet = await adapter.scrape(url, { project });

      // Generate markdown
      const md = generateInstructionMd(instructionSet);

      // Save to disk
      await saveInstruction(instructionSet, this.outputDir, md);

      // Download assets
      await adapter.downloadAssets(instructionSet, `${this.outputDir}/${instructionSet.id}`);

      job.result = instructionSet;
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
   * @param {string[]} urls
   * @param {string} project
   * @returns {Promise<import('./types.js').DispatchJob[]>}
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
