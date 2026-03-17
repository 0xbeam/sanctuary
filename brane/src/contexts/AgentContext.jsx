import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

const AgentContext = createContext();
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3210";

export function AgentProvider({ children }) {
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/agents`);
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || data || []);
      }
    } catch { /* skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAgents();
    const interval = setInterval(loadAgents, 3000);
    return () => clearInterval(interval);
  }, [loadAgents]);

  const spawnAgent = useCallback(async (opts) => {
    try {
      const res = await fetch(`${API_BASE}/api/agents/spawn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      });
      if (res.ok) {
        const data = await res.json();
        await loadAgents();
        return data;
      }
    } catch (err) {
      console.error("Spawn failed:", err);
    }
    return null;
  }, [loadAgents]);

  return (
    <AgentContext.Provider value={{ agents, selectedAgent, setSelectedAgent, loading, spawnAgent, refreshAgents: loadAgents }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgents() {
  return useContext(AgentContext);
}
