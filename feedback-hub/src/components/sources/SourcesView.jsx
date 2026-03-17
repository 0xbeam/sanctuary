import { Hash, Twitter, Figma, Globe, Plus } from "lucide-react";
import { Card } from "../ui/Card";
import { useUI } from "../../contexts/UIContext";
import { useData } from "../../contexts/DataContext";

const SOURCE_INFO = [
  {
    id: "slack",
    name: "Slack",
    icon: Hash,
    color: "text-purple-600 bg-purple-50",
    description: "Thread feedback with images, reactions, and replies",
    status: "active",
  },
  {
    id: "figma",
    name: "Figma",
    icon: Figma,
    color: "text-pink-600 bg-pink-50",
    description: "Design comments and annotations from Figma files",
    status: "active",
  },
  {
    id: "twitter",
    name: "Twitter / X",
    icon: Twitter,
    color: "text-sky-600 bg-sky-50",
    description: "Bookmark imports and tweet thread scraping",
    status: "active",
  },
  {
    id: "url",
    name: "Generic URL",
    icon: Globe,
    color: "text-stone-600 bg-stone-100",
    description: "Extract text and images from any web page",
    status: "active",
  },
];

export function SourcesView() {
  const { openScrapeModal } = useUI();
  const { instructions } = useData();

  return (
    <div className="view-enter max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-tight-editorial text-stone-900">
            Sources
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">Connected adapters for scraping feedback</p>
        </div>
        <button
          onClick={openScrapeModal}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          <Plus className="w-3.5 h-3.5" />
          New Scrape
        </button>
      </div>

      <div className="space-y-3">
        {SOURCE_INFO.map((src) => {
          const Icon = src.icon;
          const count = instructions.filter((i) => i.source === src.id).length;

          return (
            <Card key={src.id} className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${src.color} flex items-center justify-center`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-stone-900">{src.name}</h3>
                  <p className="text-xs text-stone-500">{src.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-stone-900">{count}</p>
                  <p className="text-xs text-stone-400">scraped</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-white rounded-xl border border-dashed border-stone-300 text-center">
        <p className="text-xs text-stone-500 font-medium">CLI Usage</p>
        <code className="block mt-2 text-xs font-mono text-stone-600 bg-surface px-3 py-2 rounded-lg">
          node bin/cli.js scrape &lt;url&gt; --project &lt;name&gt;
        </code>
      </div>
    </div>
  );
}
