import { useState, useMemo, useCallback } from "react";
import { Search, BookOpen, ChevronRight, ArrowUpRight, Tag } from "lucide-react";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { useData } from "../../contexts/DataContext";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3210";

const TYPE_COLORS = {
  skill: "bg-violet-50 text-violet-700",
  instruction: "bg-blue-50 text-blue-700",
  pattern: "bg-emerald-50 text-emerald-700",
  rule: "bg-red-50 text-red-700",
};

const SOURCE_COLORS = {
  scraped: "bg-cyan-50 text-cyan-700",
  learned: "bg-amber-50 text-amber-700",
  manual: "bg-stone-100 text-stone-600",
};

export function KnowledgeView() {
  const { instructions, projects } = useData();
  const [selectedId, setSelectedId] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = instructions;
    if (typeFilter !== "all") {
      list = list.filter((i) => (i.type || i.category) === typeFilter);
    }
    if (projectFilter !== "all") {
      list = list.filter((i) => i.project === projectFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((i) =>
        (i.title || "").toLowerCase().includes(q) ||
        (i.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [instructions, typeFilter, projectFilter, search]);

  const selected = useMemo(() => {
    return instructions.find((i) => i.id === selectedId) || null;
  }, [instructions, selectedId]);

  const types = useMemo(() => {
    const set = new Set(instructions.map((i) => i.type || i.category).filter(Boolean));
    return [...set].sort();
  }, [instructions]);

  const handlePromote = useCallback(async (id, promoteTo) => {
    const extra = {};
    if (promoteTo === "skill") {
      const name = prompt("Skill name:");
      if (!name) return;
      extra.name = name;
    } else if (promoteTo === "instruction") {
      const path = prompt("Project path:");
      if (!path) return;
      extra.projectPath = path;
    }
    try {
      await fetch(`${API_BASE}/api/knowledge/${id}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promoteTo, ...extra }),
      });
    } catch (err) {
      console.error("Promote failed:", err);
    }
  }, []);

  return (
    <div className="view-enter h-full flex gap-0 -m-6">
      {/* Left panel — Knowledge List */}
      <div className="w-[400px] min-w-[340px] flex-shrink-0 border-r border-stone-200 bg-white flex flex-col h-full">
        <div className="px-5 pt-5 pb-3 border-b border-stone-100">
          <h2 className="font-serif text-xl font-semibold tracking-tight-editorial text-stone-900">
            Knowledge
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            {instructions.length} entr{instructions.length !== 1 ? "ies" : "y"}
          </p>
        </div>

        {/* Filter bar */}
        <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="Search knowledge..."
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
          {projects.length > 0 && (
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="text-xs bg-surface rounded-lg px-2 py-1.5 border-0 text-stone-600 outline-none"
            >
              <option value="all">All projects</option>
              {projects.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </div>

        {/* Knowledge list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {filtered.length > 0 ? (
            <div className="space-y-1.5">
              {filtered.map((entry) => {
                const entryType = entry.type || entry.category;
                const isSelected = selectedId === entry.id;
                return (
                  <div
                    key={entry.id}
                    onClick={() => setSelectedId(entry.id)}
                    className={`px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 ${
                      isSelected
                        ? "bg-accent/5 border border-accent/20 shadow-sm"
                        : "hover:bg-stone-50 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {entryType && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TYPE_COLORS[entryType] || "bg-stone-100 text-stone-600"}`}>
                          {entryType}
                        </span>
                      )}
                      <span className="text-sm font-medium text-stone-800 truncate flex-1">
                        {entry.title}
                      </span>
                      {isSelected && <ChevronRight className="w-3 h-3 text-accent flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(entry.tags || []).slice(0, 3).map((tag) => (
                        <span key={tag} className="text-[9px] text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                      {entry.source && (
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${SOURCE_COLORS[entry.source] || "bg-stone-100 text-stone-500"}`}>
                          {entry.source}
                        </span>
                      )}
                      {entry.project && (
                        <span className="font-mono text-accent font-medium uppercase tracking-wider text-[9px]">
                          {entry.project}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={BookOpen}
              title="No knowledge entries"
              subtitle={search || typeFilter !== "all" || projectFilter !== "all" ? "Try adjusting filters" : "Scrape sources to build knowledge"}
            />
          )}
        </div>
      </div>

      {/* Right panel — Knowledge Detail */}
      <div className="flex-1 bg-white overflow-hidden">
        {selected ? (
          <KnowledgeDetail entry={selected} onPromote={handlePromote} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-stone-400">Select an entry to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}

function KnowledgeDetail({ entry, onPromote }) {
  const entryType = entry.type || entry.category;

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 pt-6 pb-4 border-b border-stone-100">
        <h3 className="font-serif text-xl font-semibold tracking-tight-editorial text-stone-900 mb-2">
          {entry.title}
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {entryType && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[entryType] || "bg-stone-100 text-stone-600"}`}>
              {entryType}
            </span>
          )}
          {entry.source && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${SOURCE_COLORS[entry.source] || "bg-stone-100 text-stone-500"}`}>
              {entry.source}
            </span>
          )}
          {entry.project && (
            <span className="font-mono text-accent font-medium uppercase tracking-wider text-[9px]">
              {entry.project}
            </span>
          )}
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Content */}
        {(entry.content || entry.markdown) && (
          <Card className="p-4">
            <h4 className="text-sm font-semibold text-stone-900 mb-2">Content</h4>
            <div className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap font-mono bg-surface rounded-lg p-4 max-h-96 overflow-y-auto">
              {entry.content || entry.markdown}
            </div>
          </Card>
        )}

        {/* Tags */}
        {entry.tags && entry.tags.length > 0 && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-4 h-4 text-stone-400" />
              <h4 className="text-sm font-semibold text-stone-900">Tags</h4>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {entry.tags.map((tag) => (
                <span key={tag} className="text-xs text-stone-600 bg-stone-100 px-2 py-1 rounded-lg">
                  {tag}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Metadata */}
        <Card className="p-4">
          <h4 className="text-sm font-semibold text-stone-900 mb-2">Metadata</h4>
          <div className="space-y-1.5 text-xs">
            <div className="flex gap-2">
              <span className="text-stone-500 w-20">Source</span>
              <span className="text-stone-600">{entry.source || "—"}</span>
            </div>
            {entry.sourceUrl && (
              <div className="flex gap-2">
                <span className="text-stone-500 w-20">URL</span>
                <span className="font-mono text-stone-600 truncate">{entry.sourceUrl}</span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="text-stone-500 w-20">Created</span>
              <span className="text-stone-600">
                {entry.scrapedAt ? new Date(entry.scrapedAt).toLocaleDateString() : "—"}
              </span>
            </div>
            {entry.appliedCount !== undefined && (
              <div className="flex gap-2">
                <span className="text-stone-500 w-20">Applied</span>
                <span className="text-stone-600">{entry.appliedCount} times</span>
              </div>
            )}
          </div>
        </Card>

        {/* Promote Actions */}
        <Card className="p-4">
          <h4 className="text-sm font-semibold text-stone-900 mb-3">Promote</h4>
          <div className="flex gap-2">
            <button
              onClick={() => onPromote(entry.id, "skill")}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
            >
              <ArrowUpRight className="w-3 h-3" />
              Promote to Skill
            </button>
            <button
              onClick={() => onPromote(entry.id, "instruction")}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <ArrowUpRight className="w-3 h-3" />
              Promote to Instruction
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
