"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Meeting } from "@atlas/shared";
import { api } from "@/lib/api";

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMeetings().then(setMeetings).catch(console.error).finally(() => setLoading(false));
  }, []);

  const completed = meetings.filter((m) => m.status === "complete").length;
  const openActions = meetings.flatMap((m) => m.actionItems || []).filter((a) => a.status === "open").length;
  const totalHours = Math.round(meetings.reduce((sum, m) => sum + (m.durationSeconds || 0), 0) / 3600 * 10) / 10;

  const stats = [
    { label: "Total Meetings", value: meetings.length },
    { label: "Completed", value: completed },
    { label: "Open Actions", value: openActions },
    { label: "Hours Recorded", value: totalHours },
  ];

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Meetings</h1>
          <p className="text-text-muted text-sm mt-1">Your recorded meetings and transcripts</p>
        </div>
        <SubmitLinkButton />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="bg-bg-card border border-border rounded-xl p-4">
            <p className="text-2xl font-semibold">{s.value}</p>
            <p className="text-xs text-text-muted mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Meeting List */}
      {meetings.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => (
            <Link
              key={m.id}
              href={`/meetings/${m.id}`}
              className="block bg-bg-card border border-border rounded-xl p-5 hover:border-accent/40 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium truncate">{m.title || "Untitled Meeting"}</h3>
                    <StatusBadge status={m.status} />
                  </div>
                  <p className="text-sm text-text-muted mt-1">
                    {m.startedAt ? new Date(m.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Scheduled"}
                    {m.durationSeconds ? ` · ${Math.round(m.durationSeconds / 60)}min` : ""}
                    {m.participants?.length ? ` · ${m.participants.length} participants` : ""}
                  </p>
                  {m.summaries?.[0] && (
                    <p className="text-sm text-text-muted mt-2 line-clamp-2">
                      {(m.summaries[0].summaryJson as { executiveSummary?: string })?.executiveSummary || m.summaries[0].summaryText?.slice(0, 200)}
                    </p>
                  )}
                </div>
                <div className="text-text-muted ml-4">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    complete: "bg-success/10 text-success",
    recording: "bg-danger/10 text-danger",
    processing: "bg-warning/10 text-warning",
    scheduled: "bg-accent/10 text-accent",
    joining: "bg-warning/10 text-warning",
    failed: "bg-danger/10 text-danger",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[status] || "bg-bg-hover text-text-muted"}`}>
      {status}
    </span>
  );
}

function SubmitLinkButton() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  const submit = async () => {
    if (!url.includes("meet.google.com")) return;
    await api.submitLink(url);
    setUrl("");
    setOpen(false);
    window.location.reload();
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="bg-accent hover:bg-accent-hover text-white text-sm px-4 py-2 rounded-lg transition-colors">
        + Add Meeting
      </button>
    );
  }

  return (
    <div className="flex gap-2">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="meet.google.com/xxx-xxxx-xxx"
        className="bg-bg-input border border-border rounded-lg px-3 py-2 text-sm w-72 outline-none focus:border-accent"
      />
      <button onClick={submit} className="bg-accent hover:bg-accent-hover text-white text-sm px-4 py-2 rounded-lg transition-colors">Go</button>
      <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text text-sm px-2">Cancel</button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-20 text-text-muted">
      <svg className="w-12 h-12 mx-auto mb-4 opacity-30" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
      <p className="text-sm">No meetings yet. Click &quot;Add Meeting&quot; to get started.</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-8 max-w-5xl">
      <div className="h-8 w-40 bg-bg-card rounded animate-pulse mb-8" />
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-bg-card rounded-xl animate-pulse" />)}
      </div>
      {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-bg-card rounded-xl animate-pulse mb-3" />)}
    </div>
  );
}
