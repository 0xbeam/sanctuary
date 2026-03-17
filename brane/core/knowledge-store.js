import { readFile, writeFile, readdir, mkdir } from "fs/promises";
import { join, basename } from "path";
import { homedir } from "os";
import { generateId } from "./types.js";

const BRANE_DIR = join(homedir(), ".brane");
const KNOWLEDGE_DIR = join(BRANE_DIR, "knowledge");
const INDEX_PATH = join(KNOWLEDGE_DIR, "index.json");

/**
 * Load the knowledge index.
 * @returns {Promise<Object>}
 */
async function loadIndex() {
  try {
    const raw = await readFile(INDEX_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { entries: [] };
  }
}

/**
 * Save the knowledge index.
 * @param {Object} index
 */
async function saveIndex(index) {
  await mkdir(KNOWLEDGE_DIR, { recursive: true });
  await writeFile(INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
}

/**
 * Serialize frontmatter object to YAML block.
 * @param {Object} fm
 * @returns {string}
 */
function serializeFrontmatter(fm) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fm)) {
    if (value === null || value === undefined) {
      lines.push(`${key}: null`);
    } else if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(", ")}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

/**
 * Parse YAML frontmatter from a markdown string.
 * @param {string} content
 * @returns {{ frontmatter: Object, body: string }}
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const fm = {};
  const fmLines = match[1].split("\n");
  for (const line of fmLines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Parse arrays
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (value === "null") {
      value = null;
    } else if (value === "true") {
      value = true;
    } else if (value === "false") {
      value = false;
    } else if (!isNaN(Number(value)) && value !== "") {
      value = Number(value);
    }

    fm[key] = value;
  }

  return { frontmatter: fm, body: match[2].trim() };
}

/**
 * Add a new knowledge entry.
 * Writes a markdown file with YAML frontmatter and updates the index.
 * @param {Object} data - Knowledge data: { type, title, content, source, sourceTaskId, tags, project }
 * @returns {Promise<Object>} The created knowledge entry metadata
 */
export async function addKnowledge(data) {
  const now = new Date().toISOString();
  const id = generateId();

  const frontmatter = {
    id,
    type: data.type || "note",
    title: data.title || "Untitled",
    source: data.source || "manual",
    sourceTaskId: data.sourceTaskId || null,
    tags: data.tags || [],
    project: data.project || null,
    promotedTo: null,
    appliedCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const content = data.content || "";
  const fileContent = `${serializeFrontmatter(frontmatter)}\n\n# ${frontmatter.title}\n\n${content}\n`;

  await mkdir(KNOWLEDGE_DIR, { recursive: true });
  await writeFile(join(KNOWLEDGE_DIR, `${id}.md`), fileContent, "utf-8");

  // Update index
  const index = await loadIndex();
  index.entries.push({
    id,
    type: frontmatter.type,
    title: frontmatter.title,
    source: frontmatter.source,
    tags: frontmatter.tags,
    project: frontmatter.project,
    createdAt: now,
  });
  await saveIndex(index);

  return frontmatter;
}

/**
 * Get knowledge entries from the index, optionally filtered.
 * @param {Object} [filters] - { type, tags, project, source }
 * @returns {Promise<Object[]>}
 */
export async function getKnowledge(filters = {}) {
  const index = await loadIndex();
  let entries = index.entries || [];

  if (filters.type) {
    entries = entries.filter((e) => e.type === filters.type);
  }
  if (filters.source) {
    entries = entries.filter((e) => e.source === filters.source);
  }
  if (filters.project) {
    entries = entries.filter((e) => e.project === filters.project);
  }
  if (filters.tags && filters.tags.length > 0) {
    entries = entries.filter((e) =>
      filters.tags.some((t) => (e.tags || []).includes(t))
    );
  }

  return entries;
}

/**
 * Get a single knowledge entry by ID, including full content.
 * @param {string} id
 * @returns {Promise<Object|null>} { frontmatter, body } or null
 */
export async function getKnowledgeById(id) {
  try {
    const raw = await readFile(join(KNOWLEDGE_DIR, `${id}.md`), "utf-8");
    const { frontmatter, body } = parseFrontmatter(raw);
    return { ...frontmatter, content: body };
  } catch {
    return null;
  }
}

/**
 * Search knowledge by text query across title and tags.
 * @param {string} query - Search string
 * @returns {Promise<Object[]>} Matching index entries
 */
export async function searchKnowledge(query) {
  const index = await loadIndex();
  const q = query.toLowerCase();

  return (index.entries || []).filter((entry) => {
    const titleMatch = (entry.title || "").toLowerCase().includes(q);
    const tagMatch = (entry.tags || []).some((t) =>
      t.toLowerCase().includes(q)
    );
    return titleMatch || tagMatch;
  });
}

/**
 * Update a knowledge entry's frontmatter fields.
 * @param {string} id
 * @param {Object} patch - Fields to update in frontmatter
 * @returns {Promise<Object|null>}
 */
export async function updateKnowledge(id, patch) {
  const filePath = join(KNOWLEDGE_DIR, `${id}.md`);
  let raw;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }

  const { frontmatter, body } = parseFrontmatter(raw);
  const updated = { ...frontmatter, ...patch, updatedAt: new Date().toISOString() };

  const fileContent = `${serializeFrontmatter(updated)}\n\n${body}\n`;
  await writeFile(filePath, fileContent, "utf-8");

  // Update index entry too
  const index = await loadIndex();
  const idx = (index.entries || []).findIndex((e) => e.id === id);
  if (idx >= 0) {
    index.entries[idx] = {
      ...index.entries[idx],
      ...patch,
    };
    await saveIndex(index);
  }

  return updated;
}

