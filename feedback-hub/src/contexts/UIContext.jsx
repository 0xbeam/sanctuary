import { createContext, useContext, useState, useCallback } from "react";

const UIContext = createContext();

const TABS = ["feed", "sources", "projects", "agents", "settings"];

export function UIProvider({ children }) {
  const [activeTab, setActiveTab] = useState("feed");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSource, setFilterSource] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterProject, setFilterProject] = useState("all");
  const [showScrapeModal, setShowScrapeModal] = useState(false);
  const [selectedInstruction, setSelectedInstruction] = useState(null);

  const openScrapeModal = useCallback(() => setShowScrapeModal(true), []);
  const closeScrapeModal = useCallback(() => setShowScrapeModal(false), []);

  const openDetail = useCallback((instruction) => setSelectedInstruction(instruction), []);
  const closeDetail = useCallback(() => setSelectedInstruction(null), []);

  return (
    <UIContext.Provider
      value={{
        TABS,
        activeTab, setActiveTab,
        searchQuery, setSearchQuery,
        filterSource, setFilterSource,
        filterCategory, setFilterCategory,
        filterProject, setFilterProject,
        showScrapeModal, openScrapeModal, closeScrapeModal,
        selectedInstruction, openDetail, closeDetail,
      }}
    >
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  return useContext(UIContext);
}
