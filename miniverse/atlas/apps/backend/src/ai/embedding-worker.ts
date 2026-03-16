import Queue from "bull";
import { prisma } from "../server";
import { embedBatch, chunkText } from "@atlas/ai";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
export const embeddingQueue = new Queue("embeddings", REDIS_URL);

export function setupEmbeddingWorker() {
  embeddingQueue.process("embed-meeting", async (job) => {
    const { meetingId } = job.data;
    console.log(`Embedding meeting ${meetingId}...`);

    // Get all segments for the meeting
    const segments = await prisma.segment.findMany({
      where: { meetingId },
      orderBy: { startMs: "asc" },
    });

    if (segments.length === 0) return;

    // Chunk the transcript into ~500-token pieces
    const fullTranscript = segments.map((s) => `${s.speaker}: ${s.text}`).join("\n");
    const chunks = chunkText(fullTranscript);

    // Embed all chunks
    const vectors = await embedBatch(chunks);

    // Store embeddings
    for (let i = 0; i < chunks.length; i++) {
      const vectorStr = `[${vectors[i].join(",")}]`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Embedding" (id, "sourceType", "sourceId", content, vector, "createdAt")
         VALUES (gen_random_uuid(), 'segment', $1, $2, $3::vector, NOW())`,
        meetingId,
        chunks[i],
        vectorStr
      );
    }

    // Also embed the summary if available
    const summary = await prisma.meetingSummary.findFirst({ where: { meetingId } });
    if (summary) {
      const summaryVectors = await embedBatch([summary.summaryText]);
      const vectorStr = `[${summaryVectors[0].join(",")}]`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Embedding" (id, "sourceType", "sourceId", content, vector, "createdAt")
         VALUES (gen_random_uuid(), 'summary', $1, $2, $3::vector, NOW())`,
        meetingId,
        summary.summaryText,
        vectorStr
      );
    }

    console.log(`Embedded ${chunks.length} chunks for meeting ${meetingId}`);
  });

  // Embed context events — groups 15-min windows into activity summaries
  embeddingQueue.process("embed-context", async (job) => {
    const { since } = job.data; // ISO timestamp
    console.log(`Embedding context events since ${since}...`);

    const events = await prisma.contextEvent.findMany({
      where: { timestamp: { gte: new Date(since) } },
      orderBy: { timestamp: "asc" },
    });

    if (events.length === 0) return;

    // Group into 15-minute windows
    const windows: { start: Date; end: Date; events: typeof events }[] = [];
    let currentWindow: (typeof windows)[0] | null = null;

    for (const event of events) {
      const ts = new Date(event.timestamp);
      if (!currentWindow || ts.getTime() - currentWindow.start.getTime() > 15 * 60 * 1000) {
        currentWindow = { start: ts, end: ts, events: [event] };
        windows.push(currentWindow);
      } else {
        currentWindow.end = ts;
        currentWindow.events.push(event);
      }
    }

    // Summarize each window into a text chunk
    const summaries: string[] = [];
    for (const w of windows) {
      const appTime: Record<string, number> = {};
      const titles: string[] = [];

      for (const e of w.events) {
        appTime[e.appName] = (appTime[e.appName] || 0) + (e.durationSecs || 5);
        if (e.windowTitle && !titles.includes(e.windowTitle)) titles.push(e.windowTitle);
        if (e.tabTitle && !titles.includes(e.tabTitle)) titles.push(e.tabTitle);
      }

      const topApps = Object.entries(appTime)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([app, secs]) => `${app} (${Math.round(secs / 60)}min)`)
        .join(", ");

      const time = w.start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      const date = w.start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const contextTitles = titles.slice(0, 8).join("; ");

      summaries.push(
        `[${date} ${time}] Active apps: ${topApps}. Windows: ${contextTitles || "none captured"}`
      );
    }

    // Embed all summaries
    if (summaries.length > 0) {
      const vectors = await embedBatch(summaries);

      for (let i = 0; i < summaries.length; i++) {
        const vectorStr = `[${vectors[i].join(",")}]`;
        await prisma.$executeRawUnsafe(
          `INSERT INTO "Embedding" (id, "sourceType", "sourceId", content, vector, "createdAt")
           VALUES (gen_random_uuid(), 'context_event', $1, $2, $3::vector, NOW())`,
          windows[i].events[0].id,
          summaries[i],
          vectorStr
        );
      }
    }

    console.log(`Embedded ${summaries.length} context windows from ${events.length} events`);
  });

  // Schedule hourly context embedding
  embeddingQueue.add(
    "embed-context",
    { since: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
    { repeat: { every: 60 * 60 * 1000 }, jobId: "context-embed-hourly" }
  );

  embeddingQueue.on("failed", (job, err) => {
    console.error(`Embedding job ${job.id} failed:`, err.message);
  });

  console.log("Embedding worker ready");
}
