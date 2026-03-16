import "dotenv/config";

// Bot entrypoint — launched inside a Docker container per meeting
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";
const MEET_URL = process.env.MEET_URL;
const MEETING_ID = process.env.MEETING_ID;
const JOB_ID = process.env.JOB_ID;

if (!MEET_URL || !MEETING_ID) {
  console.error("MEET_URL and MEETING_ID are required");
  process.exit(1);
}

interface Segment {
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
  source: string;
}

const allSegments: Segment[] = [];

async function main() {
  console.log(`Bot starting for meeting ${MEETING_ID}: ${MEET_URL}`);

  // Import dynamically to allow for optional dependencies
  const { runBot } = await import("../playwright/runBot");

  await runBot(
    {
      meetUrl: MEET_URL!,
      botName: process.env.BOT_NAME || "Atlas Notetaker",
      authCookiePath: process.env.BOT_AUTH_COOKIE_PATH || "./auth.json",
    },
    // onSegments callback
    (segments: Segment[]) => {
      allSegments.push(...segments);
    },
    // onMeetingEnd callback
    async () => {
      console.log(`Meeting ended. Collected ${allSegments.length} segments.`);

      // POST results to backend
      try {
        const res = await fetch(`${BACKEND_URL}/bot-done`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: JOB_ID,
            meetingId: MEETING_ID,
            segments: allSegments,
            recordingPath: process.env.RECORDING_PATH || null,
          }),
        });
        const data = await res.json();
        console.log("Bot done response:", data);
      } catch (error) {
        console.error("Failed to notify backend:", error);
      }

      process.exit(0);
    }
  );
}

main().catch((err) => {
  console.error("Bot error:", err);
  process.exit(1);
});
