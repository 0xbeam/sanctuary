"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatSession, ChatMessage } from "@atlas/shared";
import { api } from "@/lib/api";

export default function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getChatSessions().then(setSessions).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeSession) {
      api.getChatMessages(activeSession).then(setMessages).catch(() => {});
    }
  }, [activeSession]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || streaming) return;
    const question = input.trim();
    setInput("");
    setStreaming(true);

    // Add user message optimistically
    const userMsg: ChatMessage = { id: crypto.randomUUID(), sessionId: activeSession || "", role: "user", content: question, sources: null, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);

    // Add placeholder assistant message
    const assistantMsg: ChatMessage = { id: crypto.randomUUID(), sessionId: activeSession || "", role: "assistant", content: "", sources: null, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const res = await api.sendChatMessage(activeSession, question);
      const sessionId = res.headers.get("X-Session-Id");
      if (sessionId && !activeSession) setActiveSession(sessionId);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          const lines = text.split("\n").filter((l) => l.startsWith("data: "));
          for (const line of lines) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullContent += parsed.content;
                setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: fullContent } : m));
              }
            } catch {}
          }
        }
      }

      // Refresh sessions
      api.getChatSessions().then(setSessions).catch(() => {});
    } catch {
      setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: "Failed to get response. Is the backend running?" } : m));
    }

    setStreaming(false);
  };

  return (
    <div className="flex h-full">
      {/* Sessions sidebar */}
      <div className="w-56 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <button
            onClick={() => { setActiveSession(null); setMessages([]); }}
            className="w-full bg-accent hover:bg-accent-hover text-white text-sm py-2 rounded-[var(--radius)] transition-colors"
          >
            New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSession(s.id)}
              className={`w-full text-left text-sm px-3 py-2 rounded-[var(--radius)] truncate transition-colors ${activeSession === s.id ? "bg-bg-hover text-text" : "text-text-muted hover:text-text hover:bg-bg-hover"}`}
            >
              {s.title || "Untitled chat"}
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Ask Atlas anything</h2>
              <p className="text-text-muted text-sm max-w-md">
                Ask about your meetings, action items, decisions, or anything from your work context.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-lg">
                {["What decisions were made this week?", "Summarize my last meeting", "What action items are overdue?", "What did we discuss about the redesign?"].map((q) => (
                  <button key={q} onClick={() => { setInput(q); }} className="text-xs bg-bg-card border border-border px-3 py-2 rounded-[var(--radius)] hover:border-accent/40 transition-colors">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-2xl text-sm leading-relaxed rounded-[var(--radius-lg)] px-4 py-3 ${m.role === "user" ? "bg-accent text-white" : "bg-bg-card border border-border"}`}>
                  <p className="whitespace-pre-wrap">{m.content || <span className="animate-pulse">Thinking...</span>}</p>
                </div>
              </div>
            ))}
            <div ref={messagesEnd} />
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border p-4">
          <div className="flex gap-2 max-w-3xl mx-auto">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Ask about your meetings..."
              disabled={streaming}
              className="flex-1 bg-bg-input border border-border rounded-[var(--radius-lg)] px-4 py-3 text-sm outline-none focus:border-accent disabled:opacity-50"
            />
            <button onClick={send} disabled={streaming || !input.trim()} className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-4 py-3 rounded-[var(--radius-lg)] transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
