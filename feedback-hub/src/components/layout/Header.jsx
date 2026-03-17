import { Search, Plus, RefreshCw } from "lucide-react";
import { useUI } from "../../contexts/UIContext";
import { useData } from "../../contexts/DataContext";

export function Header() {
  const { searchQuery, setSearchQuery, openScrapeModal } = useUI();
  const { loadIndex, loading } = useData();

  return (
    <header className="h-14 bg-white border-b border-border flex items-center gap-4 px-6 flex-shrink-0">
      {/* Search */}
      <div className="flex items-center gap-2 bg-surface rounded-lg px-3 py-1.5 flex-1 max-w-md">
        <Search className="w-3.5 h-3.5 text-stone-400" />
        <input
          type="text"
          placeholder="Search instructions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent text-sm outline-none flex-1 placeholder:text-stone-400"
        />
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {/* Refresh */}
        <button
          onClick={loadIndex}
          disabled={loading}
          className="p-2 rounded-lg text-stone-500 hover:bg-surface hover:text-stone-700 transition-colors"
          title="Refresh index"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>

        {/* New Scrape */}
        <button
          onClick={openScrapeModal}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Scrape
        </button>
      </div>
    </header>
  );
}
