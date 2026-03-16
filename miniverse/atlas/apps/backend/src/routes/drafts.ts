import { Router } from "express";
import { prisma } from "../server";
import { generateDraft } from "@atlas/ai";

export const draftRoutes = Router();

// List drafts
draftRoutes.get("/api/drafts", async (_req, res) => {
  const drafts = await prisma.draft.findMany({
    include: { meeting: { select: { id: true, title: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(drafts);
});

// Get single draft
draftRoutes.get("/api/drafts/:id", async (req, res) => {
  const draft = await prisma.draft.findUnique({ where: { id: req.params.id } });
  if (!draft) return res.status(404).json({ error: "Draft not found" });
  res.json(draft);
});

// Generate a draft from meeting context
draftRoutes.post("/api/drafts/generate", async (req, res) => {
  const { type, meetingId, prompt } = req.body;

  let summary = "";
  let actionItemsText = "";
  let attendees = "";
  let title = `New ${type.replace(/_/g, " ")}`;

  if (meetingId) {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { summaries: { take: 1 }, actionItems: true },
    });

    if (meeting) {
      title = `${type.replace(/_/g, " ")} — ${meeting.title || "Meeting"}`;
      attendees = meeting.participants.join(", ");

      if (meeting.summaries[0]) {
        summary = meeting.summaries[0].summaryText;
      }

      actionItemsText = meeting.actionItems
        .map((a) => `- ${a.text}${a.assignee ? ` (@${a.assignee})` : ""}${a.deadline ? ` [due: ${a.deadline}]` : ""}`)
        .join("\n");
    }
  }

  const content = await generateDraft(type, { summary, actionItems: actionItemsText, attendees, prompt });

  const draft = await prisma.draft.create({
    data: { meetingId, type, title, content },
  });

  res.json(draft);
});

// Update draft
draftRoutes.patch("/api/drafts/:id", async (req, res) => {
  const draft = await prisma.draft.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json(draft);
});
