import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

const VAULT_PATH = join(homedir(), "Documents", "Vault");
const PROJECTS = join(VAULT_PATH, "01-Projects");
const RESOURCES = join(VAULT_PATH, "03-Resources");
const AGENT_LIB = join(RESOURCES, "Agent-Library");
const PATTERNS = join(RESOURCES, "Patterns");
const SESSIONS = join(VAULT_PATH, "Dev", "Sessions");
const TASKS_DIR = join(PROJECTS, "brane-tasks");

/**
 * Slugify a string for filenames.
 */
function slugify(str) {
  return (str || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * Format a date for frontmatter.
 */
function formatDate(ts) {
  const d = ts ? new Date(ts) : new Date();
  return d.toISOString().split("T")[0];
}

/**
 * Sync an agent to the vault (update brane-agents.md index).
 */
export async function syncAgent(agent) {
  if (!agent || !agent.id) return;
  await mkdir(AGENT_LIB, { recursive: true });

  const indexPath = join(AGENT_LIB, "brane-agents.md");
  let content;

  try {
    content = await readFile(indexPath, "utf-8");
  } catch {
    // Create new index
    content = `---
date: ${formatDate()}
tags: [resource, ai, agents, catalog]
type: catalog
status: active
last_edited_by: brane
---

# Brane Agents

Live index of agents registered with the Brane control plane. Auto-updated.

| Name | Status | Branch | CWD | Last Seen |
|------|--------|--------|-----|-----------|
`;
  }

  const name = agent.name || agent.slug || agent.id.slice(0, 8);
  const branch = agent.branch || agent.gitBranch || "—";
  const cwd = agent.cwd ? agent.cwd.split("/").slice(-2).join("/") : "—";
  const lastSeen = agent.lastSeen ? formatDate(agent.lastSeen) : "—";
  const row = `| ${name} | ${agent.status || "unknown"} | ${branch} | ${cwd} | ${lastSeen} |`;

  // Check if agent already in table (by id in a comment or name match)
  const marker = `<!-- agent:${agent.id} -->`;
  if (content.includes(marker)) {
    // Replace existing row
    const regex = new RegExp(`${marker}.*\n`, "g");
    content = content.replace(regex, `${marker} ${row}\n`);
  } else {
    // Append new row
    content = content.trimEnd() + `\n${marker} ${row}\n`;
  }

  // Update date
  content = content.replace(/date: \d{4}-\d{2}-\d{2}/, `date: ${formatDate()}`);

  await writeFile(indexPath, content, "utf-8");
}

/**
 * Sync a task to the vault (create/update task page in brane-tasks/).
 */
export async function syncTask(task) {
  if (!task || !task.id) return;
  await mkdir(TASKS_DIR, { recursive: true });

  const slug = slugify(task.title || task.type || task.id);
  const filePath = join(TASKS_DIR, `${slug}-${task.id.slice(0, 6)}.md`);

  const agentLink = task.agentId ? `[[brane-agents|${task.agentId.slice(0, 8)}]]` : "unassigned";
  const branchInfo = task.gitBranch ? `\`${task.gitBranch}\`` : "—";

  const content = `---
date: ${formatDate(task.createdAt)}
tags: [project, brane, task, ${task.type || "custom"}]
type: task
status: ${task.status || "queued"}
brane_id: ${task.id}
last_edited_by: brane
---

# ${task.title || "Untitled Task"}

**Type:** ${task.type || "custom"}
**Status:** ${task.status || "queued"}
**Priority:** ${task.priority || "p2"}
**Agent:** ${agentLink}
**Branch:** ${branchInfo}
**Project:** [[brane]]

## Description

${task.description || "No description provided."}

## Activity

${(task.activity || []).map(a => `- **${a.label}** — ${a.message} (${new Date(a.timestamp).toLocaleString()})`).join("\n") || "No activity yet."}

${task.output ? `## Output\n\n\`\`\`json\n${JSON.stringify(task.output, null, 2)}\n\`\`\`` : ""}
`;

  await writeFile(filePath, content, "utf-8");
}

/**
 * Sync a knowledge entry to the vault (write to Patterns/).
 */
export async function syncKnowledge(entry) {
  if (!entry || !entry.id) return;
  await mkdir(PATTERNS, { recursive: true });

  const slug = slugify(entry.title || entry.id);
  const filePath = join(PATTERNS, `${slug}.md`);

  const tags = (entry.tags || []).map(t => `#${t}`).join(" ");
  const projectLink = entry.project ? `[[${entry.project}]]` : "[[brane]]";

  const content = `---
date: ${formatDate(entry.createdAt)}
tags: [resource, pattern, ${entry.type || "knowledge"}, ${(entry.tags || []).join(", ")}]
type: pattern
source: ${entry.source || "scraped"}
brane_id: ${entry.id}
last_edited_by: brane
---

# ${entry.title || "Untitled Knowledge"}

**Source:** ${entry.source || "unknown"}
**Project:** ${projectLink}
**Tags:** ${tags || "none"}

${entry.content || entry.description || "No content available."}

## Related

- [[brane]] — source control plane
${entry.promotedTo ? `- Promoted to: \`${entry.promotedTo}\`` : ""}
`;

  await writeFile(filePath, content, "utf-8");
}

/**
 * Add a row to the skills catalog when a skill is promoted.
 */
export async function syncSkill(skill) {
  if (!skill || !skill.name) return;

  const catalogPath = join(AGENT_LIB, "skills-catalog.md");
  let content;

  try {
    content = await readFile(catalogPath, "utf-8");
  } catch {
    return; // Don't create if it doesn't exist
  }

  const marker = `<!-- brane-skill:${skill.name} -->`;
  const row = `| ${skill.name} | — | ${skill.description || "Brane-generated skill"} | \`${skill.path || "~/.claude/skills/" + skill.name}\` |`;

  if (content.includes(marker)) {
    const regex = new RegExp(`${marker}.*\n`, "g");
    content = content.replace(regex, `${marker} ${row}\n`);
  } else {
    // Find the "Standalone Skills" section or append at end
    const insertPoint = content.indexOf("## Claude Code — Standalone Skills");
    if (insertPoint !== -1) {
      // Find the table after this header
      const afterHeader = content.indexOf("|---", insertPoint);
      if (afterHeader !== -1) {
        const lineEnd = content.indexOf("\n", afterHeader);
        content = content.slice(0, lineEnd + 1) + `${marker} ${row}\n` + content.slice(lineEnd + 1);
      }
    } else {
      content = content.trimEnd() + `\n\n## Brane-Generated Skills\n\n| Name | Version | What It Does | Path |\n|------|---------|-------------|------|\n${marker} ${row}\n`;
    }
  }

  await writeFile(catalogPath, content, "utf-8");
}

/**
 * Write a daily session summary.
 */
export async function syncSessionSummary(summary) {
  await mkdir(SESSIONS, { recursive: true });

  const date = formatDate();
  const slug = slugify(summary.title || "brane-session");
  const filePath = join(SESSIONS, `${date}-${slug}.md`);

  const content = `---
date: ${date}
tags: [session, brane, ai]
type: session
last_edited_by: brane
---

# ${summary.title || "Brane Session"} — ${date}

${summary.body || ""}

## Agents Active

${(summary.agents || []).map(a => `- ${a.name || a.id} (${a.status})`).join("\n") || "None tracked."}

## Tasks Completed

${(summary.completedTasks || []).map(t => `- ${t.title} (${t.type})`).join("\n") || "None."}

## Related

- [[brane]]
`;

  await writeFile(filePath, content, "utf-8");
}

/**
 * Update the main brane project page with live stats.
 */
export async function updateProjectPage(stats) {
  const projectPath = join(PROJECTS, "brane.md");
  let content;

  try {
    content = await readFile(projectPath, "utf-8");
  } catch {
    return; // Don't create if it doesn't exist
  }

  // Find or create a Live Stats section
  const statsSection = `\n## Live Stats (auto-updated)\n\n- **Active Agents:** ${stats.activeAgents || 0}\n- **Total Agents:** ${stats.totalAgents || 0}\n- **Queued Tasks:** ${stats.queuedTasks || 0}\n- **Running Tasks:** ${stats.runningTasks || 0}\n- **Knowledge Entries:** ${stats.knowledgeCount || 0}\n- **Last Sync:** ${formatDate()}\n`;

  const marker = "## Live Stats (auto-updated)";
  if (content.includes(marker)) {
    // Replace existing section (up to next ## or end of file)
    const start = content.indexOf(marker);
    const nextSection = content.indexOf("\n## ", start + marker.length);
    if (nextSection !== -1) {
      content = content.slice(0, start) + statsSection.trim() + "\n\n" + content.slice(nextSection + 1);
    } else {
      content = content.slice(0, start) + statsSection.trim() + "\n";
    }
  } else {
    // Append before "## Related" if it exists, otherwise at end
    const relatedIdx = content.indexOf("## Related");
    if (relatedIdx !== -1) {
      content = content.slice(0, relatedIdx) + statsSection + "\n" + content.slice(relatedIdx);
    } else {
      content = content.trimEnd() + "\n" + statsSection;
    }
  }

  await writeFile(projectPath, content, "utf-8");
}

/**
 * Full sync — sync everything to the vault.
 * Called on startup and periodically.
 */
export async function fullSync(agents = [], tasks = [], knowledge = []) {
  try {
    // Sync agents index
    for (const agent of agents) {
      await syncAgent(agent);
    }

    // Sync recent tasks (last 50)
    const recentTasks = tasks.slice(-50);
    for (const task of recentTasks) {
      await syncTask(task);
    }

    // Sync knowledge
    for (const entry of knowledge) {
      await syncKnowledge(entry);
    }

    // Update project page stats
    const activeAgents = agents.filter(a => a.status === "active").length;
    const queuedTasks = tasks.filter(t => t.status === "queued").length;
    const runningTasks = tasks.filter(t => t.status === "running").length;

    await updateProjectPage({
      activeAgents,
      totalAgents: agents.length,
      queuedTasks,
      runningTasks,
      knowledgeCount: knowledge.length,
    });

    return { synced: true, agents: agents.length, tasks: recentTasks.length, knowledge: knowledge.length };
  } catch (err) {
    return { synced: false, error: err.message };
  }
}
