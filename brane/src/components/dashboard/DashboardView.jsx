import { Users, ListTodo, BookOpen, GitBranch, Activity } from "lucide-react";
import { Card, StatCard } from "../ui/Card";
import { useAgents } from "../../contexts/AgentContext";
import { useTasks } from "../../contexts/TaskContext";
import { useMessages } from "../../contexts/MessageContext";
import { useData } from "../../contexts/DataContext";

function relativeTime(ts) {
  if (!ts) return "";
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatusDot({ status }) {
  const color = status === "active" ? "bg-emerald-400"
    : status === "idle" ? "bg-stone-300"
    : status === "terminated" ? "bg-red-400"
    : "bg-stone-300";
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />;
}

export function DashboardView() {
  const { agents } = useAgents();
  const { tasks } = useTasks();
  const { instructions } = useData();
  const { messages } = useMessages();

  // Filter out stale agents with no real working directory
  const realAgents = agents.filter((a) => a.cwd && a.cwd !== "/" && a.cwd.length > 1);
  const activeAgents = realAgents.filter((a) => a.status === "active").length;
  const runningTasks = tasks.filter((t) => t.status === "running" || t.status === "in-progress" || t.status === "processing").length;
  const knowledgeCount = instructions.length;
  const branches = new Set(realAgents.map((a) => a.branch).filter((b) => b && b !== "HEAD" && b !== "unknown"));

  // Get last 10 messages for recent activity
  const recentMessages = messages.slice(-10).reverse();

  return (
    <div className="view-enter">
      <h2 className="font-serif text-2xl font-semibold tracking-tight-editorial text-stone-900 mb-5">
        Dashboard
      </h2>

      {/* Row 1 — Stats */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Active Agents"
          value={activeAgents}
          sub={`of ${realAgents.length} total`}
          valueColor="text-emerald-700"
        />
        <StatCard
          label="Running Tasks"
          value={runningTasks}
          sub={`${tasks.length} total`}
          valueColor="text-amber-700"
        />
        <StatCard
          label="Knowledge Entries"
          value={knowledgeCount}
          valueColor="text-stone-900"
        />
        <StatCard
          label="Git Branches"
          value={branches.size}
          valueColor="text-stone-900"
        />
      </div>

      {/* Row 2 — Two columns */}
      <div className="grid grid-cols-2 gap-4">
        {/* Recent Activity */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-stone-400" />
            <h3 className="text-sm font-semibold text-stone-900">Recent Activity</h3>
          </div>
          {recentMessages.length > 0 ? (
            <div className="space-y-2">
              {recentMessages.map((msg, i) => (
                <div key={msg.id || i} className="flex gap-2 text-xs">
                  <span className="text-stone-400 font-mono flex-shrink-0 w-14 text-right">
                    {msg.timestamp
                      ? new Date(msg.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                      : "--:--"
                    }
                  </span>
                  <span className="text-stone-600 truncate">
                    {msg.payload?.summary || msg.payload?.message || msg.type || "event"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-stone-400">No recent activity</p>
          )}
        </Card>

        {/* Agent Overview */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-stone-400" />
            <h3 className="text-sm font-semibold text-stone-900">Agent Overview</h3>
          </div>
          {realAgents.length > 0 ? (
            <div className="space-y-2">
              {realAgents.map((agent) => (
                <div key={agent.id} className="flex items-center gap-2 text-xs">
                  <StatusDot status={agent.status} />
                  <span className="text-stone-800 font-medium truncate">
                    {agent.name || agent.slug || `Agent ${(agent.id || "").slice(0, 6)}`}
                  </span>
                  {agent.branch && agent.branch !== "HEAD" && (
                    <span className="text-accent bg-accent/10 px-1.5 py-0.5 rounded text-[10px] font-mono">
                      {agent.branch}
                    </span>
                  )}
                  <span className="text-stone-400 font-mono truncate ml-auto text-[10px]">
                    {agent.cwd ? agent.cwd.split("/").slice(-2).join("/") : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-stone-400">No agents registered</p>
          )}
        </Card>
      </div>
    </div>
  );
}
