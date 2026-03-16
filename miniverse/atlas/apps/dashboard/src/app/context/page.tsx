"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface AppUsage {
  app: string;
  minutes: number;
}

interface HourlyBlock {
  hour: number;
  apps: AppUsage[];
}

interface ContextSummary {
  date: string;
  totalEvents: number;
  totalMinutes: number;
  topApps: AppUsage[];
  hourlyBreakdown: HourlyBlock[];
  aiSummary?: string;
}

interface ContextEvent {
  id: string;
  timestamp: string;
  appName: string;
  windowTitle: string | null;
  browserUrl: string | null;
  durationSecs: number | null;
}

export default function ContextPage() {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [summary, setSummary] = useState<ContextSummary | null>(null);
  const [events, setEvents] = useState<ContextEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [view, setView] = useState<"timeline" | "apps">("timeline");

  useEffect(() => {
    setLoading(true);
    const from = `${date}T00:00:00`;
    const to = `${date}T23:59:59`;

    Promise.all([
      fetch(`${API}/api/context/summary?date=${date}`).then((r) => r.json()),
      fetch(`${API}/api/context/timeline?from=${from}&to=${to}`).then((r) => r.json()),
    ])
      .then(([s, e]) => {
        setSummary(s);
        setEvents(e);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [date]);

  const generateAiSummary = async () => {
    setAiLoading(true);
    try {
      const res = await fetch(`${API}/api/context/summary?date=${date}&ai=true`);
      const data = await res.json();
      setSummary(data);
    } catch {}
    setAiLoading(false);
  };

  const formatHour = (h: number) => {
    if (h === 0) return "12 AM";
    if (h < 12) return `${h} AM`;
    if (h === 12) return "12 PM";
    return `${h - 12} PM`;
  };

  const maxAppMinutes = summary?.topApps[0]?.minutes || 1;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Context Timeline</h1>
          <p className="text-sm text-text-muted mt-1">Track what you worked on throughout the day</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-bg-card border border-border rounded-lg px-3 py-1.5 text-sm"
        />
      </div>

      {loading ? (
        <div className="text-sm text-text-muted">Loading...</div>
      ) : !summary || summary.totalEvents === 0 ? (
        <div className="bg-bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-text-muted">No context data for this date.</p>
          <p className="text-sm text-text-muted mt-2">
            Context tracking requires the Atlas desktop app to be running.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Total Time" value={`${Math.floor(summary.totalMinutes / 60)}h ${summary.totalMinutes % 60}m`} />
            <StatCard label="Events Tracked" value={String(summary.totalEvents)} />
            <StatCard label="Apps Used" value={String(summary.topApps.length)} />
          </div>

          {/* AI Summary */}
          <div className="bg-bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium">AI Daily Summary</h2>
              <button
                onClick={generateAiSummary}
                disabled={aiLoading}
                className="text-xs px-3 py-1 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
              >
                {aiLoading ? "Generating..." : summary.aiSummary ? "Regenerate" : "Generate Summary"}
              </button>
            </div>
            {summary.aiSummary ? (
              <p className="text-sm text-text-muted whitespace-pre-wrap leading-relaxed">{summary.aiSummary}</p>
            ) : (
              <p className="text-sm text-text-muted">Click generate to get an AI-powered summary of your day.</p>
            )}
          </div>

          {/* View toggle */}
          <div className="flex gap-1 bg-bg-card border border-border rounded-lg p-1 w-fit">
            <button
              onClick={() => setView("timeline")}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${view === "timeline" ? "bg-bg-hover text-text" : "text-text-muted"}`}
            >
              Hourly Timeline
            </button>
            <button
              onClick={() => setView("apps")}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${view === "apps" ? "bg-bg-hover text-text" : "text-text-muted"}`}
            >
              App Breakdown
            </button>
          </div>

          {view === "apps" ? (
            /* App breakdown */
            <div className="bg-bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-medium mb-4">App Usage</h2>
              <div className="space-y-3">
                {summary.topApps.map((a) => (
                  <div key={a.app} className="flex items-center gap-3">
                    <span className="text-sm w-32 shrink-0 truncate">{a.app}</span>
                    <div className="flex-1 h-6 bg-bg-hover rounded-md overflow-hidden">
                      <div
                        className="h-full bg-accent/30 rounded-md"
                        style={{ width: `${(a.minutes / maxAppMinutes) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-text-muted w-14 text-right">{a.minutes}m</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Hourly timeline */
            <div className="bg-bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-medium mb-4">Hourly Activity</h2>
              <div className="space-y-4">
                {summary.hourlyBreakdown.map((block) => (
                  <div key={block.hour} className="flex gap-4">
                    <span className="text-xs text-text-muted w-14 shrink-0 pt-0.5 text-right">
                      {formatHour(block.hour)}
                    </span>
                    <div className="flex-1 border-l border-border pl-4">
                      <div className="flex flex-wrap gap-2">
                        {block.apps.map((a) => (
                          <span
                            key={a.app}
                            className="text-xs px-2 py-1 rounded-md bg-bg-hover"
                          >
                            {a.app} <span className="text-text-muted">{a.minutes}m</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent events */}
          {events.length > 0 && (
            <div className="bg-bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-medium mb-4">Recent Events ({events.length})</h2>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {events.slice(-50).reverse().map((e) => (
                  <div key={e.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-border/50 last:border-0">
                    <span className="text-text-muted w-16 shrink-0">
                      {new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="font-medium w-24 shrink-0 truncate">{e.appName}</span>
                    <span className="text-text-muted truncate">
                      {e.windowTitle || e.browserUrl || "—"}
                    </span>
                    {e.durationSecs && (
                      <span className="text-text-muted ml-auto shrink-0">{e.durationSecs}s</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-4">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-xl font-semibold mt-1">{value}</p>
    </div>
  );
}
