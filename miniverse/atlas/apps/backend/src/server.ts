import "dotenv/config";
import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { meetingRoutes } from "./routes/meetings";
import { actionItemRoutes } from "./routes/action-items";
import { chatRoutes } from "./routes/chat";
import { searchRoutes } from "./routes/search";
import { routineRoutes } from "./routes/routines";
import { draftRoutes } from "./routes/drafts";
import { contextRoutes } from "./routes/context";
import { botRoutes } from "./routes/bot";
import { setupEmbeddingWorker } from "./ai/embedding-worker";
import { startCalendarPoller } from "./calendar/scheduler";

export const prisma = new PrismaClient();

const app = express();
app.use(cors({ origin: process.env.DASHBOARD_URL || "http://localhost:3000" }));
app.use(express.json({ limit: "10mb" }));

// Health
app.get("/health", async (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use(meetingRoutes);
app.use(actionItemRoutes);
app.use(chatRoutes);
app.use(searchRoutes);
app.use(routineRoutes);
app.use(draftRoutes);
app.use(contextRoutes);
app.use(botRoutes);

const PORT = process.env.PORT || 3001;

async function main() {
  await prisma.$connect();

  // Enable pgvector extension
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`).catch(() => {
    console.warn("pgvector extension not available — vector search disabled");
  });
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm`).catch(() => {
    console.warn("pg_trgm extension not available — fuzzy search disabled");
  });

  // Start background workers
  setupEmbeddingWorker();

  // Start calendar polling if configured
  if (process.env.GOOGLE_CLIENT_ID) {
    startCalendarPoller();
  }

  app.listen(PORT, () => {
    console.log(`Atlas backend running on :${PORT}`);
  });
}

main().catch(console.error);
