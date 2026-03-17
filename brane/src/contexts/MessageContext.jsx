import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

const MessageContext = createContext();
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3210";

export function MessageProvider({ children }) {
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const eventSourceRef = useRef(null);

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/channels`);
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || data || []);
      }
    } catch { /* skip */ }
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // SSE connection for active channel
  useEffect(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (!activeChannel) {
      setMessages([]);
      return;
    }

    // Load initial messages
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/messages/${activeChannel}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || data || []);
        }
      } catch { /* skip */ }
    })();

    // Connect SSE stream
    try {
      const es = new EventSource(`${API_BASE}/api/messages/${activeChannel}/stream`);
      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          setMessages((prev) => [...prev, msg]);
        } catch { /* skip */ }
      };
      es.onerror = () => {
        // SSE will auto-reconnect
      };
      eventSourceRef.current = es;
    } catch { /* skip */ }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [activeChannel]);

  const publishMessage = useCallback(async (channel, msg) => {
    try {
      const res = await fetch(`${API_BASE}/api/messages/${channel}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg),
      });
      if (res.ok) return await res.json();
    } catch (err) {
      console.error("Publish failed:", err);
    }
    return null;
  }, []);

  return (
    <MessageContext.Provider value={{
      channels, activeChannel, setActiveChannel,
      messages, publishMessage, loadChannels,
    }}>
      {children}
    </MessageContext.Provider>
  );
}

export function useMessages() {
  return useContext(MessageContext);
}
