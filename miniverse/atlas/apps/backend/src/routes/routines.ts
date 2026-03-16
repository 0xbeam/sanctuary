import { Router } from "express";
import { prisma } from "../server";
import { generateBriefing } from "@atlas/ai";
import { embeddingQueue } from "../ai/embedding-worker";

export const routineRoutes = Router();

// List routines
routineRoutes.get("/api/routines", async (_req, res) => {
  const routines = await prisma.routine.findMany({
    include: { _count: { select: { runs: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(routines);
});

// Create routine
routineRoutes.post("/api/routines", async (req, res) => {
  const { name, schedule, template, config } = req.body;
  const routine = await prisma.routine.create({
    data: { name, schedule, template, config },
  });
  res.json(routine);
});

// Update routine (re-schedules cron when toggled)
routineRoutes.patch("/api/routines/:id", async (req, res) => {
  const routine = await prisma.routine.update({
    where: { id: req.params.id },
    data: req.body,
  });

  // Update cron schedule
  const jobId = `routine-${routine.id}`;
  try {
    const existing = await embeddingQueue.getRepeatableJobs();
    const match = existing.find((j) => j.id === jobId);
    if (match) await embeddingQueue.removeRepeatableByKey(match.key);

    if (routine.enabled) {
      await embeddingQueue.add(
        "run-routine",
        { routineId: routine.id },
        { repeat: { cron: routine.schedule }, jobId }
      );
    }
  } catch {}

  res.json(routine);
});

// Get routine runs
routineRoutes.get("/api/routines/:id/runs", async (req, res) => {
  const runs = await prisma.routineRun.findMany({
    where: { routineId: req.params.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  res.json(runs);
});

// Manually trigger a routine
routineRoutes.post("/api/routines/:id/run", async (req, res) => {
  const routine = await prisma.routine.findUnique({ where: { id: req.params.id } });
  if (!routine) return res.status(404).json({ error: "Routine not found" });

  const template = routine.template as "daily_briefing" | "weekly_digest";

  // Gather data based on template
  const now = new Date();
  const rangeStart =
    template === "daily_briefing"
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
      : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [meetings, actionItems, contextEvents] = await Promise.all([
    prisma.meeting.findMany({
      where: { startedAt: { gte: rangeStart } },
      include: { summaries: { take: 1 } },
    }),
    prisma.actionItem.findMany({ where: { createdAt: { gte: rangeStart } } }),
    prisma.contextEvent.findMany({
      where: { timestamp: { gte: rangeStart } },
      orderBy: { timestamp: "asc" },
    }),
  ]);

  const meetingsText = meetings
    .map((m) => `- ${m.title || "Untitled"}: ${m.summaries[0]?.summaryText?.slice(0, 200) || "No summary"}`)
    .join("\n");

  const actionItemsText = actionItems
    .map((a) => `- [${a.status}] ${a.text}${a.assignee ? ` (@${a.assignee})` : ""}`)
    .join("\n");

  // Summarize context activity
  const appTime: Record<string, number> = {};
  for (const e of contextEvents) {
    appTime[e.appName] = (appTime[e.appName] || 0) + (e.durationSecs || 0);
  }
  const contextSummary = Object.entries(appTime)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([app, secs]) => `${app}: ${Math.round(secs / 60)}min`)
    .join(", ");

  const output = await generateBriefing(template, {
    meetings: meetingsText || "No meetings",
    actionItems: actionItemsText || "No action items",
    contextSummary: contextSummary || "No context data",
  });

  const run = await prisma.routineRun.create({
    data: { routineId: routine.id, output },
  });

  await prisma.routine.update({
    where: { id: routine.id },
    data: { lastRunAt: new Date() },
  });

  res.json(run);
});
