import { useState } from "react";
import { Settings, CircleCheck, CircleX, Loader2, RefreshCw, Globe, Zap } from "lucide-react";
import { Card } from "../ui/Card";
import { useData } from "../../contexts/DataContext";

function StatusDot({ connected }) {
  return connected ? (
    <CircleCheck className="w-3.5 h-3.5 text-emerald-500" />
  ) : (
    <CircleX className="w-3.5 h-3.5 text-stone-300" />
  );
}

export function SettingsView() {
  const { apiStatus, checkHealth } = useData();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    await checkHealth();
    setTimeout(() => setRefreshing(false), 500);
  };

  return (
    <div className="view-enter max-w-2xl">
      <h2 className="font-serif text-2xl font-semibold tracking-tight-editorial text-stone-900 mb-5">
        Settings
      </h2>

      {/* API Status */}
      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-stone-900">API Server</h3>
          <button
            onClick={handleRefresh}
            className="p-1 rounded hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors"
            title="Refresh status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
        {apiStatus ? (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <StatusDot connected={apiStatus.status === "ok"} />
              <span className="text-sm text-stone-700">
                {apiStatus.status === "ok" ? "Connected" : "Offline"}
              </span>
              <span className="text-xs text-stone-400 ml-auto font-mono">localhost:3210</span>
            </div>
            {apiStatus.env && (
              <>
                <div className="flex items-center gap-2">
                  <StatusDot connected={apiStatus.env.slack} />
                  <span className="text-sm text-stone-700">Slack</span>
                  <span className="text-xs text-stone-400 ml-auto">
                    {apiStatus.env.slack ? "Token connected" : "SLACK_BOT_TOKEN not set"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusDot connected={apiStatus.env.figma} />
                  <span className="text-sm text-stone-700">Figma</span>
                  <span className="text-xs text-stone-400 ml-auto">
                    {apiStatus.env.figma ? "Token connected" : "FIGMA_TOKEN not set"}
                  </span>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-stone-100">
                  <span className="text-xs text-stone-500">Output: <code className="font-mono">{apiStatus.env.output}</code></span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking API status…
          </div>
        )}
      </Card>

      {/* Browser Engine Status */}
      <Card className="p-5 mb-4">
        <h3 className="text-sm font-semibold text-stone-900 mb-3">Browser Engine</h3>
        {apiStatus?.browser ? (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <StatusDot connected={apiStatus.browser.available} />
              <span className="text-sm text-stone-700">
                {apiStatus.browser.available ? `Active: ${apiStatus.browser.activeEngine}` : "No browser engine"}
              </span>
              {!apiStatus.browser.available && (
                <span className="text-xs text-stone-400 ml-auto">Fetch-only mode</span>
              )}
            </div>

            {/* Engine list */}
            {apiStatus.browser.engines?.length > 0 ? (
              <div className="space-y-1.5 pt-1">
                {apiStatus.browser.engines.map((eng) => (
                  <div key={eng.name} className="flex items-center gap-2 px-3 py-2 bg-surface rounded-lg">
                    {eng.name === "cloudflare" ? (
                      <Globe className="w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 text-purple-500" />
                    )}
                    <span className="text-xs font-medium text-stone-700 capitalize">{eng.name}</span>
                    <StatusDot connected={eng.connected} />
                    {eng.name === apiStatus.browser.activeEngine && (
                      <span className="text-[9px] font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded-full ml-auto">
                        ACTIVE
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-stone-500 bg-surface rounded-lg px-3 py-2">
                No engines configured. Set <code className="font-mono">CF_API_TOKEN</code> or <code className="font-mono">LIGHTPANDA_URL</code> to enable browser rendering.
              </div>
            )}

            {/* SPA domains */}
            <div className="pt-1 border-t border-stone-100">
              <p className="text-[10px] text-stone-400 font-mono">
                Auto-browser domains: x.com, twitter.com, notion.so, linear.app, medium.com, substack.com
              </p>
            </div>
          </div>
        ) : (
          <div className="text-xs text-stone-500">
            {apiStatus ? "Browser info not available" : "Waiting for API…"}
          </div>
        )}
      </Card>

      {/* Environment */}
      <Card className="p-5 mb-4">
        <h3 className="text-sm font-semibold text-stone-900 mb-3">Environment Variables</h3>
        <div className="space-y-3">
          <div>
            <label className="gravity-label mb-1 block">Slack Bot Token</label>
            <code className="text-xs bg-surface px-3 py-1.5 rounded-lg block text-stone-500 font-mono">
              SLACK_BOT_TOKEN=xoxb-... (channels:history, files:read, users:read)
            </code>
          </div>
          <div>
            <label className="gravity-label mb-1 block">Figma Token</label>
            <code className="text-xs bg-surface px-3 py-1.5 rounded-lg block text-stone-500 font-mono">
              FIGMA_TOKEN=figd_...
            </code>
          </div>
          <div className="pt-2 border-t border-stone-100">
            <label className="gravity-label mb-1 block">Cloudflare Browser Rendering</label>
            <code className="text-xs bg-surface px-3 py-1.5 rounded-lg block text-stone-500 font-mono mb-1.5">
              CF_API_TOKEN=your-cloudflare-api-token
            </code>
            <code className="text-xs bg-surface px-3 py-1.5 rounded-lg block text-stone-500 font-mono">
              CF_ACCOUNT_ID=your-account-id
            </code>
          </div>
          <div>
            <label className="gravity-label mb-1 block">Lightpanda (Local Browser)</label>
            <code className="text-xs bg-surface px-3 py-1.5 rounded-lg block text-stone-500 font-mono">
              LIGHTPANDA_URL=ws://127.0.0.1:9222
            </code>
          </div>
          <div>
            <label className="gravity-label mb-1 block">API Port</label>
            <code className="text-xs bg-surface px-3 py-1.5 rounded-lg block text-stone-500 font-mono">
              API_PORT=3210 (default)
            </code>
          </div>
        </div>
      </Card>

      {/* CLI Commands */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-stone-900 mb-3">CLI Commands</h3>
        <div className="space-y-2 text-xs font-mono text-stone-600">
          <div className="bg-surface px-3 py-2 rounded-lg">
            <span className="text-accent">brane scrape</span> &lt;url&gt; -p &lt;project&gt;
          </div>
          <div className="bg-surface px-3 py-2 rounded-lg">
            <span className="text-accent">brane scrape</span> &lt;url&gt; --browser
            <span className="text-stone-400 ml-2"># force browser engine</span>
          </div>
          <div className="bg-surface px-3 py-2 rounded-lg">
            <span className="text-accent">brane dispatch</span> &lt;url1&gt; &lt;url2&gt; -p &lt;project&gt;
          </div>
          <div className="bg-surface px-3 py-2 rounded-lg">
            <span className="text-accent">brane list</span>
          </div>
          <div className="bg-surface px-3 py-2 rounded-lg">
            <span className="text-accent">npm run dev</span> — starts API + Vite together
          </div>
        </div>
      </Card>
    </div>
  );
}
