import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

export function AppShell({ children }) {
  return (
    <div className="flex h-screen overflow-hidden noise-overlay">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-surface p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
