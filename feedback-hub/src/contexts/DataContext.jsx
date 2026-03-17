import { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";

const DataContext = createContext();

export function DataProvider({ children }) {
  const [index, setIndex] = useState({ instructions: [] });
  const [instructionCache, setInstructionCache] = useState({});
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);

  // Load index on mount
  const loadIndex = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/output/index.json");
      if (res.ok) {
        const data = await res.json();
        setIndex(data);
      }
    } catch {
      // No index yet — that's fine
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadIndex();
  }, [loadIndex]);

  // Load full instruction detail
  const loadInstruction = useCallback(async (id) => {
    if (instructionCache[id]) return instructionCache[id];
    try {
      const res = await fetch(`/output/${id}/instruction.json`);
      if (res.ok) {
        const data = await res.json();
        setInstructionCache((prev) => ({ ...prev, [id]: data }));
        return data;
      }
    } catch {
      // skip
    }
    return null;
  }, [instructionCache]);

  // Get unique projects from instructions
  const projects = useMemo(() => {
    const set = new Set(index.instructions.map((i) => i.project).filter(Boolean));
    return [...set].sort();
  }, [index]);

  // Get unique sources
  const sources = useMemo(() => {
    const set = new Set(index.instructions.map((i) => i.source));
    return [...set].sort();
  }, [index]);

  // Dispatch a scrape job (simulated — adds to job queue)
  const dispatchScrape = useCallback((url, project, source) => {
    const job = {
      id: Date.now().toString(36),
      url,
      detectedSource: source || "url",
      status: "pending",
      project: project || "",
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    setJobs((prev) => [job, ...prev]);
    return job;
  }, []);

  return (
    <DataContext.Provider
      value={{
        index,
        instructions: index.instructions,
        loading,
        projects,
        sources,
        jobs,
        loadIndex,
        loadInstruction,
        instructionCache,
        dispatchScrape,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  return useContext(DataContext);
}
