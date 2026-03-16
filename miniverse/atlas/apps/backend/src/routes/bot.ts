import { Router } from "express";
import { prisma } from "../server";
import { summarizeMeeting } from "@atlas/ai";
import { embeddingQueue } from "../ai/embedding-worker";

export const botRoutes = Router();

// Bot completion callback
botRoutes.post("/bot-done", async (req, res) => {
  const { jobId, meetingId, segments, recordingPath } = req.body;

  if (!meetingId || !segments) {
    return res.status(400).json({ error: "meetingId and segments required" });
  }

  // Save transcript segments
  await prisma.segment.createMany({
    data: segments.map((s: { speaker: string; text: string; startMs: number; endMs: number; source?: string }) => ({
      meetingId,
      speaker: s.speaker,
      text: s.text,
      startMs: s.startMs,
      endMs: s.endMs,
      source: s.source || "captions",
    })),
  });

  // Update meeting status
  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      status: "processing",
      endedAt: new Date(),
      recordingPath: recordingPath || null,
    },
  });

  // Generate summary
  const transcript = segments
    .map((s: { speaker: string; text: string }) => `${s.speaker}: ${s.text}`)
    .join("\n");

  try {
    const { summaryJson, summaryText } = await summarizeMeeting(transcript);

    const summary = await prisma.meetingSummary.create({
      data: { meetingId, summaryJson, summaryText },
    });

    // Extract action items from summary
    const aiActions = (summaryJson as { actionItems?: { text: string; assignee?: string; deadline?: string }[] }).actionItems || [];
    if (aiActions.length > 0) {
      await prisma.actionItem.createMany({
        data: aiActions.map((a) => ({
          meetingId,
          text: a.text,
          assignee: a.assignee || null,
          deadline: a.deadline || null,
        })),
      });
    }

    // Update meeting with title and participants from summary
    const parsed = summaryJson as { title?: string; attendees?: string[] };
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: "complete",
        title: parsed.title || null,
        participants: parsed.attendees || [],
        durationSeconds: segments.length > 0
          ? Math.round((segments[segments.length - 1].endMs - segments[0].startMs) / 1000)
          : null,
      },
    });

    // Queue embedding job
    embeddingQueue.add("embed-meeting", { meetingId });

    // Update job status
    if (jobId) {
      await prisma.meetingJob.update({
        where: { id: jobId },
        data: { status: "complete" },
      }).catch(() => {});
    }

    res.json({ status: "summarized", summaryId: summary.id });
  } catch (error) {
    console.error("Summarization failed:", error);

    await prisma.meeting.update({
      where: { id: meetingId },
      data: { status: "complete" },
    });

    res.json({ status: "transcript_saved" });
  }
});
