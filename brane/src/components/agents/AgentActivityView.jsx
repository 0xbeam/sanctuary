import { useState, useEffect, useRef } from "react";
import { SourceIcon } from "../feed/SourceIcon";

const PIPELINE_STAGES = [
  { id: "detect", label: "Detect", icon: "🔍" },
  { id: "connect", label: "Connect", icon: "🔗" },
  { id: "fetch", label: "Fetch", icon: "📡" },
  { id: "parse", label: "Parse", icon: "🧩" },
  { id: "categorize", label: "Categorize", icon: "🏷️" },
  { id: "markdown", label: "Generate", icon: "📝" },
  { id: "assets", label: "Assets", icon: "🖼️" },
  { id: "save", label: "Save", icon: "💾" },
  { id: "done", label: "Done", icon: "✓" },
];

/**
 * Live agent activity visualization — replaces the boring spinner.
 * Shows a pipeline of stages with live log entries streaming in.
 */
export function AgentActivityView({ job }) {
  const logEndRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);

  // Timer
  useEffect(() => {
    if (job.status !== "processing" && job.status !== "pending") return;
    const start = new Date(job.createdAt).getTime();
    const timer = setInterval(() => {
      setElapsed(((Date.now() - start) / 1000).toFixed(1));
    }, 100);
    return () => clearInterval(timer);
  }, [job.status, job.createdAt]);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [job.activity?.length]);

  const currentIdx = job.stageIndex ?? -1;
  const isActive = job.status === "processing" || job.status === "pending";
  const isError = job.status === "error";
  const isDone = job.status === "complete";

  return (
    <div className="h-full flex flex-col animate-in">
      {/* Header bar */}
      <div className="px-5 py-4 border-b border-stone-200 bg-white">
        <div className="flex items-center gap-3">
          <SourceIcon source={job.detectedSource} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-stone-600 truncate">{job.url}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {job.project && (
                <span className="font-mono text-accent font-medium uppercase tracking-wider text-[9px]">
                  {job.project}
                </span>
              )}
              <span className="text-[10px] text-stone-400">
                {new Date(job.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>
          </div>
          {/* Timer */}
          <div className={`font-mono text-sm tabular-nums ${isActive ? "text-amber-600" : isDone ? "text-emerald-600" : "text-red-500"}`}>
            {isDone && job.completedAt
              ? `${((new Date(job.completedAt) - new Date(job.createdAt)) / 1000).toFixed(1)}s`
              : isActive
                ? `${elapsed}s`
                : "—"
            }
          </div>
        </div>
      </div>

      {/* Pipeline visualization */}
      <div className="px-5 py-4 border-b border-stone-100 bg-stone-50/50">
        <div className="flex items-center gap-0.5">
          {PIPELINE_STAGES.map((stage, i) => {
            const isPast = i < currentIdx;
            const isCurrent = i === currentIdx && isActive;
            const isFuture = i > currentIdx;
            const isErrorStage = isError && i === currentIdx;

            return (
              <div key={stage.id} className="flex items-center flex-1 min-w-0">
                {/* Node */}
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div
                    className={`
                      w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all duration-300
                      ${isPast || isDone ? "bg-emerald-100 text-emerald-700 scale-100" : ""}
                      ${isCurrent ? "bg-amber-100 text-amber-700 scale-110 shadow-sm ring-2 ring-amber-300/50" : ""}
                      ${isErrorStage ? "bg-red-100 text-red-600 scale-110 ring-2 ring-red-300/50" : ""}
                      ${isFuture && !isDone ? "bg-stone-100 text-stone-400 scale-90" : ""}
                    `}
                  >
                    {isPast || isDone ? "✓" : stage.icon}
                  </div>
                  <span className={`text-[8px] font-medium leading-none text-center ${
                    isCurrent ? "text-amber-700" : isPast || isDone ? "text-emerald-700" : "text-stone-400"
                  }`}>
                    {stage.label}
                  </span>
                </div>
                {/* Connector line */}
                {i < PIPELINE_STAGES.length - 1 && (
                  <div className={`h-px flex-shrink-0 w-2 mt-[-10px] transition-colors duration-300 ${
                    isPast || isDone ? "bg-emerald-300" : isCurrent ? "bg-amber-300" : "bg-stone-200"
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Live activity log — terminal style */}
      <div className="flex-1 overflow-y-auto bg-stone-950 p-4 font-mono text-xs">
        {/* Header line */}
        <div className="text-stone-600 mb-3">
          <span className="text-stone-500">{">"}</span>{" "}
          <span className="text-emerald-500">brane</span>{" "}
          <span className="text-stone-400">scrape</span>{" "}
          <span className="text-cyan-400">{job.url}</span>
          {job.project && <span className="text-stone-500"> --project {job.project}</span>}
        </div>

        {/* Activity entries */}
        {(job.activity || []).map((entry, i) => {
          const isLast = i === (job.activity?.length || 0) - 1 && isActive;
          const isErr = entry.stage === "error";

          return (
            <div
              key={i}
              className={`flex gap-2 py-0.5 leading-relaxed ${isLast ? "animate-pulse-subtle" : ""}`}
            >
              <span className="text-stone-600 flex-shrink-0 w-16 text-right">
                {formatTime(entry.timestamp, job.createdAt)}
              </span>
              <span className={`flex-shrink-0 ${
                isErr ? "text-red-400" : entry.stage === "done" ? "text-emerald-400" : "text-amber-500"
              }`}>
                {isErr ? "✗" : entry.stage === "done" ? "✓" : "▸"}
              </span>
              <span className={`${
                isErr ? "text-red-300" : "text-stone-400"
              }`}>
                <span className={`font-semibold ${
                  isErr ? "text-red-400" : entry.stage === "done" ? "text-emerald-400" : "text-stone-300"
                }`}>
                  {entry.label}
                </span>
                {" — "}
                {entry.message}
              </span>
            </div>
          );
        })}

        {/* Cursor blink when active */}
        {isActive && (
          <div className="flex gap-2 py-0.5 mt-1">
            <span className="text-stone-600 flex-shrink-0 w-16 text-right">
              {elapsed}s
            </span>
            <span className="text-emerald-500 animate-blink">▊</span>
          </div>
        )}

        {/* Done summary */}
        {isDone && job.stats && (
          <div className="mt-3 pt-3 border-t border-stone-800">
            <div className="text-emerald-400">
              ✓ Instruction set complete
            </div>
            <div className="text-stone-500 mt-1 space-y-0.5">
              <p>  entries: <span className="text-stone-300">{job.stats.totalEntries}</span></p>
              {job.stats.blockerCount > 0 && (
                <p>  blockers: <span className="text-red-400">{job.stats.blockerCount}</span></p>
              )}
              {job.stats.revisionCount > 0 && (
                <p>  changes: <span className="text-amber-400">{job.stats.revisionCount}</span></p>
              )}
              {job.stats.imageCount > 0 && (
                <p>  images: <span className="text-cyan-400">{job.stats.imageCount}</span></p>
              )}
            </div>
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="mt-3 pt-3 border-t border-stone-800">
            <div className="text-red-400">
              ✗ Pipeline failed
            </div>
            <div className="text-red-300/70 mt-1 bg-red-950/30 rounded px-3 py-2">
              {job.error}
            </div>
          </div>
        )}

        <div ref={logEndRef} />
      </div>
    </div>
  );
}

function formatTime(timestamp, createdAt) {
  const baseTime = new Date(createdAt).getTime();
  const diff = (timestamp - baseTime) / 1000;
  return `+${diff.toFixed(1)}s`;
}
