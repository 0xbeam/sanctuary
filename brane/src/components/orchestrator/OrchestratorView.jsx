import { useState, useEffect, useRef } from "react";
import { Card } from "../ui/Card";
import { Brain, Play, Square, Send } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3210";

export function OrchestratorView() {
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  // Poll orchestrator status
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/orchestrator/status`);
        const data = await res.json();
        setStatus(data);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  // SSE for orchestrator messages
  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/messages/orchestrator/stream`);
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        setMessages((prev) => [...prev, msg]);
      } catch {}
    };
    eventSourceRef.current = es;

    // Load existing messages
    fetch(`${API_BASE}/api/messages/orchestrator?limit=50`)
      .then((r) => r.json())
      .then((data) => setMessages(Array.isArray(data) ? data : []))
      .catch(() => {});

    return () => es.close();
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startOrchestrator = async () => {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/api/orchestrator/start`, { method: "POST" });
    } catch {}
    setLoading(false);
  };

  const stopOrchestrator = async () => {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/api/orchestrator/stop`, { method: "POST" });
    } catch {}
    setLoading(false);
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    try {
      await fetch(`${API_BASE}/api/orchestrator/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });
      setInput("");
    } catch {}
  };

  const isRunning = status?.alive || status?.status === "running";

  return (
    <div className="view-enter h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-serif text-2xl font-semibold tracking-tight-editorial text-stone-900">
            Orchestrator
          </h2>
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
            isRunning ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-500"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? "bg-emerald-500 animate-pulse" : "bg-stone-400"}`} />
            {isRunning ? "Running" : "Stopped"}
          </span>
        </div>
        <div className="flex gap-2">
          {!isRunning ? (
            <button
              onClick={startOrchestrator}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" /> Start
            </button>
          ) : (
            <button
              onClick={stopOrchestrator}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
          )}
        </div>
      </div>

      {/* Status card */}
      {status && (
        <Card className="p-3 mb-4">
          <div className="flex gap-4 text-xs text-stone-500">
            {status.pid && <span>PID: <span className="font-mono text-stone-700">{status.pid}</span></span>}
            {status.startedAt && <span>Started: <span className="text-stone-700">{new Date(status.startedAt).toLocaleString()}</span></span>}
            {status.exitCode !== undefined && status.exitCode !== null && (
              <span>Exit code: <span className="text-stone-700">{status.exitCode}</span></span>
            )}
          </div>
        </Card>
      )}

      {/* Messages area */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-stone-400 text-sm">
              <div className="text-center">
                <Brain className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>{isRunning ? "Orchestrator is running. Send a message." : "Start the orchestrator to begin."}</p>
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={msg.id || i} className={`flex gap-3 ${msg.from === "human" ? "justify-end" : ""}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  msg.from === "human"
                    ? "bg-accent text-white"
                    : msg.from === "orchestrator"
                    ? "bg-stone-100 text-stone-800"
                    : "bg-amber-50 text-amber-800"
                }`}>
                  <div className="text-[10px] opacity-60 mb-0.5">
                    {msg.from || "system"} · {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ""}
                  </div>
                  <div>{msg.payload?.message || msg.payload?.summary || JSON.stringify(msg.payload)}</div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border p-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder={isRunning ? "Message the orchestrator..." : "Start the orchestrator first"}
              disabled={!isRunning}
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={!isRunning || !input.trim()}
              className="px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
