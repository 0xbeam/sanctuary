import { useState, useMemo } from "react";
import { Bot, CheckCircle2, XCircle, Loader2, Clock, ChevronRight } from "lucide-react";
import { useData } from "../../contexts/DataContext";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { SourceIcon } from "../feed/SourceIcon";
import { ResultDetailPanel } from "./ResultDetailPanel";

const STATUS_CONFIG = {
  pending: { icon: Clock, color: "text-stone-400", bg: "bg-stone-50", label: "Pending" },
  processing: { icon: Loader2, color: "text-amber-500", bg: "bg-amber-50", label: "Processing", animate: true },
  complete: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50", label: "Complete" },
  error: { icon: XCircle, color: "text-red-500", bg: "bg-red-50", label: "Failed" },
};

export function AgentDispatchView() {
  const { jobs, instructions } = useData();
  const [selectedJobId, setSelectedJobId] = useState(null);

  // Find the matching instruction result for a selected job
  const selectedJob = useMemo(() => jobs.find((j) => j.id === selectedJobId), [jobs, selectedJobId]);

  // Try to match a job to an instruction (by URL or project)
  const matchedInstruction = useMemo(() => {
    if (!selectedJob) return null;
    return instructions.find(
      (inst) => inst.sourceUrl === selectedJob.url || inst.id === selectedJob.resultId
    );
  }, [selectedJob, instructions]);

  // Also allow selecting an instruction directly if we have results
  const [selectedInstructionId, setSelectedInstructionId] = useState(null);
  const directInstruction = useMemo(
    () => instructions.find((i) => i.id === selectedInstructionId),
    [instructions, selectedInstructionId]
  );

  const activeInstruction = matchedInstruction || directInstruction;

  const handleSelectJob = (job) => {
    setSelectedJobId(job.id);
    setSelectedInstructionId(null);
  };

  const handleSelectResult = (inst) => {
    setSelectedInstructionId(inst.id);
    setSelectedJobId(null);
  };

  return (
    <div className="view-enter h-full flex gap-0 -m-6">
      {/* ═══ Left panel — Jobs & Results list ═══ */}
      <div className="w-[380px] min-w-[340px] flex-shrink-0 border-r border-stone-200 bg-white flex flex-col h-full">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-stone-100">
          <h2 className="font-serif text-xl font-semibold tracking-tight-editorial text-stone-900">
            Agent Dispatch
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Subagent jobs processed in parallel
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Active Jobs */}
          {jobs.length > 0 && (
            <div className="px-4 pt-3">
              <p className="gravity-label px-1 mb-2">Jobs ({jobs.length})</p>
              <div className="space-y-1.5">
                {jobs.map((job) => (
                  <AgentJobRow
                    key={job.id}
                    job={job}
                    isSelected={selectedJobId === job.id}
                    onClick={() => handleSelectJob(job)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed Results */}
          {instructions.length > 0 && (
            <div className="px-4 pt-4 pb-4">
              <p className="gravity-label px-1 mb-2">Results ({instructions.length})</p>
              <div className="space-y-1.5">
                {instructions.map((inst) => (
                  <ResultRow
                    key={inst.id}
                    instruction={inst}
                    isSelected={selectedInstructionId === inst.id}
                    onClick={() => handleSelectResult(inst)}
                  />
                ))}
              </div>
            </div>
          )}

          {jobs.length === 0 && instructions.length === 0 && (
            <div className="p-6">
              <EmptyState
                icon={Bot}
                title="No dispatch jobs yet"
                subtitle="Use 'New Scrape' to dispatch URLs"
              />
            </div>
          )}

          {/* How it works — only show when empty */}
          {jobs.length === 0 && (
            <div className="px-4 pb-4">
              <div className="p-4 bg-surface rounded-xl">
                <p className="gravity-label mb-2">How Dispatch Works</p>
                <div className="space-y-1.5 text-xs text-stone-600">
                  <p>1. Paste URLs into the scrape modal</p>
                  <p>2. Auto-detected (Slack, Figma, Twitter…)</p>
                  <p>3. Subagents process in parallel</p>
                  <p>4. Results appear here →</p>
                </div>
                <div className="mt-3 bg-white rounded-lg px-3 py-2 border border-stone-200">
                  <code className="text-[10px] font-mono text-stone-600">
                    node bin/cli.js dispatch url1 url2
                  </code>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Right panel — Result Detail ═══ */}
      <div className="flex-1 bg-white overflow-hidden">
        <ResultDetailPanel
          instruction={activeInstruction}
          job={selectedJob}
        />
      </div>
    </div>
  );
}

/* ─── Job Row ─── */
function AgentJobRow({ job, isSelected, onClick }) {
  const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;

  return (
    <div
      onClick={onClick}
      className={`
        flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150
        ${isSelected
          ? "bg-accent/5 border border-accent/20 shadow-sm"
          : "hover:bg-stone-50 border border-transparent"
        }
      `}
    >
      <SourceIcon source={job.detectedSource} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono text-stone-700 truncate">{job.url}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {job.project && (
            <span className="font-mono text-accent font-medium uppercase tracking-wider text-[9px]">
              {job.project}
            </span>
          )}
          <span className="text-[10px] text-stone-400">
            {new Date(job.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
      <div className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
        <StatusIcon className={`w-3 h-3 ${config.animate ? "animate-spin" : ""}`} />
        {config.label}
      </div>
      {isSelected && <ChevronRight className="w-3 h-3 text-accent flex-shrink-0" />}
    </div>
  );
}

/* ─── Result Row ─── */
function ResultRow({ instruction, isSelected, onClick }) {
  const { title, source, project, stats, scrapedAt } = instruction;

  return (
    <div
      onClick={onClick}
      className={`
        flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150
        ${isSelected
          ? "bg-accent/5 border border-accent/20 shadow-sm"
          : "hover:bg-stone-50 border border-transparent"
        }
      `}
    >
      <SourceIcon source={source} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-stone-800 truncate leading-snug">{title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {project && (
            <span className="font-mono text-accent font-medium uppercase tracking-wider text-[9px]">
              {project}
            </span>
          )}
          {stats.blockerCount > 0 && (
            <span className="text-[10px] text-red-500 font-medium">{stats.blockerCount} blocker{stats.blockerCount > 1 ? "s" : ""}</span>
          )}
          {stats.revisionCount > 0 && (
            <span className="text-[10px] text-amber-600 font-medium">{stats.revisionCount} change{stats.revisionCount > 1 ? "s" : ""}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        {isSelected && <ChevronRight className="w-3 h-3 text-accent" />}
      </div>
    </div>
  );
}
