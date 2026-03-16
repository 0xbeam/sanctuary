"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [health, setHealth] = useState<{ status: string } | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {});
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
          <p className="text-sm text-text-muted">
            Context tracking requires the Atlas desktop app. The Electron app monitors your active windows and syncs context to the backend.
          </p>
          <p className="text-sm text-text-muted mt-2">
            Status: <span className="text-warning">Not connected</span>
          </p>
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
