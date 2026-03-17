#!/usr/bin/env node

import { program } from "commander";
import { config } from "dotenv";
import { Dispatcher } from "../core/dispatch.js";
import { detectAdapter } from "../core/adapters/index.js";
import { SOURCE_LABELS } from "../core/types.js";

config();

const OUTPUT_DIR = process.env.OUTPUT_DIR || "./output";

program
  .name("brane")
  .description("Multi-source feedback → agent instruction markdown")
  .version("1.0.0");

program
  .command("scrape")
  .description("Scrape a URL and generate instruction markdown")
  .argument("<url>", "URL to scrape (Slack thread, Figma file, tweet, or any URL)")
  .option("-p, --project <name>", "Project name to tag the output")
  .option("-o, --output <dir>", "Output directory", OUTPUT_DIR)
  .action(async (url, opts) => {
    const AdapterClass = detectAdapter(url);
    console.log(`Detected source: ${SOURCE_LABELS[AdapterClass.sourceType]} (${AdapterClass.sourceType})`);

    const dispatcher = new Dispatcher(opts.output);
    const job = await dispatcher.dispatch(url, opts.project || "");

    if (job.status === "complete") {
      console.log(`\nDone!`);
      console.log(`  ID: ${job.resultId}`);
      console.log(`  Output: ${opts.output}/${job.resultId}/`);
    } else {
      console.error(`\nFailed: ${job.error}`);
      process.exit(1);
    }
  });

program
  .command("dispatch")
  .description("Dispatch multiple URLs in parallel")
  .argument("<urls...>", "URLs to scrape")
  .option("-p, --project <name>", "Project name")
  .option("-o, --output <dir>", "Output directory", OUTPUT_DIR)
  .action(async (urls, opts) => {
    console.log(`Dispatching ${urls.length} URLs in parallel...`);

    const dispatcher = new Dispatcher(opts.output);
    const jobs = await dispatcher.dispatchBatch(urls, opts.project || "");

    const complete = jobs.filter((j) => j.status === "complete");
    const errors = jobs.filter((j) => j.status === "error");

    console.log(`\nComplete: ${complete.length}/${jobs.length}`);
    for (const j of complete) {
      console.log(`  [OK] ${j.resultId} (${j.detectedSource})`);
    }
    for (const j of errors) {
      console.log(`  [ERR] ${j.url}: ${j.error}`);
    }
  });

program
  .command("list")
  .description("List all scraped instructions")
  .option("-o, --output <dir>", "Output directory", OUTPUT_DIR)
  .action(async (opts) => {
    const { loadIndex } = await import("../core/store.js");
    const index = await loadIndex(opts.output);

    if (index.instructions.length === 0) {
      console.log("No instructions scraped yet. Run: brane scrape <url>");
      return;
    }

    console.log(`\n${index.instructions.length} instruction(s):\n`);
    for (const inst of index.instructions) {
      const badges = [];
      if (inst.stats.blockerCount) badges.push(`${inst.stats.blockerCount} blockers`);
      if (inst.stats.revisionCount) badges.push(`${inst.stats.revisionCount} revisions`);
      if (inst.stats.imageCount) badges.push(`${inst.stats.imageCount} images`);

      console.log(`  [${inst.source.toUpperCase().padEnd(7)}] ${inst.title}`);
      if (inst.project) console.log(`           Project: ${inst.project}`);
      if (badges.length) console.log(`           ${badges.join(" | ")}`);
      console.log(`           ${inst.scrapedAt}`);
      console.log("");
    }
  });

program.parse();
