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

  embeddingQueue.on("failed", (job, err) => {
    console.error(`Embedding job ${job.id} failed:`, err.message);
  });

  console.log("Embedding worker ready");
}
