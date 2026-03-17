import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";

const DataContext = createContext();

// API base — in dev we hit the Express server, in production we fall back to static files
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3210";
const USE_API = !!import.meta.env.VITE_API_URL || import.meta.env.DEV;

export function DataProvider({ children }) {
  const [index, setIndex] = useState({ instructions: [] });
  const [instructionCache, setInstructionCache] = useState({});
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const pollRef = useRef(null);
  const indexRef = useRef(index);

  // Keep indexRef in sync
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  // Load index
  const loadIndex = useCallback(async () => {
    setLoading(true);
    try {
      const url = USE_API ? `${API_BASE}/api/index` : "/output/index.json";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setIndex(data);
      }
    } catch {
      // No index yet
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
      const url = USE_API ? `${API_BASE}/api/instructions/${id}` : `/output/${id}/instruction.json`;
      const res = await fetch(url);
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

  // Poll jobs — uses ref to avoid stale closures
  const pollJobs = useCallback(async () => {
    if (!USE_API) return;
    try {
      const res = await fetch(`${API_BASE}/api/jobs`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);

        // If any jobs just completed, refresh the index
        const currentIndex = indexRef.current;
        const hasNewComplete = data.jobs?.some(
          (j) => j.status === "complete" && !currentIndex.instructions.some((i) => i.id === j.resultId)
        );
        if (hasNewComplete) {
          await loadIndex();
        }
      }
    } catch {
      // skip
    }
  }, [loadIndex]);

  // Store latest pollJobs in a ref so intervals always call current version
  const pollJobsRef = useRef(pollJobs);
  useEffect(() => {
    pollJobsRef.current = pollJobs;
  }, [pollJobs]);

  // Stable wrapper that always calls latest pollJobs
  const doPoll = useCallback(() => {
    pollJobsRef.current();
  }, []);

  // Start polling helper
  const startPolling = useCallback(() => {
    if (!pollRef.current) {
      // Poll immediately first, then every 1.5s
      doPoll();
      pollRef.current = setInterval(doPoll, 1500);
    }
  }, [doPoll]);

  // Stop polling when no active jobs
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === "pending" || j.status === "processing");
    if (hasActive) {
      startPolling();
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobs, startPolling]);

  // Dispatch a scrape job via API
  const dispatchScrape = useCallback(async (url, project, source) => {
    if (USE_API) {
      try {
        const res = await fetch(`${API_BASE}/api/scrape`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, project }),
        });
        if (res.ok) {
          const data = await res.json();
          setJobs((prev) => [data.job, ...prev.filter((j) => j.id !== data.job.id)]);
          startPolling();
          return data.job;
        }
      } catch (err) {
        console.error("Dispatch failed:", err);
      }
    }

    // Fallback: local-only job stub
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
  }, [startPolling]);

  // Dispatch batch
  const dispatchBatch = useCallback(async (urls, project) => {
    if (USE_API) {
      try {
        const res = await fetch(`${API_BASE}/api/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls, project }),
        });
        if (res.ok) {
          const data = await res.json();
          setJobs((prev) => [...(data.jobs || []), ...prev]);
          startPolling();
          return data.jobs;
        }
      } catch (err) {
        console.error("Batch dispatch failed:", err);
      }
    }
    return [];
  }, [startPolling]);

  // Get unique projects
  const projects = useMemo(() => {
    const set = new Set(index.instructions.map((i) => i.project).filter(Boolean));
    return [...set].sort();
  }, [index]);

  // Get unique sources
  const sources = useMemo(() => {
    const set = new Set(index.instructions.map((i) => i.source));
    return [...set].sort();
  }, [index]);

  // Check API health — retry on failure, refresh periodically
  const [apiStatus, setApiStatus] = useState(null);
  const checkHealth = useCallback(async () => {
    if (!USE_API) return;
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      if (res.ok) {
        setApiStatus(await res.json());
      } else {
        setApiStatus({ status: "offline" });
      }
    } catch {
      setApiStatus({ status: "offline" });
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  return (
    <DataContext.Provider
      value={{
        index,
        instructions: index.instructions,
        loading,
        projects,
        sources,
        jobs,
        apiStatus,
        checkHealth,
        loadIndex,
        loadInstruction,
        instructionCache,
        dispatchScrape,
        dispatchBatch,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  return useContext(DataContext);
}
