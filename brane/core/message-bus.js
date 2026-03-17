import { readFile, appendFile, readdir, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { EventEmitter } from "events";
import { generateId } from "./types.js";

const MESSAGES_DIR = join(homedir(), ".brane", "messages");

/**
 * Singleton EventEmitter for real-time message subscriptions (e.g. SSE).
 * Events are emitted as `message:{channel}` with the message object.
 */
export const bus = new EventEmitter();
bus.setMaxListeners(50);

/**
 * Publish a message to a channel.
 * Appends a JSON line to ~/.brane/messages/{channel}.jsonl and emits on the bus.
 * @param {string} channel - Channel name (e.g. "tasks", "agents", "system")
 * @param {Object} message - Message payload to publish
 * @returns {Promise<Object>} The complete message object with id and timestamp
 */
export async function publish(channel, message) {
  const now = new Date().toISOString();
  const msg = {
    id: generateId(),
    from: message.from || "system",
    to: message.to || null,
    type: message.type || "command",
    payload: message.payload || {},
    replyTo: message.replyTo || null,
    timestamp: now,
    ...message,
  };
  // Ensure auto-fields override any user-provided values
  msg.id = msg.id || generateId();
  msg.timestamp = now;

  await mkdir(MESSAGES_DIR, { recursive: true });

  const filePath = join(MESSAGES_DIR, `${channel}.jsonl`);
  const line = JSON.stringify(msg) + "\n";
  await appendFile(filePath, line, "utf-8");

  // Emit for real-time listeners
  bus.emit(`message:${channel}`, msg);
  bus.emit("message", { channel, message: msg });

  return msg;
}

/**
 * Read messages from a channel.
 * @param {string} channel - Channel name
 * @param {Object} [options]
 * @param {string} [options.since] - ISO timestamp, only return messages after this time
 * @param {number} [options.limit] - Maximum number of messages to return (from the end)
 * @returns {Promise<Object[]>}
 */
export async function getMessages(channel, { since, limit } = {}) {
  const filePath = join(MESSAGES_DIR, `${channel}.jsonl`);

  let content;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return [];
  }

  const lines = content.trim().split("\n").filter(Boolean);
  let messages = [];

  for (const line of lines) {
    try {
      messages.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }

  // Filter by since
  if (since) {
    const sinceTime = new Date(since).getTime();
    messages = messages.filter((m) => new Date(m.timestamp).getTime() > sinceTime);
  }

  // Limit to last N
  if (limit && limit > 0) {
    messages = messages.slice(-limit);
  }

  return messages;
}

/**
 * List all available message channels.
 * @returns {Promise<string[]>} Array of channel names
 */
export async function getChannels() {
  try {
    const files = await readdir(MESSAGES_DIR);
    return files
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => f.replace(/\.jsonl$/, ""));
  } catch {
    return [];
  }
}
