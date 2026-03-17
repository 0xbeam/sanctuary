import { UIProvider, useUI } from "./contexts/UIContext";
import { DataProvider } from "./contexts/DataContext";
import { AgentProvider } from "./contexts/AgentContext";
import { TaskProvider } from "./contexts/TaskContext";
import { MessageProvider } from "./contexts/MessageContext";
import { AppShell } from "./components/layout/AppShell";
import { DashboardView } from "./components/dashboard/DashboardView";
import { FeedView } from "./components/feed/FeedView";
import { SourcesView } from "./components/sources/SourcesView";
import { ScrapeModal } from "./components/sources/ScrapeModal";
import { ProjectsView } from "./components/projects/ProjectsView";
import { AgentGridView } from "./components/agents/AgentGridView";
import { TaskListView } from "./components/tasks/TaskListView";
import { KnowledgeView } from "./components/knowledge/KnowledgeView";
import { MessageStreamView } from "./components/messages/MessageStreamView";
import { SettingsView } from "./components/settings/SettingsView";

function TabRouter() {
  const { activeTab } = useUI();

  switch (activeTab) {
    case "dashboard": return <DashboardView />;
    case "agents": return <AgentGridView />;
    case "tasks": return <TaskListView />;
    case "feed": return <FeedView />;
    case "knowledge": return <KnowledgeView />;
    case "messages": return <MessageStreamView />;
    case "settings": return <SettingsView />;
    default: return <DashboardView />;
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
        <AgentProvider>
          <TaskProvider>
            <MessageProvider>
              <AppShell>
                <TabRouter />
              </AppShell>
              <ModalLayer />
            </MessageProvider>
          </TaskProvider>
        </AgentProvider>
      </DataProvider>
    </UIProvider>
  );
}
