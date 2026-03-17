import { CATEGORY_LABELS } from "./types.js";

const CATEGORY_ICONS = {
  approval: "[OK]",
  revision: "[CHANGE]",
  question: "[?]",
  blocker: "[!!]",
  context: "[i]",
};

function cleanSlackMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, "**$1**")
    .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, "[$2]($1)")
    .replace(/<(https?:\/\/[^>]+)>/g, "$1")
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
    .replace(/```([^`]+)```/g, "\n```\n$1\n```\n");
}

function formatTimestamp(ts) {
  try {
    return new Date(ts).toISOString().replace("T", " ").slice(0, 16);
  } catch {
    return ts;
  }
}

/**
 * Generate instruction markdown from a unified InstructionSet.
 * @param {import('./types.js').InstructionSet} set
 * @returns {string}
 */
export function generateInstructionMd(set) {
  const lines = [];
  const { root, replies, stats } = set;

  // Frontmatter
  lines.push("---");
  lines.push(`source: ${set.source}`);
  lines.push(`source_url: ${set.sourceUrl}`);
  lines.push(`scraped_at: ${set.scrapedAt}`);
  if (set.project) lines.push(`project: ${set.project}`);
  lines.push(`total_entries: ${stats.totalEntries}`);
  lines.push(`images: ${stats.imageCount}`);
  lines.push("---");
  lines.push("");

  // Title
  lines.push(`# ${set.title}`);
  lines.push("");

  // Context
  lines.push("## Context");
  lines.push("");
  lines.push(`**Posted by:** ${root.author} — ${formatTimestamp(root.timestamp)}`);
  lines.push(`**Source:** ${set.source} — [Original](${set.sourceUrl})`);
  lines.push("");
  lines.push(cleanSlackMarkdown(root.text));
  lines.push("");

  if (root.attachments.length > 0) {
    lines.push("### Reference Assets");
    lines.push("");
    for (const att of root.attachments) {
      const path = att.localPath || `images/${att.name}`;
      if (att.type === "image") {
        lines.push(`![${att.title}](./${path})`);
        lines.push(`> ${att.title}`);
      } else {
        lines.push(`- [${att.title}](./${path})`);
      }
    }
    lines.push("");
  }

  // Blockers
  const blockers = replies.filter((r) => r.category === "blocker");
  if (blockers.length > 0) {
    lines.push("## Blockers");
    lines.push("");
    for (const b of blockers) {
      lines.push(`> **${CATEGORY_ICONS.blocker} ${b.author}:** ${cleanSlackMarkdown(b.text)}`);
      renderAttachments(lines, b.attachments);
    }
    lines.push("");
  }

  // Revisions
  const revisions = replies.filter((r) => r.category === "revision");
  if (revisions.length > 0) {
    lines.push("## Required Changes");
    lines.push("");
    for (let i = 0; i < revisions.length; i++) {
      lines.push(`${i + 1}. **${revisions[i].author}:** ${cleanSlackMarkdown(revisions[i].text)}`);
      renderAttachments(lines, revisions[i].attachments);
    }
    lines.push("");
  }

  // Questions
  const questions = replies.filter((r) => r.category === "question");
  if (questions.length > 0) {
    lines.push("## Open Questions");
    lines.push("");
    for (const q of questions) {
      lines.push(`- **${q.author}:** ${cleanSlackMarkdown(q.text)}`);
    }
    lines.push("");
  }

  // Approvals
  const approvals = replies.filter((r) => r.category === "approval");
  if (approvals.length > 0) {
    lines.push("## Approvals");
    lines.push("");
    for (const a of approvals) {
      lines.push(`- **${a.author}:** ${cleanSlackMarkdown(a.text) || "Approved"}`);
    }
    lines.push("");
  }

  // Full thread
  lines.push("## Full Thread");
  lines.push("");
  lines.push("<details>");
  lines.push(`<summary>Expand full conversation (${stats.totalEntries} entries)</summary>`);
  lines.push("");
  for (const entry of set.allEntries) {
    const tag = CATEGORY_ICONS[entry.category] || "";
    lines.push(`**${entry.author}** ${tag} — _${formatTimestamp(entry.timestamp)}_`);
    lines.push(cleanSlackMarkdown(entry.text));
    renderAttachments(lines, entry.attachments);
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  lines.push("</details>");
  lines.push("");

  // Agent Instructions
  lines.push("## Agent Instructions");
  lines.push("");
  lines.push("Use this section as your primary directive when working on this feedback.");
  lines.push("");

  if (blockers.length > 0) {
    lines.push("### Must Fix (Blockers)");
    lines.push("");
    for (const b of blockers) {
      lines.push(`- [ ] ${cleanSlackMarkdown(b.text)} _(${b.author})_`);
    }
    lines.push("");
  }

  if (revisions.length > 0) {
    lines.push("### Changes Requested");
    lines.push("");
    for (const r of revisions) {
      lines.push(`- [ ] ${cleanSlackMarkdown(r.text)} _(${r.author})_`);
    }
    lines.push("");
  }

  if (questions.length > 0) {
    lines.push("### Clarify Before Proceeding");
    lines.push("");
    for (const q of questions) {
      lines.push(`- [ ] ${cleanSlackMarkdown(q.text)} _(${q.author})_`);
    }
    lines.push("");
  }

  if (stats.imageCount > 0) {
    lines.push("### Reference Images");
    lines.push("");
    lines.push("Review all images in the `./images/` folder — they contain visual context for the changes above.");
    lines.push("");
  }

  return lines.join("\n");
}

function renderAttachments(lines, attachments) {
  for (const att of attachments || []) {
    const path = att.localPath || `images/${att.name}`;
    if (att.type === "image") {
      lines.push(`  ![${att.title}](./${path})`);
    } else {
      lines.push(`  - Attachment: [${att.title}](./${path})`);
    }
  }
}
