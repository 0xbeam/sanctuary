"use client";

import { useEffect, useState } from "react";
import { isDesktop, getDesktopBridge } from "@/lib/desktop";

export default function SettingsPage() {
  const [health, setHealth] = useState<{ status: string } | null>(null);
  const [tracking, setTracking] = useState(false);
  const [stats, setStats] = useState<{ totalEvents: number; todayEvents: number; topApps: { app: string; minutes: number }[] } | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {});

    // Desktop-only: get tracking status
    const bridge = getDesktopBridge();
    if (bridge) {
      bridge.getTrackingStatus().then(setTracking);
      bridge.getContextStats().then((s) => s && setStats(s));
    }
  }, []);

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      <div className="space-y-6">
        {/* Backend Status */}
        <Section title="Backend Status">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${health?.status === "ok" ? "bg-success" : "bg-danger"}`} />
            <span className="text-sm">{health?.status === "ok" ? "Connected" : "Disconnected"}</span>
          </div>
        </Section>

        {/* Bot Config */}
        <Section title="Bot Configuration">
          <SettingRow label="Bot Name" value={process.env.NEXT_PUBLIC_BOT_NAME || "Atlas Notetaker"} />
          <SettingRow label="Transcription Mode" value="Deepgram + Captions (both)" />
          <SettingRow label="Auto-join from Calendar" value="Enabled" />
        </Section>

        {/* AI Config */}
        <Section title="AI Configuration">
          <SettingRow label="Chat Model" value="gpt-4o-mini" />
          <SettingRow label="Embedding Model" value="text-embedding-3-small" />
          <SettingRow label="Embedding Dimensions" value="1536" />
          <SettingRow label="Vector Store" value="pgvector (PostgreSQL)" />
        </Section>

        {/* Integrations */}
        <Section title="Integrations">
          <SettingRow label="Google Calendar" value="Configure in .env" />
          <SettingRow label="Backblaze B2" value="Configure in .env" />
          <SettingRow label="Deepgram" value="Configure in .env" />
        </Section>

        {/* Desktop App */}
        <Section title="Desktop App">
          {isDesktop() ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">Context Tracking</span>
                <button
                  onClick={async () => {
                    const bridge = getDesktopBridge();
                    if (bridge) {
                      const newState = await bridge.toggleTracking();
                      setTracking(newState);
                    }
                  }}
                  className={`w-10 h-5 rounded-full transition-colors relative ${tracking ? "bg-accent" : "bg-bg-hover"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${tracking ? "left-5" : "left-0.5"}`} />
                </button>
              </div>
              {stats && (
                <>
                  <SettingRow label="Events Today" value={String(stats.todayEvents)} />
                  <SettingRow label="Total Events" value={String(stats.totalEvents)} />
                  {stats.topApps.length > 0 && (
                    <div className="mt-2">
                      <span className="text-xs text-text-muted">Top Apps Today</span>
                      <div className="mt-1 space-y-1">
                        {stats.topApps.slice(0, 5).map((a) => (
                          <div key={a.app} className="flex items-center justify-between text-xs">
                            <span>{a.app}</span>
                            <span className="text-text-muted">{a.minutes}min</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-text-muted">
                Context tracking requires the Atlas desktop app.
              </p>
              <p className="text-sm text-text-muted mt-2">
                Status: <span className="text-warning">Not connected</span>
              </p>
            </>
          )}
        </Section>

        {/* API Info */}
        <Section title="API">
          <SettingRow label="Backend URL" value={process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"} />
          <SettingRow label="Dashboard URL" value={typeof window !== "undefined" ? window.location.origin : ""} />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-5">
      <h2 className="text-sm font-medium mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-sm font-[family-name:var(--font-mono)]">{value}</span>
    </div>
  );
}
