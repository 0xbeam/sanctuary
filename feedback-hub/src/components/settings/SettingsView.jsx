import { Settings } from "lucide-react";
import { Card } from "../ui/Card";

export function SettingsView() {
  return (
    <div className="view-enter max-w-2xl">
      <h2 className="font-serif text-2xl font-semibold tracking-tight-editorial text-stone-900 mb-5">
        Settings
      </h2>

      <Card className="p-5 mb-4">
        <h3 className="text-sm font-semibold text-stone-900 mb-3">Environment</h3>
        <div className="space-y-3">
          <div>
            <label className="gravity-label mb-1 block">Slack Bot Token</label>
            <code className="text-xs bg-surface px-3 py-1.5 rounded-lg block text-stone-500 font-mono">
              Set via SLACK_BOT_TOKEN in .env
            </code>
          </div>
          <div>
            <label className="gravity-label mb-1 block">Figma Token</label>
            <code className="text-xs bg-surface px-3 py-1.5 rounded-lg block text-stone-500 font-mono">
              Set via FIGMA_TOKEN in .env
            </code>
          </div>
          <div>
            <label className="gravity-label mb-1 block">Output Directory</label>
            <code className="text-xs bg-surface px-3 py-1.5 rounded-lg block text-stone-500 font-mono">
              ./output (default)
            </code>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-stone-900 mb-3">CLI Commands</h3>
        <div className="space-y-2 text-xs font-mono text-stone-600">
          <div className="bg-surface px-3 py-2 rounded-lg">
            <span className="text-accent">feedhub scrape</span> &lt;url&gt; -p &lt;project&gt;
          </div>
          <div className="bg-surface px-3 py-2 rounded-lg">
            <span className="text-accent">feedhub dispatch</span> &lt;url1&gt; &lt;url2&gt; -p &lt;project&gt;
          </div>
          <div className="bg-surface px-3 py-2 rounded-lg">
            <span className="text-accent">feedhub list</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
