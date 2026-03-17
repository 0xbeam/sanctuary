import { readdir, readFile, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { generateId } from "./types.js";

const BRANE_DIR = join(homedir(), ".brane");
const TASKS_DIR = join(BRANE_DIR, "tasks");

/**
 * Default task schema with all fields.
 * @returns {Object}
 */
function taskDefaults() {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    type: "custom",
    title: "",
    description: "",
    status: "queued",
    priority: "p2",
    agentId: null,
    parentTaskId: null,
    gitBranch: null,
    gitRepo: null,
    commits: [],
    input: {},
    output: null,
    activity: [],
    currentStage: null,
    stageIndex: -1,
    totalStages: 0,
    dependencies: [],
    createdBy: "human",
    createdByAgentId: null,
    createdAt: now,
    completedAt: null,
  };
}

/**
 * Create a new task and persist it to disk.
 * @param {Object} data - Task fields to set (merged with defaults)
 * @returns {Promise<Object>} The created task
 */
export async function createTask(data) {
  const task = { ...taskDefaults(), ...data };
  // Ensure an id even if data had one
  if (!task.id) task.id = generateId();

  const filePath = join(TASKS_DIR, `${task.id}.json`);
  await writeFile(filePath, JSON.stringify(task, null, 2), "utf-8");
  return task;
}

/**
 * Get all tasks, optionally filtered.
 * @param {Object} [filters] - Optional filters: { type, status, agentId, gitBranch, gitRepo }
 * @returns {Promise<Object[]>}
 */
export async function getTasks(filters = {}) {
  let files;
  try {
    files = await readdir(TASKS_DIR);
  } catch {
    return [];
  }

  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  const tasks = [];

  for (const file of jsonFiles) {
    try {
      const raw = await readFile(join(TASKS_DIR, file), "utf-8");
      const task = JSON.parse(raw);
      tasks.push(task);
    } catch {
      // Skip malformed
    }
  }

  // Apply filters
  return tasks.filter((task) => {
    if (filters.type && task.type !== filters.type) return false;
    if (filters.status && task.status !== filters.status) return false;
    if (filters.agentId && task.agentId !== filters.agentId) return false;
    if (filters.gitBranch && task.gitBranch !== filters.gitBranch) return false;
    if (filters.gitRepo && task.gitRepo !== filters.gitRepo) return false;
    return true;
  });
}

/**
 * Get a single task by ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getTask(id) {
  try {
    const raw = await readFile(join(TASKS_DIR, `${id}.json`), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Update a task with a partial patch (read-modify-write).
 * Handles activity array by appending if patch.activity is an array.
 * @param {string} id
 * @param {Object} patch
 * @returns {Promise<Object|null>}
 */
export async function updateTask(id, patch) {
  const task = await getTask(id);
  if (!task) return null;

  // Handle activity append: if patch has activity entries, append them
  let mergedActivity = task.activity;
  if (Array.isArray(patch.activity)) {
    mergedActivity = [...task.activity, ...patch.activity];
  }

  const updated = { ...task, ...patch, activity: mergedActivity };

  // Deep merge input
  if (patch.input && task.input) {
    updated.input = { ...task.input, ...patch.input };
  }

  // Append commits
  if (Array.isArray(patch.commits)) {
    updated.commits = [...(task.commits || []), ...patch.commits];
  }

  const filePath = join(TASKS_DIR, `${id}.json`);
  await writeFile(filePath, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

/**
 * Assign a task to an agent.
 * @param {string} id - Task ID
 * @param {string} agentId - Agent ID to assign
 * @returns {Promise<Object|null>}
 */
export async function assignTask(id, agentId) {
  return updateTask(id, {
    agentId,
    status: "assigned",
    activity: [
      {
        stage: "assigned",
        label: "Task Assigned",
        message: `Assigned to agent ${agentId}`,
        timestamp: Date.now(),
      },
    ],
  });
}

/**
 * Cancel a task.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function cancelTask(id) {
  return updateTask(id, {
    status: "cancelled",
    completedAt: new Date().toISOString(),
    activity: [
      {
        stage: "cancelled",
        label: "Cancelled",
        message: "Task was cancelled",
        timestamp: Date.now(),
      },
    ],
  });
}

/**
 * Get all tasks assigned to a specific agent.
 * @param {string} agentId
 * @returns {Promise<Object[]>}
 */
export async function getTasksByAgent(agentId) {
  return getTasks({ agentId });
}

/**
 * Get all tasks for a specific git branch.
 * @param {string} branch
 * @returns {Promise<Object[]>}
 */
export async function getTasksByBranch(branch) {
  return getTasks({ gitBranch: branch });
}
