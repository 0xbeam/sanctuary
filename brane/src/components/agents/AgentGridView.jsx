import { useState, useMemo } from "react";
import { Search, Filter } from "lucide-react";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { useAgents } from "../../contexts/AgentContext";
import { AgentDetailPanel } from "./AgentDetailPanel";
import { Bot } from "lucide-react";

function relativeTime(ts) {
  if (!ts) return "—";
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

export function AgentGridView() {
  const { agents, selectedAgent, setSelectedAgent, loading } = useAgents();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = agents;
    if (statusFilter !== "all") {
      list = list.filter((a) => a.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((a) =>
        (a.name || a.slug || a.id || "").toLowerCase().includes(q) ||
        (a.cwd || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [agents, statusFilter, search]);

  return (
    <div className="view-enter h-full flex gap-0 -m-6">
      {/* Left panel — Agent Grid */}
      <div className="w-[420px] min-w-[360px] flex-shrink-0 border-r border-stone-200 bg-white flex flex-col h-full">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-stone-100">
          <h2 className="font-serif text-xl font-semibold tracking-tight-editorial text-stone-900">
            Agents
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            {agents.length} registered agent{agents.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Filter bar */}
        <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="Search agents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface rounded-lg border-0 focus:ring-1 focus:ring-accent/30 outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-surface rounded-lg px-2 py-1.5 border-0 text-stone-600 outline-none"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="idle">Idle</option>
          </select>
        </div>

        {/* Agent cards grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && agents.length === 0 ? (
            <p className="text-xs text-stone-400 text-center py-8">Loading agents...</p>
          ) : filtered.length > 0 ? (
            <div className="grid grid-cols-2 gap-2.5">
              {filtered.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  isSelected={selectedAgent?.id === agent.id}
                  onClick={() => setSelectedAgent(agent)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Bot}
              title="No agents found"
              subtitle={search || statusFilter !== "all" ? "Try adjusting filters" : "No agents registered yet"}
            />
          )}
        </div>
      </div>

      {/* Right panel — Agent Detail */}
      <div className="flex-1 bg-white overflow-hidden">
        {selectedAgent ? (
          <AgentDetailPanel agent={selectedAgent} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-stone-400">Select an agent to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentCard({ agent, isSelected, onClick }) {
  const name = agent.name || agent.slug || `Agent ${(agent.id || "").slice(0, 6)}`;

  return (
    <Card
      onClick={onClick}
      className={`p-3 ${isSelected ? "ring-1 ring-accent/30 bg-accent/5" : ""}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <StatusDot status={agent.status} />
        <span className="text-sm font-medium text-stone-800 truncate">{name}</span>
      </div>
      <div className="space-y-1">
        {agent.cwd && (
          <p className="text-[10px] font-mono text-stone-500 truncate">{agent.cwd}</p>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          {agent.branch && agent.branch !== "HEAD" && (
            <span className="text-[10px] font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded">
              {agent.branch}
            </span>
          )}
          {agent.model && (
            <span className="text-[10px] font-mono text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">
              {agent.model}
            </span>
          )}
        </div>
        <p className="text-[10px] text-stone-400">{relativeTime(agent.lastSeen || agent.updatedAt)}</p>
      </div>
    </Card>
  );
}
