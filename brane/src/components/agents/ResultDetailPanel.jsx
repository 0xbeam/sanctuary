import { useState, useEffect } from "react";
import { ExternalLink, Image, CheckSquare, Square, FileText, Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import { CategoryBadge } from "../feed/CategoryBadge";
import { SourceIcon } from "../feed/SourceIcon";
import { useData } from "../../contexts/DataContext";
import { AgentActivityView } from "./AgentActivityView";

export function ResultDetailPanel({ instruction, job }) {
  const { loadInstruction, instructionCache } = useData();
  const [detail, setDetail] = useState(null);
  const [checkedItems, setCheckedItems] = useState({});
  const [copied, setCopied] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);

  useEffect(() => {
    if (!instruction) { setDetail(null); return; }
    const cached = instructionCache[instruction.id];
    if (cached) {
      setDetail(cached);
    } else {
      loadInstruction(instruction.id).then(setDetail);
    }
    setCheckedItems({});
    setThreadOpen(false);
  }, [instruction?.id, loadInstruction, instructionCache]);

  const toggleCheck = (idx) => {
    setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const copyMarkdown = () => {
    if (!detail) return;
    const lines = [];
    lines.push(`# ${detail.title}`);
    lines.push(`**Source:** ${detail.source} · **Project:** ${detail.project || "—"}`);
    lines.push(`**URL:** ${detail.sourceUrl}`);
    lines.push("");
    if (detail.root?.text) {
      lines.push("## Context");
      lines.push(detail.root.text);
      lines.push("");
    }
    const blockers = detail.replies?.filter((r) => r.category === "blocker") || [];
    const revisions = detail.replies?.filter((r) => r.category === "revision") || [];
    const questions = detail.replies?.filter((r) => r.category === "question") || [];
    const actionItems = [...blockers, ...revisions, ...questions];
    if (actionItems.length > 0) {
      lines.push("## Agent Instructions");
      actionItems.forEach((item) => {
        lines.push(`- [ ] **[${item.category}]** ${item.text} _(${item.author})_`);
      });
    }
    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ═══ Empty state — no selection ═══
  if (!instruction && !job) {
    return (
      <div className="h-full flex items-center justify-center text-center px-8">
        <div>
          <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center mx-auto mb-3">
            <FileText className="w-5 h-5 text-stone-400" />
          </div>
          <p className="text-sm font-medium text-stone-500">Select a job to view results</p>
          <p className="text-xs text-stone-400 mt-1">Click any dispatch job on the left</p>
        </div>
      </div>
    );
  }

  // ═══ Active job — show the live agent activity view ═══
  if (job && (job.status === "pending" || job.status === "processing" || (job.status === "error" && !instruction))) {
    return <AgentActivityView job={job} />;
  }

  // ═══ Job just completed but we can show both: activity + result ═══
  // If job is complete and we have an instruction, show the result detail
  // But also show the activity log if there's recent activity

  // ═══ Loading detail ═══
  if (!detail) {
    return (
      <div className="p-6 space-y-4">
        <div className="skeleton-shimmer h-6 w-2/3 rounded" />
        <div className="skeleton-shimmer h-4 w-1/2 rounded" />
        <div className="skeleton-shimmer h-24 w-full rounded-lg" />
        <div className="skeleton-shimmer h-16 w-full rounded-lg" />
        <div className="skeleton-shimmer h-16 w-full rounded-lg" />
      </div>
    );
  }

  const blockers = detail.replies?.filter((r) => r.category === "blocker") || [];
  const revisions = detail.replies?.filter((r) => r.category === "revision") || [];
  const questions = detail.replies?.filter((r) => r.category === "question") || [];
  const approvals = detail.replies?.filter((r) => r.category === "approval") || [];
  const actionItems = [...blockers, ...revisions, ...questions];

  return (
    <div className="h-full overflow-y-auto animate-in">
      {/* Completed job activity — collapsible at top */}
      {job && job.status === "complete" && job.activity?.length > 0 && (
        <CompletedActivitySummary job={job} />
      )}

      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-stone-200 px-5 py-3">
        <div className="flex items-center gap-3">
          <SourceIcon source={detail.source} size="sm" />
          <div className="flex-1 min-w-0">
            <h3 className="font-serif text-lg font-semibold tracking-tight-editorial text-stone-900 truncate">
              {detail.title}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              {detail.project && (
                <span className="font-mono text-accent font-medium uppercase tracking-wider text-[9px]">
                  {detail.project}
                </span>
              )}
              <span className="text-[10px] text-stone-400">
                {new Date(detail.scrapedAt).toLocaleDateString("en-US", {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={copyMarkdown}
              className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors"
              title="Copy as markdown"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </button>
            <a
              href={detail.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors"
              title="Open original"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Context */}
        <div>
          <p className="gravity-label mb-2">Context</p>
          <div className="bg-surface rounded-lg p-4 text-sm text-stone-700 whitespace-pre-wrap leading-relaxed">
            <p className="text-xs text-stone-500 mb-2 font-medium">{detail.root?.author}</p>
            {detail.root?.text}
          </div>
          {detail.root?.attachments?.length > 0 && (
            <div className="flex gap-2 mt-2 overflow-x-auto">
              {detail.root.attachments.filter((a) => a.type === "image").map((att, i) => (
                <div key={i} className="flex-shrink-0 bg-stone-100 rounded-lg p-2">
                  <div className="flex items-center gap-1.5 text-xs text-stone-500">
                    <Image className="w-3 h-3" />
                    {att.title || att.name}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Agent Instructions Checklist */}
        {actionItems.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="gravity-label">Agent Instructions</p>
              <span className="text-[10px] text-stone-400 font-mono">
                {Object.values(checkedItems).filter(Boolean).length}/{actionItems.length}
              </span>
            </div>
            <div className="h-1 bg-stone-100 rounded-full mb-3 overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${(Object.values(checkedItems).filter(Boolean).length / actionItems.length) * 100}%`,
                }}
              />
            </div>
            <div className="space-y-1.5">
              {actionItems.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => toggleCheck(idx)}
                  className="flex items-start gap-2.5 p-3 bg-white border border-stone-200 rounded-lg cursor-pointer hover:bg-stone-50 transition-colors"
                >
                  {checkedItems[idx] ? (
                    <CheckSquare className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                  ) : (
                    <Square className="w-4 h-4 text-stone-300 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${checkedItems[idx] ? "line-through text-stone-400" : "text-stone-800"}`}>
                      {item.text}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <CategoryBadge category={item.category} />
                      <span className="text-xs text-stone-400">{item.author}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Approvals */}
        {approvals.length > 0 && (
          <div>
            <p className="gravity-label mb-2">Approvals</p>
            <div className="space-y-1">
              {approvals.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-stone-600 py-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="font-medium">{a.author}</span>
                  <span className="text-stone-400 truncate">{a.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Full Thread */}
        {detail.allEntries?.length > 0 && (
          <div className="border-t border-stone-100 pt-4">
            <button
              onClick={() => setThreadOpen(!threadOpen)}
              className="flex items-center gap-1.5 gravity-label hover:text-stone-700 transition-colors w-full text-left"
            >
              {threadOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Full Thread ({detail.allEntries.length} entries)
            </button>
            {threadOpen && (
              <div className="mt-3 space-y-2">
                {detail.allEntries.map((entry, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-white rounded-lg border border-stone-100">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-stone-700">{entry.author}</span>
                        <CategoryBadge category={entry.category} />
                        <span className="text-xs text-stone-400">
                          {new Date(entry.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-sm text-stone-600 whitespace-pre-wrap">{entry.text}</p>
                      {entry.attachments?.length > 0 && (
                        <div className="flex gap-1.5 mt-2">
                          {entry.attachments.map((att, j) => (
                            <span key={j} className="text-xs bg-stone-100 px-2 py-0.5 rounded flex items-center gap-1">
                              <Image className="w-3 h-3" />
                              {att.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact completed activity summary bar */
function CompletedActivitySummary({ job }) {
  const [expanded, setExpanded] = useState(false);
  const duration = job.completedAt
    ? ((new Date(job.completedAt) - new Date(job.createdAt)) / 1000).toFixed(1)
    : "—";

  return (
    <div className="border-b border-stone-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-2 flex items-center gap-2 text-xs bg-emerald-50/50 hover:bg-emerald-50 transition-colors"
      >
        <span className="text-emerald-600">✓</span>
        <span className="text-emerald-700 font-medium">Pipeline completed in {duration}s</span>
        <span className="text-stone-400 ml-1">• {job.activity?.length || 0} steps</span>
        <ChevronDown className={`w-3 h-3 text-stone-400 ml-auto transition-transform ${expanded ? "" : "-rotate-90"}`} />
      </button>
      {expanded && (
        <div className="bg-stone-950 px-5 py-3 font-mono text-[11px] max-h-48 overflow-y-auto">
          {(job.activity || []).map((entry, i) => (
            <div key={i} className="flex gap-2 py-0.5 text-stone-400">
              <span className="text-stone-600 w-14 text-right flex-shrink-0">
                +{((entry.timestamp - new Date(job.createdAt).getTime()) / 1000).toFixed(1)}s
              </span>
              <span className={entry.stage === "done" ? "text-emerald-400" : "text-stone-500"}>
                {entry.stage === "done" ? "✓" : "▸"}
              </span>
              <span>
                <span className="text-stone-300">{entry.label}</span>
                {" — "}{entry.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
