import { useState } from "react";
import { Link2, Zap, FolderOpen } from "lucide-react";
import { Modal } from "../ui/Modal";
import { SourceIcon } from "../feed/SourceIcon";
import { useUI } from "../../contexts/UIContext";
import { useData } from "../../contexts/DataContext";

// Adapter detection (mirrors core/adapters/index.js logic)
function detectSource(url) {
  if (/slack\.com\/archives\/[A-Z0-9]+\/p\d+/.test(url)) return "slack";
  if (/figma\.com\/(file|design|proto)\//.test(url)) return "figma";
  if (/(twitter\.com|x\.com)\/\w+\/status\/\d+/.test(url)) return "twitter";
  return "url";
}

export function ScrapeModal() {
  const { closeScrapeModal } = useUI();
  const { dispatchScrape, projects } = useData();
  const [urls, setUrls] = useState("");
  const [project, setProject] = useState("");
  const [newProject, setNewProject] = useState("");

  const urlList = urls.split("\n").map((u) => u.trim()).filter(Boolean);
  const detected = urlList.map((u) => ({ url: u, source: detectSource(u) }));

  const [dispatching, setDispatching] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setDispatching(true);
    const proj = newProject || project;
    for (const { url, source } of detected) {
      await dispatchScrape(url, proj, source);
    }
    setDispatching(false);
    closeScrapeModal();
  };

  return (
    <Modal onClose={closeScrapeModal} maxWidth="max-w-xl">
      <form onSubmit={handleSubmit}>
        <h2 className="font-serif text-xl font-semibold tracking-tight-editorial text-stone-900 mb-1">
          New Scrape
        </h2>
        <p className="text-xs text-stone-500 mb-5">
          Paste one or more URLs. Sources are auto-detected.
        </p>

        {/* URL input */}
        <div className="mb-4">
          <label className="gravity-label mb-1.5 block">URLs</label>
          <textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder={"https://workspace.slack.com/archives/C.../p...\nhttps://figma.com/file/...\nhttps://x.com/user/status/..."}
            rows={4}
            className="w-full bg-surface border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-accent resize-none font-mono"
          />
        </div>

        {/* Detected sources preview */}
        {detected.length > 0 && (
          <div className="mb-4 p-3 bg-surface rounded-lg">
            <p className="gravity-label mb-2">Detected ({detected.length})</p>
            <div className="space-y-1.5">
              {detected.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-stone-600">
                  <SourceIcon source={d.source} size="sm" />
                  <span className="truncate flex-1 font-mono">{d.url}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Project */}
        <div className="mb-5">
          <label className="gravity-label mb-1.5 block">Project</label>
          <div className="flex gap-2">
            {projects.length > 0 && (
              <select
                value={project}
                onChange={(e) => { setProject(e.target.value); setNewProject(""); }}
                className="text-xs bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-stone-700 outline-none"
              >
                <option value="">Select existing...</option>
                {projects.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            )}
            <input
              type="text"
              value={newProject}
              onChange={(e) => { setNewProject(e.target.value); setProject(""); }}
              placeholder="or create new..."
              className="flex-1 bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={closeScrapeModal}
            className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={detected.length === 0 || dispatching}
            className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Zap className={`w-3.5 h-3.5 ${dispatching ? "animate-pulse" : ""}`} />
            {dispatching ? "Dispatching…" : detected.length > 1 ? `Dispatch ${detected.length} URLs` : "Scrape"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
