import { useState, useEffect, useRef } from "react";
import { Send, MessageSquare } from "lucide-react";
import { useMessages } from "../../contexts/MessageContext";

const TYPE_COLORS = {
  "task-update": "text-amber-400",
  "agent-event": "text-emerald-400",
  "system": "text-cyan-400",
  "human": "text-violet-400",
  "error": "text-red-400",
};

export function MessageStreamView() {
  const { channels, activeChannel, setActiveChannel, messages, publishMessage } = useMessages();
  const [input, setInput] = useState("");
  const logEndRef = useRef(null);

  // Auto-scroll on new messages
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Default to first channel
  useEffect(() => {
    if (!activeChannel && channels.length > 0) {
      setActiveChannel(channels[0]?.id || channels[0]);
    }
  }, [channels, activeChannel, setActiveChannel]);

  const handleSend = async () => {
    if (!input.trim() || !activeChannel) return;
    await publishMessage(activeChannel, {
      from: "human",
      type: "human",
      payload: { message: input.trim() },
    });
    setInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="view-enter h-full flex flex-col -m-6">
      {/* Header + Channel tabs */}
      <div className="px-5 pt-5 pb-0 border-b border-stone-200 bg-white">
        <h2 className="font-serif text-xl font-semibold tracking-tight-editorial text-stone-900 mb-3">
          Messages
        </h2>
        {channels.length > 0 ? (
          <div className="flex gap-1 overflow-x-auto pb-0">
            {channels.map((ch) => {
              const chId = ch.id || ch;
              const chName = ch.name || ch;
              const isActive = activeChannel === chId;
              return (
                <button
                  key={chId}
                  onClick={() => setActiveChannel(chId)}
                  className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                    isActive
                      ? "bg-stone-950 text-stone-200"
                      : "text-stone-500 hover:text-stone-700 hover:bg-stone-100"
                  }`}
                >
                  {chName}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-stone-400 pb-3">No channels available</p>
        )}
      </div>

      {/* Message stream — terminal style */}
      <div className="flex-1 overflow-y-auto bg-stone-950 p-4 font-mono text-xs">
        {messages.length > 0 ? (
          <>
            {messages.map((msg, i) => {
              const from = msg.from || msg.agentId || "system";
              const typeColor = TYPE_COLORS[msg.type] || "text-stone-500";
              const payload = msg.payload || {};
              const summary = payload.summary || payload.message || payload.text || msg.type || "event";

              return (
                <div key={msg.id || i} className="flex gap-2 py-0.5 leading-relaxed">
                  <span className="text-stone-600 flex-shrink-0 w-16 text-right">
                    {msg.timestamp
                      ? new Date(msg.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                      : "--:--:--"
                    }
                  </span>
                  <span className={`flex-shrink-0 ${typeColor}`}>
                    {msg.type === "error" ? "!" : ">"}
                  </span>
                  <span className="text-stone-300 flex-shrink-0">
                    {from}
                  </span>
                  {msg.type && (
                    <span className={`flex-shrink-0 ${typeColor}`}>
                      [{msg.type}]
                    </span>
                  )}
                  <span className="text-stone-400">
                    {summary}
                  </span>
                </div>
              );
            })}
            <div ref={logEndRef} />
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <MessageSquare className="w-8 h-8 text-stone-700 mx-auto mb-2" />
              <p className="text-stone-600">
                {activeChannel ? "No messages yet" : "Select a channel"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="bg-stone-900 border-t border-stone-800 px-4 py-3 flex items-center gap-2">
        <span className="text-emerald-500 font-mono text-xs">{">"}</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={activeChannel ? "Type a message..." : "Select a channel first"}
          disabled={!activeChannel}
          className="flex-1 bg-transparent text-stone-200 text-xs font-mono outline-none placeholder:text-stone-600 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || !activeChannel}
          className="p-1.5 rounded-lg text-stone-500 hover:text-emerald-400 hover:bg-stone-800 transition-colors disabled:opacity-30 disabled:hover:text-stone-500"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
