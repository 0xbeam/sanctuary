import { UIProvider, useUI } from "./contexts/UIContext";
import { DataProvider } from "./contexts/DataContext";
import { AppShell } from "./components/layout/AppShell";
import { FeedView } from "./components/feed/FeedView";
import { SourcesView } from "./components/sources/SourcesView";
import { ScrapeModal } from "./components/sources/ScrapeModal";
import { ProjectsView } from "./components/projects/ProjectsView";
import { AgentDispatchView } from "./components/agents/AgentDispatchView";
import { SettingsView } from "./components/settings/SettingsView";

function TabRouter() {
  const { activeTab } = useUI();

  switch (activeTab) {
    case "feed": return <FeedView />;
    case "sources": return <SourcesView />;
    case "projects": return <ProjectsView />;
    case "agents": return <AgentDispatchView />;
    case "settings": return <SettingsView />;
    default: return <FeedView />;
  }
}

function ModalLayer() {
  const { showScrapeModal } = useUI();
  return showScrapeModal ? <ScrapeModal /> : null;
}

export default function App() {
  return (
    <UIProvider>
      <DataProvider>
        <AppShell>
          <TabRouter />
        </AppShell>
        <ModalLayer />
      </DataProvider>
    </UIProvider>
  );
}
