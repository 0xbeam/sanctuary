import { Bot, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { useData } from "../../contexts/DataContext";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { SourceIcon } from "../feed/SourceIcon";

const STATUS_CONFIG = {
  pending: { icon: Clock, color: "text-stone-400", label: "Pending" },
  processing: { icon: Loader2, color: "text-amber-500", label: "Processing", animate: true },
  complete: { icon: CheckCircle2, color: "text-emerald-500", label: "Complete" },
  error: { icon: XCircle, color: "text-red-500", label: "Failed" },
};

export function AgentDispatchView() {
  const { jobs } = useData();

  return (
    <div className="view-enter max-w-2xl">
      <div className="mb-5">
        <h2 className="font-serif text-2xl font-semibold tracking-tight-editorial text-stone-900">
          Agent Dispatch
        </h2>
        <p className="text-xs text-stone-500 mt-0.5">
          Subagent jobs — each URL gets auto-detected and processed in parallel
        </p>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No dispatch jobs yet"
          subtitle="Use 'New Scrape' to dispatch URLs for processing"
        />
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <AgentJobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      {/* How it works */}
      <div className="mt-6 p-4 bg-white rounded-xl border border-stone-200">
        <p className="gravity-label mb-2">How Dispatch Works</p>
        <div className="space-y-1.5 text-xs text-stone-600">
          <p>1. Paste one or more URLs into the scrape modal</p>
          <p>2. Each URL is auto-detected (Slack, Figma, Twitter, URL)</p>
          <p>3. Subagents process all URLs in parallel</p>
          <p>4. Results appear in the Feed as instruction cards</p>
        </div>
        <div className="mt-3 bg-surface rounded-lg px-3 py-2">
          <code className="text-xs font-mono text-stone-600">
            node bin/cli.js dispatch url1 url2 url3 --project myproject
          </code>
        </div>
      </div>
    </div>
  );
}

function AgentJobCard({ job }) {
  const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;

  return (
    <Card className="p-3">
      <div className="flex items-center gap-3">
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
              {new Date(job.createdAt).toLocaleTimeString()}
            </span>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-medium ${config.color}`}>
          <StatusIcon className={`w-4 h-4 ${config.animate ? "animate-spin" : ""}`} />
          {config.label}
        </div>
      </div>
      {job.error && (
        <p className="text-xs text-red-500 mt-2 bg-red-50 px-3 py-1.5 rounded">{job.error}</p>
      )}
    </Card>
  );
}
