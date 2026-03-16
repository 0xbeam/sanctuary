"use client";

import { useEffect, useState } from "react";
import type { Routine, RoutineRun } from "@atlas/shared";
import { api } from "@/lib/api";

export default function RoutinesPage() {
  const [routines, setRoutines] = useState<(Routine & { _count?: { runs: number } })[]>([]);
  const [selectedRun, setSelectedRun] = useState<RoutineRun | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRoutines().then(setRoutines).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const createRoutine = async (template: "daily_briefing" | "weekly_digest") => {
    const names = { daily_briefing: "Daily Briefing", weekly_digest: "Weekly Digest" };
    const schedules = { daily_briefing: "0 8 * * 1-5", weekly_digest: "0 9 * * 1" };
    const routine = await api.createRoutine({
      name: names[template],
      schedule: schedules[template],
      template,
    });
    setRoutines((prev) => [...prev, routine]);
  };

  const toggleRoutine = async (id: string, enabled: boolean) => {
    setRoutines((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r)));
    await api.updateRoutine(id, { enabled: !enabled }).catch(() => {
      setRoutines((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
    });
  };

  const runNow = async (id: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/routines/${id}/run`, { method: "POST" });
      const run: RoutineRun = await res.json();
      setSelectedRun(run);
    } catch {
      alert("Failed to run routine");
    }
  };

  if (loading) return <div className="p-8"><div className="h-8 w-40 bg-bg-card rounded animate-pulse" /></div>;

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Routines</h1>
          <p className="text-text-muted text-sm mt-1">Automated briefings and digests</p>
        </div>
      </div>

      {/* Create buttons */}
      {routines.length === 0 && (
        <div className="grid grid-cols-2 gap-4 mb-8">
          <button onClick={() => createRoutine("daily_briefing")} className="bg-bg-card border border-border rounded-[var(--radius-lg)] p-6 text-left hover:border-accent/40 transition-colors">
            <h3 className="font-medium mb-1">Daily Briefing</h3>
            <p className="text-sm text-text-muted">Get a morning summary of meetings, action items, and activity. Runs weekdays at 8am.</p>
          </button>
          <button onClick={() => createRoutine("weekly_digest")} className="bg-bg-card border border-border rounded-[var(--radius-lg)] p-6 text-left hover:border-accent/40 transition-colors">
            <h3 className="font-medium mb-1">Weekly Digest</h3>
            <p className="text-sm text-text-muted">Weekly overview of all meetings, decisions, and progress. Runs Mondays at 9am.</p>
          </button>
        </div>
      )}

      {/* Routine list */}
      <div className="space-y-3">
        {routines.map((r) => (
          <div key={r.id} className="bg-bg-card border border-border rounded-[var(--radius-lg)] p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">{r.name}</h3>
                <p className="text-xs text-text-muted mt-1">
                  Schedule: <span className="font-[family-name:var(--font-mono)]">{r.schedule}</span>
                  {r.lastRunAt && ` · Last run: ${new Date(r.lastRunAt).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => runNow(r.id)} className="text-xs text-accent hover:text-accent-hover">Run now</button>
                <button
                  onClick={() => toggleRoutine(r.id, r.enabled)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${r.enabled ? "bg-accent" : "bg-bg-hover"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${r.enabled ? "left-5" : "left-0.5"}`} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Run output modal */}
      {selectedRun && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-8" onClick={() => setSelectedRun(null)}>
          <div className="bg-bg border border-border rounded-[var(--radius-lg)] max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Briefing Output</h3>
              <button onClick={() => setSelectedRun(null)} className="text-text-muted hover:text-text">&times;</button>
            </div>
            <div className="prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-sm text-text-muted">{selectedRun.output}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
