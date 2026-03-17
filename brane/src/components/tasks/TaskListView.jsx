import { useState, useMemo } from "react";
import { Search, ListTodo, ChevronRight } from "lucide-react";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { useTasks } from "../../contexts/TaskContext";
import { useAgents } from "../../contexts/AgentContext";
import { TaskDetailPanel } from "./TaskDetailPanel";

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

export function TaskListView() {
  const { tasks, selectedTask, setSelectedTask, loading } = useTasks();
  const { agents } = useAgents();
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const agentMap = useMemo(() => {
    const map = {};
    agents.forEach((a) => { map[a.id] = a; });
    return map;
  }, [agents]);

  const types = useMemo(() => {
    const set = new Set(tasks.map((t) => t.type).filter(Boolean));
    return [...set].sort();
  }, [tasks]);

  const statuses = useMemo(() => {
    const set = new Set(tasks.map((t) => t.status).filter(Boolean));
    return [...set].sort();
  }, [tasks]);

  const filtered = useMemo(() => {
    let list = tasks;
    if (typeFilter !== "all") list = list.filter((t) => t.type === typeFilter);
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        (t.title || "").toLowerCase().includes(q) ||
        (t.type || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [tasks, typeFilter, statusFilter, search]);

  return (
    <div className="view-enter h-full flex gap-0 -m-6">
      {/* Left panel — Task List */}
      <div className="w-[400px] min-w-[340px] flex-shrink-0 border-r border-stone-200 bg-white flex flex-col h-full">
        <div className="px-5 pt-5 pb-3 border-b border-stone-100">
          <h2 className="font-serif text-xl font-semibold tracking-tight-editorial text-stone-900">
            Tasks
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            {tasks.length} task{tasks.length !== 1 ? "s" : ""} tracked
          </p>
        </div>

        {/* Filter bar */}
        <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface rounded-lg border-0 focus:ring-1 focus:ring-accent/30 outline-none"
            />
          </div>
          {types.length > 0 && (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-xs bg-surface rounded-lg px-2 py-1.5 border-0 text-stone-600 outline-none"
            >
              <option value="all">All types</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {statuses.length > 0 && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-surface rounded-lg px-2 py-1.5 border-0 text-stone-600 outline-none"
            >
              <option value="all">All status</option>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && tasks.length === 0 ? (
            <p className="text-xs text-stone-400 text-center py-8">Loading tasks...</p>
          ) : filtered.length > 0 ? (
            <div className="space-y-1.5">
              {filtered.map((task) => {
                const agent = task.agentId ? agentMap[task.agentId] : null;
                const isSelected = selectedTask?.id === task.id;
                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 ${
                      isSelected
                        ? "bg-accent/5 border border-accent/20 shadow-sm"
                        : "hover:bg-stone-50 border border-transparent"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      (STATUS_COLORS[task.status] || "").includes("emerald") ? "bg-emerald-400"
                      : (STATUS_COLORS[task.status] || "").includes("amber") ? "bg-amber-400"
                      : (STATUS_COLORS[task.status] || "").includes("red") ? "bg-red-400"
                      : "bg-stone-300"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-800 truncate leading-snug">
                        {task.title || task.type || task.id}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {task.type && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TYPE_COLORS[task.type] || "bg-stone-100 text-stone-600"}`}>
                            {task.type}
                          </span>
                        )}
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_COLORS[task.status] || "bg-stone-100 text-stone-600"}`}>
                          {task.status}
                        </span>
                        {agent && (
                          <span className="text-[10px] text-stone-400 truncate">
                            {agent.name || agent.slug || `Agent ${(agent.id || "").slice(0, 6)}`}
                          </span>
                        )}
                        {task.branch && (
                          <span className="text-[10px] font-mono text-accent">{task.branch}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-stone-400 flex-shrink-0">
                      {relativeTime(task.createdAt)}
                    </span>
                    {isSelected && <ChevronRight className="w-3 h-3 text-accent flex-shrink-0" />}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={ListTodo}
              title="No tasks found"
              subtitle={search || typeFilter !== "all" || statusFilter !== "all" ? "Try adjusting filters" : "No tasks created yet"}
            />
          )}
        </div>
      </div>

      {/* Right panel — Task Detail */}
      <div className="flex-1 bg-white overflow-hidden">
        {selectedTask ? (
          <TaskDetailPanel task={selectedTask} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-stone-400">Select a task to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}
