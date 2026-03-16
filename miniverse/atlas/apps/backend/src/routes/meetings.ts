import { Router } from "express";
import { prisma } from "../server";

export const meetingRoutes = Router();

// List meetings
meetingRoutes.get("/api/meetings", async (req, res) => {
  const { status, limit = "50", offset = "0" } = req.query;

  const meetings = await prisma.meeting.findMany({
    where: status ? { status: status as string } : undefined,
    include: {
      summaries: true,
      _count: { select: { segments: true, actionItems: true } },
    },
    orderBy: { startedAt: { sort: "desc", nulls: "last" } },
    take: parseInt(limit as string),
    skip: parseInt(offset as string),
  });

  res.json(meetings);
});

// Get single meeting with all data
meetingRoutes.get("/api/meetings/:id", async (req, res) => {
  const meeting = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    include: {
      segments: { orderBy: { startMs: "asc" } },
      summaries: true,
      actionItems: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!meeting) return res.status(404).json({ error: "Meeting not found" });
  res.json(meeting);
});

// Submit a Google Meet link manually
meetingRoutes.post("/submit-link", async (req, res) => {
  const { url } = req.body;
  if (!url || !url.includes("meet.google.com")) {
    return res.status(400).json({ error: "Invalid Google Meet URL" });
  }

  const meeting = await prisma.meeting.create({
    data: {
      meetUrl: url,
      status: "scheduled",
    },
  });

  const job = await prisma.meetingJob.create({
    data: { meetingId: meeting.id, status: "queued" },
  });

  // TODO: Launch bot container via Dockerode
  res.json({ meetingId: meeting.id, jobId: job.id, message: "Bot queued" });
});
