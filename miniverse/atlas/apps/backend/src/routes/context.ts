import { Router } from "express";
import { prisma } from "../server";

export const contextRoutes = Router();

// Bulk ingest context events from desktop app
contextRoutes.post("/api/context/events", async (req, res) => {
  const { events } = req.body;
  if (!Array.isArray(events)) return res.status(400).json({ error: "events array required" });

  const created = await prisma.contextEvent.createMany({
    data: events.map((e: Record<string, unknown>) => ({
      timestamp: new Date(e.timestamp as string),
      appName: e.appName as string,
      bundleId: (e.bundleId as string) || null,
      windowTitle: (e.windowTitle as string) || null,
      browserUrl: (e.browserUrl as string) || null,
      tabTitle: (e.tabTitle as string) || null,
      durationSecs: (e.durationSecs as number) || null,
    })),
    skipDuplicates: true,
  });

  res.json({ ingested: created.count });
});

// Get context timeline
contextRoutes.get("/api/context/timeline", async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: "from and to required" });

  const events = await prisma.contextEvent.findMany({
    where: {
      timestamp: {
        gte: new Date(from as string),
        lte: new Date(to as string),
      },
    },
    orderBy: { timestamp: "asc" },
  });

  res.json(events);
});

// Get daily activity summary
contextRoutes.get("/api/context/summary", async (req, res) => {
  const { date } = req.query;
  const day = date ? new Date(date as string) : new Date();
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const events = await prisma.contextEvent.findMany({
    where: { timestamp: { gte: start, lt: end } },
    orderBy: { timestamp: "asc" },
  });

  // Aggregate by app
  const appTime: Record<string, number> = {};
  for (const e of events) {
    const secs = e.durationSecs || 0;
    appTime[e.appName] = (appTime[e.appName] || 0) + secs;
  }

  const topApps = Object.entries(appTime)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([app, seconds]) => ({ app, minutes: Math.round(seconds / 60) }));

  res.json({
    date: start.toISOString().split("T")[0],
    totalEvents: events.length,
    totalMinutes: Math.round(Object.values(appTime).reduce((a, b) => a + b, 0) / 60),
    topApps,
  });
});
