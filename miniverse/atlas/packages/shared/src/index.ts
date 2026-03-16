// ─── Meeting Types ───

export interface Meeting {
  id: string;
  title: string | null;
  meetUrl: string;
  calendarEventId: string | null;
  startedAt: string;
  endedAt: string | null;
  participants: string[];
  recordingPath: string | null;
  recordingUrl: string | null;
  durationSeconds: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  summaries?: MeetingSummary[];
  segments?: Segment[];
  actionItems?: ActionItem[];
  _count?: { segments: number; actionItems: number };
}

export interface MeetingSummary {
  id: string;
  meetingId: string;
  summaryJson: SummaryJson;
  summaryText: string;
  model: string;
  generatedAt: string;
}

export interface SummaryJson {
  title: string;
  attendees: string[];
  topics: string[];
  decisions: string[];
  actionItems: { text: string; assignee: string | null; deadline: string | null }[];
  executiveSummary: string;
}

export interface Segment {
  id: string;
  meetingId: string;
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
  source: string;
}

export interface ActionItem {
  id: string;
  meetingId: string;
  text: string;
  assignee: string | null;
  deadline: string | null;
  status: string;
  createdAt: string;
  meeting?: { id: string; title: string | null; startedAt: string };
}

// ─── Chat Types ───

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  sources: ChatSource[] | null;
  createdAt: string;
}

export interface ChatSource {
  sourceType: "segment" | "summary" | "context_event" | "action_item";
  sourceId: string;
  snippet: string;
}

export interface ChatSession {
  id: string;
  title: string | null;
  lastMessageAt: string;
  messageCount: number;
}

// ─── Context Types ───

export interface ContextEvent {
  id: string;
  timestamp: string;
  appName: string;
  bundleId: string | null;
  windowTitle: string | null;
  browserUrl: string | null;
  tabTitle: string | null;
  durationSecs: number | null;
}

// ─── Routine Types ───

export interface Routine {
  id: string;
  name: string;
  schedule: string;
  template: "daily_briefing" | "weekly_digest";
  config: Record<string, unknown> | null;
  enabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
}

export interface RoutineRun {
  id: string;
  routineId: string;
  output: string;
  outputJson: Record<string, unknown> | null;
  createdAt: string;
}

// ─── Draft Types ───

export interface Draft {
  id: string;
  meetingId: string | null;
  type: "follow_up_email" | "meeting_notes" | "project_plan";
  title: string;
  content: string;
  status: "draft" | "sent" | "archived";
  createdAt: string;
  updatedAt: string;
}

// ─── Search Types ───

export interface SearchResult {
  type: "meeting" | "segment" | "action_item" | "context_event";
  id: string;
  title: string;
  snippet: string;
  score: number;
  meetingId?: string;
  timestamp?: string;
}

// ─── API Client ───

export class AtlasAPI {
  constructor(private baseUrl: string) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  // Meetings
  getMeetings(params?: { status?: string; limit?: number; offset?: number }) {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return this.request<Meeting[]>(`/api/meetings${qs ? `?${qs}` : ""}`);
  }

  getMeeting(id: string) {
    return this.request<Meeting>(`/api/meetings/${id}`);
  }

  submitLink(url: string) {
    return this.request<{ meetingId: string; jobId: string }>("/submit-link", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
  }

  // Action Items
  getActionItems(params?: { status?: string; assignee?: string }) {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return this.request<ActionItem[]>(`/api/action-items${qs ? `?${qs}` : ""}`);
  }

  updateActionItem(id: string, status: string) {
    return this.request<ActionItem>(`/api/action-items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  }

  // Chat
  getChatSessions() {
    return this.request<ChatSession[]>("/api/chat/sessions");
  }

  getChatMessages(sessionId: string) {
    return this.request<ChatMessage[]>(`/api/chat/sessions/${sessionId}`);
  }

  async sendChatMessage(sessionId: string | null, message: string): Promise<Response> {
    return fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message }),
    });
  }

  // Search
  search(query: string, type?: string) {
    const qs = new URLSearchParams({ q: query, ...(type && { type }) }).toString();
    return this.request<SearchResult[]>(`/api/search?${qs}`);
  }

  // Routines
  getRoutines() {
    return this.request<Routine[]>("/api/routines");
  }

  createRoutine(data: Partial<Routine>) {
    return this.request<Routine>("/api/routines", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  updateRoutine(id: string, data: Partial<Routine>) {
    return this.request<Routine>(`/api/routines/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  getRoutineRuns(routineId: string) {
    return this.request<RoutineRun[]>(`/api/routines/${routineId}/runs`);
  }

  // Drafts
  getDrafts() {
    return this.request<Draft[]>("/api/drafts");
  }

  generateDraft(data: { type: string; meetingId?: string; prompt?: string }) {
    return this.request<Draft>("/api/drafts/generate", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Context
  getContextTimeline(from: string, to: string) {
    return this.request<ContextEvent[]>(`/api/context/timeline?from=${from}&to=${to}`);
  }

  // Health
  getHealth() {
    return this.request<{ status: string; activeBots: number }>("/health");
  }
}
