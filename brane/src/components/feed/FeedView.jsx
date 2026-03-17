import { useMemo } from "react";
import { Inbox } from "lucide-react";
import { useUI } from "../../contexts/UIContext";
import { useData } from "../../contexts/DataContext";
import { InstructionCard } from "./InstructionCard";
import { InstructionDetail } from "./InstructionDetail";
import { EmptyState } from "../ui/EmptyState";
import { StatCard } from "../ui/Card";

export function FeedView() {
  const { searchQuery, filterSource, filterCategory, filterProject, selectedInstruction, openDetail, closeDetail } = useUI();
  const { instructions, loading, projects, sources } = useData();

  const filtered = useMemo(() => {
    return instructions.filter((inst) => {
      if (filterSource !== "all" && inst.source !== filterSource) return false;
      if (filterProject !== "all" && inst.project !== filterProject) return false;
      if (filterCategory !== "all") {
        const cats = inst.stats.categories || {};
        if (!cats[filterCategory]) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = inst.title.toLowerCase().includes(q) ||
          inst.project?.toLowerCase().includes(q) ||
          inst.source.includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [instructions, filterSource, filterCategory, filterProject, searchQuery]);

  // Aggregate stats
  const totalBlockers = instructions.reduce((s, i) => s + (i.stats.blockerCount || 0), 0);
  const totalRevisions = instructions.reduce((s, i) => s + (i.stats.revisionCount || 0), 0);
  const totalImages = instructions.reduce((s, i) => s + (i.stats.imageCount || 0), 0);

  if (loading) {
    return (
      <div className="view-enter">
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton-shimmer h-20 rounded-xl" />)}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton-shimmer h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="view-enter">
      {/* Stats row */}
      {instructions.length > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="Instructions" value={instructions.length} sub={`${sources.length} sources`} valueColor="text-accent" />
          <StatCard label="Blockers" value={totalBlockers} sub="must fix" valueColor={totalBlockers > 0 ? "text-red-600" : "text-stone-300"} />
          <StatCard label="Changes" value={totalRevisions} sub="requested" valueColor={totalRevisions > 0 ? "text-amber-600" : "text-stone-300"} />
          <StatCard label="Images" value={totalImages} sub="reference assets" />
        </div>
      )}

      {/* Filters */}
      {instructions.length > 0 && (
        <FilterBar />
      )}

      {/* Cards */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((inst) => (
            <InstructionCard
              key={inst.id}
              instruction={inst}
              onClick={() => openDetail(inst)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Inbox}
          title={instructions.length === 0 ? "No instructions yet" : "No matches"}
          subtitle={instructions.length === 0
            ? "Scrape a Slack thread, Figma file, or URL to get started"
            : "Try adjusting your filters"
          }
        />
      )}

      {/* Detail modal */}
      {selectedInstruction && (
        <InstructionDetail
          instruction={selectedInstruction}
          onClose={closeDetail}
        />
      )}
    </div>
  );
}

function FilterBar() {
  const { filterSource, setFilterSource, filterCategory, setFilterCategory, filterProject, setFilterProject } = useUI();
  const { projects, sources } = useData();

  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="gravity-label">Filter</span>
      <select
        value={filterSource}
        onChange={(e) => setFilterSource(e.target.value)}
        className="text-xs bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-stone-700 outline-none"
      >
        <option value="all">All Sources</option>
        {sources.map((s) => (
          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
        ))}
      </select>
      <select
        value={filterCategory}
        onChange={(e) => setFilterCategory(e.target.value)}
        className="text-xs bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-stone-700 outline-none"
      >
        <option value="all">All Categories</option>
        <option value="blocker">Blockers</option>
        <option value="revision">Changes</option>
        <option value="question">Questions</option>
        <option value="approval">Approvals</option>
      </select>
      {projects.length > 0 && (
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="text-xs bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-stone-700 outline-none"
        >
          <option value="all">All Projects</option>
          {projects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      )}
    </div>
  );
}
