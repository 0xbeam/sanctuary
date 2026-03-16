"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ActionItem } from "@atlas/shared";
import { api } from "@/lib/api";

type Filter = "all" | "open" | "done";

export default function ActionItemsPage() {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getActionItems().then(setItems).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? items : items.filter((i) => i.status === filter);
  const counts = { all: items.length, open: items.filter((i) => i.status === "open").length, done: items.filter((i) => i.status === "done").length };

  // Group by assignee
  const grouped: Record<string, ActionItem[]> = {};
  for (const item of filtered) {
    const key = item.assignee || "Unassigned";
    (grouped[key] = grouped[key] || []).push(item);
  }

  const toggle = async (id: string, current: string) => {
    const newStatus = current === "open" ? "done" : "open";
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i)));
    await api.updateActionItem(id, newStatus).catch(() => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: current } : i)));
    });
  };

  if (loading) return <div className="p-8"><div className="h-8 w-40 bg-bg-card rounded animate-pulse" /></div>;

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-semibold mb-6">Action Items</h1>

      {/* Filter */}
      <div className="flex gap-1 mb-6">
        {(["all", "open", "done"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-sm px-3 py-1.5 rounded-lg capitalize transition-colors ${filter === f ? "bg-accent text-white" : "text-text-muted hover:text-text hover:bg-bg-hover"}`}
          >
            {f} ({counts[f]})
          </button>
        ))}
      </div>

      {/* Grouped items */}
      {Object.keys(grouped).length === 0 ? (
        <p className="text-text-muted text-sm">No action items found.</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([assignee, assigneeItems]) => (
            <div key={assignee}>
              <h2 className="text-sm font-medium text-text-muted mb-2">{assignee}</h2>
              <div className="space-y-2">
                {assigneeItems.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 bg-bg-card border border-border rounded-lg p-3">
                    <button onClick={() => toggle(item.id, item.status)} className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center ${item.status === "done" ? "bg-success border-success" : "border-text-muted"}`}>
                      {item.status === "done" && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${item.status === "done" ? "line-through text-text-muted" : ""}`}>{item.text}</p>
                      <div className="flex gap-3 mt-1">
                        {item.deadline && <span className="text-xs text-text-muted">Due: {item.deadline}</span>}
                        {item.meeting && (
                          <Link href={`/meetings/${item.meeting.id}`} className="text-xs text-accent hover:text-accent-hover">
                            {item.meeting.title || "Meeting"}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
