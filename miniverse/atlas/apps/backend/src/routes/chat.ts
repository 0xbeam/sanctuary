import { Router } from "express";
import { prisma } from "../server";
import { embedText, chatWithContext } from "@atlas/ai";

export const chatRoutes = Router();

// List chat sessions
chatRoutes.get("/api/chat/sessions", async (_req, res) => {
  const sessions = await prisma.chatSession.findMany({
    include: { _count: { select: { messages: true } } },
    orderBy: { updatedAt: "desc" },
  });

  res.json(
    sessions.map((s) => ({
      id: s.id,
      title: s.title,
      lastMessageAt: s.updatedAt,
      messageCount: s._count.messages,
    }))
  );
});

// Get messages for a session
chatRoutes.get("/api/chat/sessions/:id", async (req, res) => {
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId: req.params.id },
    orderBy: { createdAt: "asc" },
  });
  res.json(messages);
});

// Send chat message (streaming response)
chatRoutes.post("/api/chat", async (req, res) => {
  const { sessionId, message } = req.body;

  // Get or create session
  let session;
  if (sessionId) {
    session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  }
  if (!session) {
    session = await prisma.chatSession.create({
      data: { title: message.slice(0, 80) },
    });
  }

  // Save user message
  await prisma.chatMessage.create({
    data: { sessionId: session.id, role: "user", content: message },
  });

  // Retrieve relevant context via vector search
  let contextChunks: string[] = [];
  try {
    const queryVector = await embedText(message);
    const vectorStr = `[${queryVector.join(",")}]`;

    const results: { content: string; source_type: string; source_id: string }[] =
      await prisma.$queryRawUnsafe(
        `SELECT content, "sourceType" as source_type, "sourceId" as source_id
         FROM "Embedding"
         ORDER BY vector <=> $1::vector
         LIMIT 8`,
        vectorStr
      );

    contextChunks = results.map((r) => `[${r.source_type}] ${r.content}`);
  } catch {
    // Vector search not available — fall back to recent meeting summaries
    const recentSummaries = await prisma.meetingSummary.findMany({
      take: 5,
      orderBy: { generatedAt: "desc" },
    });
    contextChunks = recentSummaries.map((s) => s.summaryText);
  }

  // Get chat history
  const history = await prisma.chatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const historyMessages = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Stream response
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Session-Id", session.id);

  try {
    const stream = (await chatWithContext(message, contextChunks, historyMessages)) as ReadableStream;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    // Save assistant message
    await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "assistant",
        content: fullResponse,
        sources: contextChunks.length > 0 ? contextChunks.map((c) => ({ snippet: c })) : undefined,
      },
    });

    // Update session title if first exchange
    if (history.length <= 1) {
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { title: message.slice(0, 80) },
      });
    }

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: "Chat failed" })}\n\n`);
    res.end();
  }
});
