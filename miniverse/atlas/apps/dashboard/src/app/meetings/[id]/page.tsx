"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import type { Meeting } from "@atlas/shared";
import { api } from "@/lib/api";

type Tab = "summary" | "transcript" | "actions";

export default function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMeeting(id).then(setMeeting).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8"><div className="h-8 w-60 bg-bg-card rounded animate-pulse" /></div>;
  if (!meeting) return <div className="p-8 text-text-muted">Meeting not found</div>;

  const summary = meeting.summaries?.[0];
  const json = summary?.summaryJson as { title?: string; executiveSummary?: string; topics?: string[]; decisions?: string[]; actionItems?: { text: string; assignee?: string; deadline?: string }[] } | undefined;

  return (
    <div className="p-8 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-text-muted mb-6">
        <Link href="/" className="hover:text-text">Meetings</Link>
        <span>/</span>
        <span className="text-text">{meeting.title || "Untitled"}</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{meeting.title || "Untitled Meeting"}</h1>
        <p className="text-sm text-text-muted mt-1">
          {meeting.startedAt ? new Date(meeting.startedAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Scheduled"}
          {meeting.durationSeconds ? ` · ${Math.round(meeting.durationSeconds / 60)} minutes` : ""}
        </p>
        {meeting.participants?.length > 0 && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {meeting.participants.map((p) => (
              <span key={p} className="text-xs bg-bg-card border border-border px-2.5 py-1 rounded-full">{p}</span>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {(["summary", "transcript", "actions"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm capitalize transition-colors border-b-2 -mb-px ${tab === t ? "border-accent text-text" : "border-transparent text-text-muted hover:text-text"}`}
          >
            {t === "actions" ? `Actions (${meeting.actionItems?.length || 0})` : t}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "summary" && (
        <div className="space-y-6">
          {json?.executiveSummary && (
            <section>
              <h2 className="text-sm font-medium text-text-muted mb-2">Executive Summary</h2>
              <p className="text-sm leading-relaxed bg-bg-card border border-border rounded-[var(--radius-lg)] p-4">{json.executiveSummary}</p>
            </section>
          )}
          {json?.topics && json.topics.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-text-muted mb-2">Key Topics</h2>
              <ul className="space-y-1.5">
                {json.topics.map((t, i) => (
                  <li key={i} className="text-sm flex gap-2"><span className="text-accent">-</span>{t}</li>
                ))}
              </ul>
            </section>
          )}
          {json?.decisions && json.decisions.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-text-muted mb-2">Decisions</h2>
              <ul className="space-y-1.5">
                {json.decisions.map((d, i) => (
                  <li key={i} className="text-sm flex gap-2"><span className="text-success">-</span>{d}</li>
                ))}
              </ul>
            </section>
          )}
          {!summary && <p className="text-text-muted text-sm">No summary available yet.</p>}
        </div>
      )}

      {tab === "transcript" && (
        <div className="space-y-3">
          {meeting.segments && meeting.segments.length > 0 ? (
            meeting.segments.map((seg) => (
              <div key={seg.id} className="flex gap-3">
                <div className="w-16 shrink-0 text-right">
                  <span className="text-xs text-text-muted font-[family-name:var(--font-mono)]">
                    {formatTimestamp(seg.startMs)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-accent">{seg.speaker}</span>
                  <p className="text-sm text-text-muted mt-0.5">{seg.text}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-text-muted text-sm">No transcript available.</p>
          )}
        </div>
      )}

      {tab === "actions" && (
        <ActionItemsList items={meeting.actionItems || []} />
      )}

      {/* Draft generation */}
      {meeting.status === "complete" && (
        <div className="mt-8 pt-6 border-t border-border">
          <h3 className="text-sm font-medium text-text-muted mb-3">Generate Draft</h3>
          <div className="flex gap-2">
            <DraftButton meetingId={meeting.id} type="follow_up_email" label="Follow-up Email" />
            <DraftButton meetingId={meeting.id} type="meeting_notes" label="Meeting Notes" />
            <DraftButton meetingId={meeting.id} type="project_plan" label="Project Plan" />
          </div>
        </div>
      )}
    </div>
  );
}

function ActionItemsList({ items }: { items: Meeting["actionItems"] }) {
  const [statuses, setStatuses] = useState<Record<string, string>>({});

  if (!items || items.length === 0) return <p className="text-text-muted text-sm">No action items.</p>;

  const toggle = async (id: string, current: string) => {
    const newStatus = current === "open" ? "done" : "open";
    setStatuses((s) => ({ ...s, [id]: newStatus }));
    await api.updateActionItem(id, newStatus).catch(() => setStatuses((s) => ({ ...s, [id]: current })));
  };

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const status = statuses[item.id] || item.status;
        return (
          <div key={item.id} className="flex items-start gap-3 bg-bg-card border border-border rounded-[var(--radius)] p-3">
            <button onClick={() => toggle(item.id, status)} className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center ${status === "done" ? "bg-success border-success" : "border-text-muted"}`}>
              {status === "done" && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${status === "done" ? "line-through text-text-muted" : ""}`}>{item.text}</p>
              <div className="flex gap-3 mt-1">
                {item.assignee && <span className="text-xs text-text-muted">@{item.assignee}</span>}
                {item.deadline && <span className="text-xs text-text-muted">Due: {item.deadline}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DraftButton({ meetingId, type, label }: { meetingId: string; type: string; label: string }) {
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const draft = await api.generateDraft({ type, meetingId });
      alert(`Draft generated: ${draft.title}\n\n${draft.content.slice(0, 500)}...`);
    } catch {
      alert("Failed to generate draft");
    }
    setLoading(false);
  };

  return (
    <button onClick={generate} disabled={loading} className="text-xs bg-bg-hover border border-border px-3 py-1.5 rounded-[var(--radius)] hover:border-accent/40 disabled:opacity-50 transition-colors">
      {loading ? "Generating..." : label}
    </button>
  );
}

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}
