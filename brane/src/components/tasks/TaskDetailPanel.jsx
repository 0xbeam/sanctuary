import { useMemo } from "react";
import { GitCommit, User, Clock, Tag, AlertCircle, CheckCircle2, Layers } from "lucide-react";
import { Card } from "../ui/Card";
import { useAgents } from "../../contexts/AgentContext";
import { useTasks } from "../../contexts/TaskContext";

const TYPE_COLORS = {
  scrape: "bg-cyan-50 text-cyan-700",
  code: "bg-violet-50 text-violet-700",
  review: "bg-amber-50 text-amber-700",
  deploy: "bg-emerald-50 text-emerald-700",
  research: "bg-blue-50 text-blue-700",
};

const STATUS_COLORS = {
  pending: "bg-stone-100 text-stone-600",
  queued: "bg-stone-100 text-stone-600",
  running: "bg-amber-50 text-amber-700",
  "in-progress": "bg-amber-50 text-amber-700",
  processing: "bg-amber-50 text-amber-700",
  complete: "bg-emerald-50 text-emerald-700",
  done: "bg-emerald-50 text-emerald-700",
  error: "bg-red-50 text-red-600",
  failed: "bg-red-50 text-red-600",
};

function relativeTime(ts) {
  if (!ts) return "—";
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function TaskDetailPanel({ task }) {
  const { agents } = useAgents();
  const { tasks } = useTasks();

  const agent = useMemo(() => {
    if (!task.agentId) return null;
    return agents.find((a) => a.id === task.agentId);
  }, [task.agentId, agents]);

  const subTasks = useMemo(() => {
    return tasks.filter((t) => t.parentTaskId === task.id);
  }, [tasks, task.id]);

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-stone-100">
        <h3 className="font-serif text-xl font-semibold tracking-tight-editorial text-stone-900 mb-2">
          {task.title || task.type || task.id}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {task.type && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[task.type] || "bg-stone-100 text-stone-600"}`}>
              {task.type}
            </span>
          )}
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[task.status] || "bg-stone-100 text-stone-600"}`}>
            {task.status}
          </span>
          {task.priority && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-orange-50 text-orange-700">
              P{task.priority}
            </span>
          )}
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Agent Assignment */}
        {agent && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-stone-400" />
              <h4 className="text-sm font-semibold text-stone-900">Assigned Agent</h4>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full ${agent.status === "active" ? "bg-emerald-400" : "bg-stone-300"}`} />
              <span className="text-stone-700 font-medium">
                {agent.name || agent.slug || `Agent ${(agent.id || "").slice(0, 6)}`}
              </span>
              {agent.branch && agent.branch !== "HEAD" && (
                <span className="font-mono text-accent text-[10px]">{agent.branch}</span>
              )}
            </div>
          </Card>
        )}

        {/* Input */}
        {task.input && (
          <Card className="p-4">
            <h4 className="text-sm font-semibold text-stone-900 mb-2">Input</h4>
            <pre className="text-xs font-mono text-stone-600 bg-surface rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
              {typeof task.input === "string" ? task.input : JSON.stringify(task.input, null, 2)}
            </pre>
          </Card>
        )}

        {/* Output */}
        {task.output && (
          <Card className="p-4">
            <h4 className="text-sm font-semibold text-stone-900 mb-2">Output</h4>
            <pre className="text-xs font-mono text-stone-600 bg-surface rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
              {typeof task.output === "string" ? task.output : JSON.stringify(task.output, null, 2)}
            </pre>
          </Card>
        )}

        {/* Commits */}
        {task.commits && task.commits.length > 0 && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <GitCommit className="w-4 h-4 text-stone-400" />
              <h4 className="text-sm font-semibold text-stone-900">Commits</h4>
            </div>
            <div className="space-y-1.5">
              {task.commits.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="font-mono text-stone-400 flex-shrink-0">{(c.sha || c.hash || "").slice(0, 7)}</span>
                  <span className="text-stone-600">{c.message || c}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Sub-tasks */}
        {subTasks.length > 0 && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4 text-stone-400" />
              <h4 className="text-sm font-semibold text-stone-900">Sub-tasks ({subTasks.length})</h4>
            </div>
            <div className="space-y-1.5">
              {subTasks.map((st) => (
                <div key={st.id} className="flex items-center gap-2 text-xs px-2 py-1.5 bg-surface rounded-lg">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    st.status === "complete" || st.status === "done" ? "bg-emerald-400"
                    : st.status === "running" || st.status === "in-progress" ? "bg-amber-400"
                    : st.status === "error" || st.status === "failed" ? "bg-red-400"
                    : "bg-stone-300"
                  }`} />
                  <span className="text-stone-700 truncate">{st.title || st.type || st.id}</span>
                  <span className="text-stone-400 ml-auto">{st.status}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Timeline / Activity */}
        {task.activity && task.activity.length > 0 && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-stone-400" />
              <h4 className="text-sm font-semibold text-stone-900">Timeline</h4>
            </div>
            <div className="space-y-1.5">
              {task.activity.map((entry, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-stone-400 font-mono flex-shrink-0 w-14 text-right">
                    {entry.timestamp
                      ? new Date(entry.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                      : ""
                    }
                  </span>
                  <span className={`flex-shrink-0 ${
                    entry.stage === "error" ? "text-red-400"
                    : entry.stage === "done" ? "text-emerald-400"
                    : "text-stone-400"
                  }`}>
                    {entry.stage === "error" ? <AlertCircle className="w-3 h-3" />
                     : entry.stage === "done" ? <CheckCircle2 className="w-3 h-3" />
                     : <Clock className="w-3 h-3" />
                    }
                  </span>
                  <span className="text-stone-600">
                    {entry.label && <span className="font-medium text-stone-700">{entry.label}</span>}
                    {entry.label && entry.message ? " — " : ""}
                    {entry.message}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Metadata */}
        <Card className="p-4">
          <h4 className="text-sm font-semibold text-stone-900 mb-2">Metadata</h4>
          <div className="space-y-1.5 text-xs">
            <div className="flex gap-2">
              <span className="text-stone-500 w-20">ID</span>
              <span className="font-mono text-stone-600">{task.id}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-stone-500 w-20">Created</span>
              <span className="text-stone-600">{relativeTime(task.createdAt)}</span>
            </div>
            {task.branch && (
              <div className="flex gap-2">
                <span className="text-stone-500 w-20">Branch</span>
                <span className="font-mono text-accent">{task.branch}</span>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
