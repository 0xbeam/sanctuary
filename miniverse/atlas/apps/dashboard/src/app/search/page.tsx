"use client";

import { useState } from "react";
import Link from "next/link";
import type { SearchResult } from "@atlas/shared";
import { api } from "@/lib/api";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await api.search(query);
      setResults(res);
    } catch {
      setResults([]);
    }
    setLoading(false);
  };

  const typeColors: Record<string, string> = {
    meeting: "text-accent",
    segment: "text-success",
    action_item: "text-warning",
    context_event: "text-text-muted",
  };

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-semibold mb-6">Search</h1>

      {/* Search bar */}
      <div className="flex gap-2 mb-8">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search meetings, transcripts, action items..."
          className="flex-1 bg-bg-input border border-border rounded-[var(--radius-lg)] px-4 py-3 text-sm outline-none focus:border-accent"
        />
        <button onClick={search} disabled={loading} className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-6 py-3 rounded-[var(--radius-lg)] text-sm transition-colors">
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Results */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-bg-card rounded-[var(--radius-lg)] animate-pulse" />)}</div>
      ) : results.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-text-muted mb-4">{results.length} results for &quot;{query}&quot;</p>
          {results.map((r, i) => (
            <Link
              key={`${r.id}-${i}`}
              href={r.meetingId ? `/meetings/${r.meetingId}` : "#"}
              className="block bg-bg-card border border-border rounded-[var(--radius-lg)] p-4 hover:border-accent/40 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs uppercase font-medium ${typeColors[r.type] || "text-text-muted"}`}>{r.type.replace("_", " ")}</span>
                {r.timestamp && <span className="text-xs text-text-muted">{new Date(r.timestamp).toLocaleDateString()}</span>}
              </div>
              <h3 className="text-sm font-medium">{r.title}</h3>
              <p className="text-sm text-text-muted mt-1 line-clamp-2">{r.snippet}</p>
            </Link>
          ))}
        </div>
      ) : searched ? (
        <p className="text-text-muted text-sm text-center py-12">No results found for &quot;{query}&quot;</p>
      ) : (
        <div className="text-center py-12 text-text-muted">
          <svg className="w-12 h-12 mx-auto mb-4 opacity-30" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <p className="text-sm">Search across all your meetings, transcripts, and action items.</p>
        </div>
      )}
    </div>
  );
}
