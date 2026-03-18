import { useUI } from "../../contexts/UIContext";
import { useData } from "../../contexts/DataContext";
import { LayoutDashboard, Bot, ListTodo, Rss, BookOpen, MessageSquare, Settings } from "lucide-react";

const TAB_CONFIG = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "feed", label: "Feed", icon: Rss },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const { activeTab, setActiveTab } = useUI();
  const { instructions, jobs } = useData();

  const pendingJobs = jobs.filter((j) => j.status === "pending" || j.status === "processing").length;

  return (
    <aside className="hidden md:flex w-56 h-screen bg-surface border-r border-border flex-col flex-shrink-0">
      {/* Brand */}
      <div className="p-5 pb-4">
        <h1 className="font-serif text-xl font-semibold tracking-tight-editorial text-stone-900">
          Brane
        </h1>
        <p className="text-eyebrow mt-1">agent control plane</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        {TAB_CONFIG.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-accent text-white"
                  : "text-stone-600 hover:bg-stone-200/60 hover:text-stone-900"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {id === "feed" && instructions.length > 0 && (
                <span className={`ml-auto text-xs ${active ? "text-white/70" : "text-stone-400"}`}>
                  {instructions.length}
                </span>
              )}
              {id === "agents" && pendingJobs > 0 && (
                <span className="ml-auto w-5 h-5 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center">
                  {pendingJobs}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <p className="text-eyebrow">Multi-source · Agent-ready</p>
      </div>
    </aside>
  );
}
