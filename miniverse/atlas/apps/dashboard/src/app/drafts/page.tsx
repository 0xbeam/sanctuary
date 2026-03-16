"use client";

import { useEffect, useState } from "react";
import type { Draft } from "@atlas/shared";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "draft" | "sent" | "archived">("all");

  useEffect(() => {
    fetch(`${API}/api/drafts`)
      .then((r) => r.json())
      .then(setDrafts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`${API}/api/drafts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const updated: Draft = await res.json();
      setDrafts((prev) => prev.map((d) => (d.id === id ? updated : d)));
      if (selected?.id === id) setSelected(updated);
    } catch {}
  };

  const filtered = filter === "all" ? drafts : drafts.filter((d) => d.status === filter);

  const typeLabels: Record<string, string> = {
    follow_up_email: "Follow-up Email",
    meeting_notes: "Meeting Notes",
    project_plan: "Project Plan",
  };

  const statusColors: Record<string, string> = {
    draft: "bg-yellow-500/10 text-yellow-400",
    sent: "bg-green-500/10 text-green-400",
    archived: "bg-zinc-500/10 text-zinc-400",
  };

  if (loading) return <div className="p-8"><div className="h-8 w-40 bg-bg-card rounded animate-pulse" /></div>;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Drafts</h1>
          <p className="text-sm text-text-muted mt-1">AI-generated content from your meetings</p>
        </div>
        <div className="flex gap-1 bg-bg-card border border-border rounded-lg p-1">
          {(["all", "draft", "sent", "archived"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-md capitalize transition-colors ${filter === f ? "bg-bg-hover text-text" : "text-text-muted"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-text-muted">
            {drafts.length === 0
              ? "No drafts yet. Generate one from a meeting detail page."
              : "No drafts match this filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelected(d)}
              className={`w-full bg-bg-card border rounded-xl p-4 text-left hover:border-accent/40 transition-colors ${selected?.id === d.id ? "border-accent/60" : "border-border"}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">{d.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-text-muted">{typeLabels[d.type] || d.type}</span>
                    <span className="text-xs text-text-muted">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${statusColors[d.status] || ""}`}>
                  {d.status}
                </span>
              </div>
              <p className="text-xs text-text-muted mt-2 line-clamp-2">{d.content.slice(0, 150)}...</p>
            </button>
          ))}
        </div>
      )}

      {/* Draft detail panel */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-8" onClick={() => setSelected(null)}>
          <div className="bg-bg-card border border-border rounded-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-bg-card border-b border-border p-5 flex items-center justify-between">
              <div>
                <h3 className="font-medium">{selected.title}</h3>
                <span className="text-xs text-text-muted">{typeLabels[selected.type] || selected.type}</span>
              </div>
              <div className="flex items-center gap-2">
                {selected.status === "draft" && (
                  <button
                    onClick={() => updateStatus(selected.id, "sent")}
                    className="text-xs px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover"
                  >
                    Mark Sent
                  </button>
                )}
                {selected.status !== "archived" && (
                  <button
                    onClick={() => updateStatus(selected.id, "archived")}
                    className="text-xs px-3 py-1.5 rounded-lg bg-bg-hover text-text-muted hover:text-text"
                  >
                    Archive
                  </button>
                )}
                <button onClick={() => setSelected(null)} className="text-text-muted hover:text-text text-lg ml-2">&times;</button>
              </div>
            </div>
            <div className="p-5">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed">{selected.content}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