/**
 * Promote a knowledge entry to a Claude skill.
 * Writes to ~/.claude/skills/{skillName}/SKILL.md
 * @param {string} id - Knowledge entry ID
 * @param {string} skillName - Name for the skill
 * @returns {Promise<string>} Path to the created SKILL.md
 */
export async function promoteToSkill(id, skillName) {
  const entry = await getKnowledgeById(id);
  if (!entry) throw new Error(`Knowledge entry ${id} not found`);

  const skillDir = join(homedir(), ".claude", "skills", skillName);
  await mkdir(skillDir, { recursive: true });

  const skillFrontmatter = serializeFrontmatter({
    name: skillName,
    version: "1.0.0",
    description: entry.title || "Skill promoted from knowledge base",
  });

  const skillContent = `${skillFrontmatter}\n\n${entry.content}\n`;
  const skillPath = join(skillDir, "SKILL.md");
  await writeFile(skillPath, skillContent, "utf-8");

  // Mark as promoted in knowledge
  await updateKnowledge(id, { promotedTo: `skill:${skillName}` });

  return skillPath;
}

/**
 * Promote a knowledge entry to a project instruction.
 * Appends content to {projectPath}/CLAUDE.md
 * @param {string} id - Knowledge entry ID
 * @param {string} projectPath - Absolute path to the project directory
 * @returns {Promise<string>} Path to the updated CLAUDE.md
 */
export async function promoteToInstruction(id, projectPath) {
  const entry = await getKnowledgeById(id);
  if (!entry) throw new Error(`Knowledge entry ${id} not found`);

  const claudeMdPath = join(projectPath, "CLAUDE.md");

  let existing = "";
  try {
    existing = await readFile(claudeMdPath, "utf-8");
  } catch {
    // File doesn't exist yet
  }

  const separator = existing ? "\n\n---\n\n" : "";
  const appendContent = `${separator}## ${entry.title || "Instruction"}\n\n${entry.content}\n`;

  await writeFile(claudeMdPath, existing + appendContent, "utf-8");

  // Mark as promoted
  await updateKnowledge(id, { promotedTo: `instruction:${projectPath}` });

  return claudeMdPath;
}

/**
 * Sync knowledge from scraped output directory.
 * Reads output/index.json and creates knowledge entries for any instruction
 * not already in the knowledge store.
 * @param {string} outputDir - Path to the scraper output directory
 * @returns {Promise<Object[]>} Newly created knowledge entries
 */
export async function syncFromScraped(outputDir) {
  let outputIndex;
  try {
    const raw = await readFile(join(outputDir, "index.json"), "utf-8");
    outputIndex = JSON.parse(raw);
  } catch {
    return [];
  }

  const existingKnowledge = await getKnowledge({ source: "scraped" });
  const existingSourceIds = new Set(
    existingKnowledge.map((e) => e.sourceTaskId || e.id)
  );

  const created = [];
  const instructions = outputIndex.instructions || [];

  for (const instruction of instructions) {
    if (existingSourceIds.has(instruction.id)) continue;

    // Try to read the instruction markdown
    let content = "";
    try {
      content = await readFile(
        join(outputDir, instruction.id, "instruction.md"),
        "utf-8"
      );
    } catch {
      content = instruction.title || "";
    }

    const entry = await addKnowledge({
      type: "instruction",
      title: instruction.title || instruction.id,
      content,
      source: "scraped",
      sourceTaskId: instruction.id,
      tags: [instruction.source || "unknown"],
      project: instruction.project || null,
    });

    created.push(entry);
  }

  return created;
}
