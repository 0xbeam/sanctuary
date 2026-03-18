import { getKnowledge, addKnowledge } from "./knowledge-store.js";
import { createTask } from "./task-manager.js";
import { publish } from "./message-bus.js";
import { getTasks } from "./task-manager.js";

/**
 * Get knowledge entries that haven't been analyzed yet.
 */
export async function getUnprocessedKnowledge() {
  const all = await getKnowledge();
  // Filter entries that don't have an 'analyzed' field or it's false
  return all.filter(entry => !entry.analyzed);
}

/**
 * Create an analysis task for a knowledge entry.
 * The orchestrator or an available agent will pick this up.
 */
export async function createAnalysisTask(knowledgeId, knowledgeTitle) {
  const task = await createTask({
    type: "knowledge-analysis",
    title: `Analyze: ${knowledgeTitle}`,
    description: `Analyze knowledge entry ${knowledgeId} to determine if it should be promoted to a skill or instruction, and which agents would benefit.`,
    priority: "p2",
    input: { knowledgeId },
    createdBy: "system",
  });

  // Notify on knowledge channel
  await publish("knowledge", {
    from: "system",
    type: "knowledge",
    payload: {
      action: "analysis-queued",
      knowledgeId,
      taskId: task.id,
      title: knowledgeTitle,
    },
  });

  return task;
}

/**
 * Process analysis results and auto-promote if appropriate.
 * Called when a knowledge-analysis task completes.
 */
export async function processAnalysisResult(knowledgeId, analysis) {
  // analysis shape: { action: "promote-to-skill"|"promote-to-instruction"|"archive",
  //                   skillName?, projectPath?, confidence?, tags?, summary? }

  if (!analysis || !analysis.action) return { status: "no-action" };

  // Notify about the analysis result
  await publish("knowledge", {
    from: "system",
    type: "knowledge",
    payload: {
      action: "analysis-complete",
      knowledgeId,
      result: analysis,
    },
  });

  return { status: "processed", action: analysis.action, knowledgeId };
}

/**
 * Queue analysis tasks for all unprocessed knowledge entries.
 */
export async function processNewKnowledge() {
  const unprocessed = await getUnprocessedKnowledge();
  const tasks = [];

  for (const entry of unprocessed) {
    // Check if there's already a pending analysis task for this entry
    const existing = await getTasks({ type: "knowledge-analysis" });
    const alreadyQueued = existing.some(t =>
      t.input?.knowledgeId === entry.id &&
      (t.status === "queued" || t.status === "assigned" || t.status === "running")
    );

    if (!alreadyQueued) {
      const task = await createAnalysisTask(entry.id, entry.title);
      tasks.push(task);
    }
  }

  return { created: tasks.length, entries: unprocessed.length };
}

/**
 * Notify agents about new or promoted knowledge.
 */
export async function notifyAgents(knowledgeId, agentIds, message) {
  for (const agentId of agentIds) {
    await publish("knowledge-updates", {
      from: "system",
      to: agentId,
      type: "knowledge",
      payload: {
        action: "new-knowledge",
        knowledgeId,
        message,
      },
    });
  }
}
