import { createContext, useContext, useState, useCallback, useEffect } from "react";

const TaskContext = createContext();
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3210";

export function TaskProvider({ children }) {
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || data || []);
      }
    } catch { /* skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 2000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  const createTask = useCallback(async (data) => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const result = await res.json();
        await loadTasks();
        return result;
      }
    } catch (err) {
      console.error("Create task failed:", err);
    }
    return null;
  }, [loadTasks]);

  const assignTask = useCallback(async (taskId, agentId) => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      if (res.ok) {
        await loadTasks();
        return true;
      }
    } catch (err) {
      console.error("Assign task failed:", err);
    }
    return false;
  }, [loadTasks]);

  return (
    <TaskContext.Provider value={{
      tasks, selectedTask, setSelectedTask, loading,
      createTask, assignTask, refreshTasks: loadTasks,
    }}>
      {children}
    </TaskContext.Provider>
  );
}

export function useTasks() {
  return useContext(TaskContext);
}
