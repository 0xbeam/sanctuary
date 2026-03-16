import { Router } from "express";
import { prisma } from "../server";

export const actionItemRoutes = Router();

// List action items
actionItemRoutes.get("/api/action-items", async (req, res) => {
  const { status, assignee } = req.query;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (assignee) where.assignee = assignee;

  const items = await prisma.actionItem.findMany({
    where,
    include: {
      meeting: { select: { id: true, title: true, startedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(items);
});

// Toggle action item status
actionItemRoutes.patch("/api/action-items/:id", async (req, res) => {
  const { status } = req.body;
  const item = await prisma.actionItem.update({
    where: { id: req.params.id },
    data: { status },
  });
  res.json(item);
});
