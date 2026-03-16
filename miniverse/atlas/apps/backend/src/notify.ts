const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;

export async function notify(event: string, details: Record<string, unknown> = {}) {
  console.log(`[atlas] ${event}`, details);

  if (!SLACK_WEBHOOK) return;

  const icons: Record<string, string> = {
    "meeting.joined": "🎙️",
    "meeting.ended": "✅",
    "meeting.summary_ready": "📝",
    "meeting.failed": "❌",
    "bot.started": "🤖",
    "bot.error": "🔥",
    "system.startup": "🚀",
  };

  const text = `${icons[event] || "ℹ️"} *Atlas — ${event}*\n${Object.entries(details).map(([k, v]) => `• ${k}: ${v}`).join("\n")}`;

  try {
    await fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.warn("Slack notification failed:", err);
  }
}
