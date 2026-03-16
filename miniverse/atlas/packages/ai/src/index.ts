import OpenAI from "openai";

const openai = new OpenAI();

// ─── Embeddings ───

export async function embedText(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
    input: text,
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || "1536"),
  });
  return res.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  // OpenAI supports up to 2048 inputs per batch
  const res = await openai.embeddings.create({
    model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
    input: texts,
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || "1536"),
  });
  return res.data.map((d) => d.embedding);
}

// ─── Text Chunking ───

export function chunkText(text: string, maxTokens = 500, overlap = 50): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  // Rough approximation: 1 token ≈ 0.75 words
  const wordsPerChunk = Math.floor(maxTokens * 0.75);
  const overlapWords = Math.floor(overlap * 0.75);

  for (let i = 0; i < words.length; i += wordsPerChunk - overlapWords) {
    const chunk = words.slice(i, i + wordsPerChunk).join(" ");
    if (chunk.trim()) chunks.push(chunk);
    if (i + wordsPerChunk >= words.length) break;
  }
  return chunks;
}

// ─── Summarization ───

export async function summarizeMeeting(transcript: string): Promise<{
  summaryJson: Record<string, unknown>;
  summaryText: string;
}> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a meeting summarizer. Given a transcript, produce a JSON object with:
- title: string (concise meeting title)
- attendees: string[] (names mentioned)
- topics: string[] (key topics discussed)
- decisions: string[] (decisions made)
- actionItems: array of { text: string, assignee: string|null, deadline: string|null }
- executiveSummary: string (2-3 sentence overview)`,
      },
      { role: "user", content: transcript },
    ],
  });

  const json = JSON.parse(res.choices[0].message.content || "{}");
  const text = formatPlainText(json);
  return { summaryJson: json, summaryText: text };
}

function formatPlainText(json: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`# ${json.title || "Meeting Summary"}\n`);
  lines.push(`## Executive Summary\n${json.executiveSummary}\n`);

  if (Array.isArray(json.topics) && json.topics.length) {
    lines.push(`## Topics\n${json.topics.map((t: string) => `- ${t}`).join("\n")}\n`);
  }
  if (Array.isArray(json.decisions) && json.decisions.length) {
    lines.push(`## Decisions\n${json.decisions.map((d: string) => `- ${d}`).join("\n")}\n`);
  }
  if (Array.isArray(json.actionItems) && json.actionItems.length) {
    lines.push(
      `## Action Items\n${json.actionItems
        .map((a: { text: string; assignee?: string; deadline?: string }) => {
          let item = `- ${a.text}`;
          if (a.assignee) item += ` (@${a.assignee})`;
          if (a.deadline) item += ` [due: ${a.deadline}]`;
          return item;
        })
        .join("\n")}\n`
    );
  }
  return lines.join("\n");
}

// ─── RAG Chat ───

export async function chatWithContext(
  question: string,
  context: string[],
  history: { role: "user" | "assistant"; content: string }[]
): Promise<ReadableStream | string> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    stream: true,
    messages: [
      {
        role: "system",
        content: `You are Atlas, an AI work assistant. Answer questions using the provided context from meetings, transcripts, and work activity. Be concise and cite sources when possible. If you don't have enough context, say so.

## Context
${context.map((c, i) => `[${i + 1}] ${c}`).join("\n\n")}`,
      },
      ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: question },
    ],
  });

  return res.toReadableStream();
}

// ─── Routine Generation ───

export async function generateBriefing(
  template: "daily_briefing" | "weekly_digest",
  data: {
    meetings?: string;
    actionItems?: string;
    contextSummary?: string;
  }
): Promise<string> {
  const prompts = {
    daily_briefing: `Generate a concise daily briefing based on today's data. Include:
- Meeting highlights and key decisions
- Action items due today or overdue
- Work activity summary
Format as clean markdown.`,
    weekly_digest: `Generate a weekly digest. Include:
- This week's meetings and outcomes
- Action item progress (completed, pending, new)
- Key decisions made this week
- Time allocation summary
Format as clean markdown.`,
  };

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: prompts[template] },
      {
        role: "user",
        content: `Meetings:\n${data.meetings || "None"}\n\nAction Items:\n${data.actionItems || "None"}\n\nActivity:\n${data.contextSummary || "None"}`,
      },
    ],
  });

  return res.choices[0].message.content || "";
}

// ─── Draft Generation ───

export async function generateDraft(
  type: string,
  context: { summary?: string; actionItems?: string; attendees?: string; prompt?: string }
): Promise<string> {
  const templates: Record<string, string> = {
    follow_up_email: `Write a professional follow-up email based on this meeting. Include a brief recap, action items, and next steps. Keep it concise.`,
    meeting_notes: `Create structured meeting notes from this data. Include attendees, key discussion points, decisions, and action items.`,
    project_plan: `Create a project plan based on the action items and decisions from this meeting. Include phases, owners, and timelines.`,
  };

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: templates[type] || templates.meeting_notes },
      {
        role: "user",
        content: `Summary:\n${context.summary || ""}\n\nAction Items:\n${context.actionItems || ""}\n\nAttendees:\n${context.attendees || ""}\n\n${context.prompt ? `Additional instructions: ${context.prompt}` : ""}`,
      },
    ],
  });

  return res.choices[0].message.content || "";
}
