import { useState, useEffect, useCallback } from "react";
import { GitBranch, GitCommit, FolderOpen, Hash, Clock, Cpu, CheckCircle2, AlertCircle } from "lucide-react";
import { Card } from "../ui/Card";
import { useTasks } from "../../contexts/TaskContext";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3210";

function relativeTime(ts) {
  if (!ts) return "—";
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatusBadge({ status }) {
  const styles = {
    active: "bg-emerald-50 text-emerald-700",
    idle: "bg-stone-100 text-stone-600",
    terminated: "bg-red-50 text-red-600",
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${styles[status] || styles.idle}`}>
      {status || "unknown"}
    </span>
  );
}

export function AgentDetailPanel({ agent }) {
  const { tasks } = useTasks();
  const [gitStatus, setGitStatus] = useState(null);
  const [branches, setBranches] = useState([]);
  const [switching, setSwitching] = useState(false);

  const agentTasks = tasks.filter((t) => t.agentId === agent.id);

  // Fetch git status
  const fetchGitStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/git/${agent.id}/status`);
      if (res.ok) {
        const data = await res.json();
        setGitStatus(data);
      }
    } catch { /* skip */ }
  }, [agent.id]);

  // Fetch branches
  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/git/${agent.id}/branches`);
      if (res.ok) {
        const data = await res.json();
        setBranches(data.branches || data || []);
      }
    } catch { /* skip */ }
  }, [agent.id]);

  useEffect(() => {
    fetchGitStatus();
    fetchBranches();
  }, [fetchGitStatus, fetchBranches]);

  const handleCheckout = async (branch) => {
    setSwitching(true);
    try {
      await fetch(`${API_BASE}/api/git/${agent.id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch }),
      });
      await fetchGitStatus();
    } catch { /* skip */ }
    setSwitching(false);
  };

  const name = agent.name || agent.slug || `Agent ${(agent.id || "").slice(0, 6)}`;

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-stone-100">
        <div className="flex items-center gap-3">
          <h3 className="font-serif text-xl font-semibold tracking-tight-editorial text-stone-900">
            {name}
          </h3>
          <StatusBadge status={agent.status} />
          {agent.model && (
            <span className="text-[10px] font-mono text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
              {agent.model}
            </span>
          )}
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Git Section */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <GitBranch className="w-4 h-4 text-stone-400" />
            <h4 className="text-sm font-semibold text-stone-900">Git</h4>
            {gitStatus && (
              <span className={`ml-auto text-[10px] font-medium ${gitStatus.dirty ? "text-amber-600" : "text-emerald-600"}`}>
                {gitStatus.dirty ? "dirty" : "clean"}
              </span>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-stone-500 w-16">Branch</span>
              <span className="font-mono text-accent font-medium">
                {gitStatus?.branch || agent.branch || "—"}
              </span>
            </div>

            {/* Branch Switcher */}
            {branches.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  className="text-xs bg-surface rounded-lg px-2 py-1.5 border-0 text-stone-600 outline-none flex-1"
                  defaultValue=""
                  onChange={(e) => e.target.value && handleCheckout(e.target.value)}
                  disabled={switching}
                >
                  <option value="" disabled>Switch branch...</option>
                  {branches.map((b) => (
                    <option key={typeof b === "string" ? b : b.name} value={typeof b === "string" ? b : b.name}>
                      {typeof b === "string" ? b : b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Recent commits */}
            {gitStatus?.commits && gitStatus.commits.length > 0 && (
              <div className="pt-2 border-t border-stone-100">
                <p className="gravity-label mb-1.5">Recent Commits</p>
                <div className="space-y-1">
                  {gitStatus.commits.slice(0, 5).map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <GitCommit className="w-3 h-3 text-stone-300 mt-0.5 flex-shrink-0" />
                      <span className="text-stone-600 truncate">{c.message || c}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Active Tasks */}
        <Card className="p-4">
          <h4 className="text-sm font-semibold text-stone-900 mb-3">Active Tasks</h4>
          {agentTasks.length > 0 ? (
            <div className="space-y-1.5">
              {agentTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2 text-xs px-2 py-1.5 bg-surface rounded-lg">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    task.status === "running" || task.status === "in-progress" ? "bg-amber-400"
                    : task.status === "complete" || task.status === "done" ? "bg-emerald-400"
                    : task.status === "error" || task.status === "failed" ? "bg-red-400"
                    : "bg-stone-300"
                  }`} />
                  <span className="text-stone-700 truncate">{task.title || task.type || task.id}</span>
                  <span className="text-stone-400 ml-auto">{task.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-stone-400">No tasks assigned</p>
          )}
        </Card>

        {/* Info */}
        <Card className="p-4">
          <h4 className="text-sm font-semibold text-stone-900 mb-3">Info</h4>
          <div className="space-y-2 text-xs">
            <InfoRow icon={FolderOpen} label="CWD" value={agent.cwd} mono />
            <InfoRow icon={Hash} label="PID" value={agent.pid} mono />
            <InfoRow icon={Hash} label="Session" value={agent.sessionId || agent.id} mono />
            <InfoRow icon={Clock} label="Last Seen" value={relativeTime(agent.lastSeen || agent.updatedAt)} />
            <InfoRow icon={Cpu} label="Version" value={agent.version} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-3.5 h-3.5 text-stone-300 flex-shrink-0" />
      <span className="text-stone-500 w-16">{label}</span>
      <span className={`text-stone-700 truncate ${mono ? "font-mono text-[11px]" : ""}`}>
        {value || "—"}
      </span>
    </div>
  );
}
