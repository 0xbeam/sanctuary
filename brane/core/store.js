import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

/**
 * File-based persistence for InstructionSets.
 * Maintains an index.json manifest and per-instruction folders.
 */

const INDEX_FILE = "index.json";

export async function loadIndex(outputDir) {
  try {
    const raw = await readFile(join(outputDir, INDEX_FILE), "utf-8");
    return JSON.parse(raw);
  } catch {
    return { instructions: [] };
  }
}

export async function saveIndex(outputDir, index) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, INDEX_FILE), JSON.stringify(index, null, 2), "utf-8");
}

export async function saveInstruction(instructionSet, outputDir, markdownContent) {
  const dir = join(outputDir, instructionSet.id);
  await mkdir(dir, { recursive: true });
  await mkdir(join(dir, "images"), { recursive: true });

  // Write the full instruction JSON
  await writeFile(join(dir, "instruction.json"), JSON.stringify(instructionSet, null, 2), "utf-8");

  // Write the markdown
  if (markdownContent) {
    const mdPath = join(dir, "instruction.md");
    await writeFile(mdPath, markdownContent, "utf-8");
    instructionSet.markdownPath = `${instructionSet.id}/instruction.md`;
  }

  // Update index
  const index = await loadIndex(outputDir);
  const existing = index.instructions.findIndex((i) => i.id === instructionSet.id);
  const entry = {
    id: instructionSet.id,
    source: instructionSet.source,
    sourceUrl: instructionSet.sourceUrl,
    project: instructionSet.project,
    title: instructionSet.title,
    scrapedAt: instructionSet.scrapedAt,
    path: instructionSet.id,
    stats: instructionSet.stats,
  };

  if (existing >= 0) {
    index.instructions[existing] = entry;
  } else {
    index.instructions.unshift(entry);
  }

  await saveIndex(outputDir, index);

  return dir;
}

export async function loadInstruction(outputDir, id) {
  const raw = await readFile(join(outputDir, id, "instruction.json"), "utf-8");
  return JSON.parse(raw);
}
