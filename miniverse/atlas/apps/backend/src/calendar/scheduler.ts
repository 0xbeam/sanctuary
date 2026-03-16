import { google } from "googleapis";
import { prisma } from "../server";

const POLL_INTERVAL = 60_000; // 60 seconds

export function startCalendarPoller() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.log("Google Calendar not configured — skipping polling");
    return;
  }

  console.log("Calendar poller started");
  setInterval(pollCalendar, POLL_INTERVAL);
  pollCalendar();
}

async function pollCalendar() {
  try {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // TODO: Load stored refresh token from DB or env
    // auth.setCredentials({ refresh_token: storedToken });

    const calendar = google.calendar({ version: "v3", auth });
    const calendarIds = (process.env.GOOGLE_CALENDAR_IDS || "primary").split(",");

    for (const calendarId of calendarIds) {
      const now = new Date();
      const upcoming = new Date(now.getTime() + 15 * 60 * 1000); // Next 15 min

      const events = await calendar.events.list({
        calendarId: calendarId.trim(),
        timeMin: now.toISOString(),
        timeMax: upcoming.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      });

      for (const event of events.data.items || []) {
        const meetUrl = event.hangoutLink;
        if (!meetUrl) continue;

        // Check if already scheduled
        const existing = await prisma.meeting.findFirst({
          where: { calendarEventId: event.id! },
        });

        if (existing) continue;

        // Create meeting and queue bot
        await prisma.meeting.create({
          data: {
            meetUrl,
            calendarEventId: event.id!,
            title: event.summary || null,
            status: "scheduled",
            startedAt: event.start?.dateTime ? new Date(event.start.dateTime) : null,
            participants: (event.attendees || []).map((a) => a.email || "").filter(Boolean),
          },
        });

        console.log(`Scheduled bot for: ${event.summary} (${meetUrl})`);
      }
    }
  } catch (error) {
    console.error("Calendar poll error:", error);
  }
}
