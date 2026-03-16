import { Router } from "express";
import { prisma } from "../server";
import { embedText } from "@atlas/ai";

export const searchRoutes = Router();

searchRoutes.get("/api/search", async (req, res) => {
  const { q, type = "all" } = req.query;
  if (!q || typeof q !== "string") return res.status(400).json({ error: "Query required" });

  const results: {
    type: string;
    id: string;
    title: string;
    snippet: string;
    score: number;
    meetingId?: string;
    timestamp?: string;
  }[] = [];

  // Full-text search on segments
  if (type === "all" || type === "meetings") {
    const segments = await prisma.segment.findMany({
      where: { text: { contains: q, mode: "insensitive" } },
      include: { meeting: { select: { id: true, title: true, startedAt: true } } },
      take: 20,
    });

    for (const seg of segments) {
      results.push({
        type: "segment",
        id: seg.id,
        title: seg.meeting.title || "Untitled meeting",
        snippet: highlightSnippet(seg.text, q),
        score: 1,
        meetingId: seg.meetingId,
        timestamp: seg.meeting.startedAt?.toISOString(),
      });
    }

    // Also search meeting titles and summaries
    const meetings = await prisma.meeting.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { summaries: { some: { summaryText: { contains: q, mode: "insensitive" } } } },
        ],
      },
      include: { summaries: { take: 1 } },
      take: 10,
    });

    for (const m of meetings) {
      results.push({
        type: "meeting",
        id: m.id,
        title: m.title || "Untitled meeting",
        snippet: m.summaries[0]?.summaryText.slice(0, 200) || "",
        score: 2,
        meetingId: m.id,
        timestamp: m.startedAt?.toISOString(),
      });
    }
  }

  // Search action items
  if (type === "all" || type === "action_items") {
    const items = await prisma.actionItem.findMany({
      where: { text: { contains: q, mode: "insensitive" } },
      include: { meeting: { select: { id: true, title: true, startedAt: true } } },
      take: 10,
    });

    for (const item of items) {
      results.push({
        type: "action_item",
        id: item.id,
        title: item.text,
        snippet: `${item.assignee ? `@${item.assignee}` : "Unassigned"} — ${item.status}`,
        score: 1,
        meetingId: item.meetingId,
        timestamp: item.meeting.startedAt?.toISOString(),
      });
    }
  }

  // Vector search for semantic matches
  try {
    const queryVector = await embedText(q);
    const vectorStr = `[${queryVector.join(",")}]`;

    const vectorResults: { id: string; source_type: string; source_id: string; content: string; dist: number }[] =
      await prisma.$queryRawUnsafe(
        `SELECT id, "sourceType" as source_type, "sourceId" as source_id, content,
                vector <=> $1::vector as dist
         FROM "Embedding"
         ORDER BY vector <=> $1::vector
         LIMIT 10`,
        vectorStr
      );

    for (const vr of vectorResults) {
      // Avoid duplicates from text search
      if (!results.find((r) => r.id === vr.source_id)) {
        results.push({
          type: vr.source_type,
          id: vr.source_id,
          title: vr.content.slice(0, 60),
          snippet: vr.content.slice(0, 200),
          score: 1 - vr.dist,
        });
      }
    }
  } catch {
    // pgvector not available
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  res.json(results.slice(0, 30));
});

function highlightSnippet(text: string, query: string): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 200);
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + query.length + 60);
  return (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");
}
