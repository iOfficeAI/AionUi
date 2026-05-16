import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'files_tabs_state';

export type FileTab = {
  path: string;
  title: string;
  isDirty: boolean;
};

type FilesTabContextType = {
  tabs: FileTab[];
  activeTabIndex: number;
  openTab: (path: string) => void;
  closeTab: (index: number) => void;
  switchTab: (index: number) => void;
  closeAllTabs: () => void;
};

const FilesTabContext = createContext<FilesTabContextType | null>(null);

export function useFilesTab() {
  const context = useContext(FilesTabContext);
  if (!context) {
    throw new Error('useFilesTab must be used within a FilesTabProvider');
  }
  return context;
}

export function useFilesTabOptional() {
  return useContext(FilesTabContext);
}

export function FilesTabProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<FileTab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load persisted state on mount
  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value) {
        try {
          const parsed = JSON.parse(value);
          if (parsed.tabs && Array.isArray(parsed.tabs)) {
            const cleanTabs = parsed.tabs.map((t: FileTab) => ({ ...t, isDirty: false }));
            setTabs(cleanTabs);
            setActiveTabIndex(parsed.activeTabIndex ?? 0);
          }
        } catch {
          // Ignore
        }
      }
      setIsLoaded(true);
    });
  }, []);

  // Persist state on changes
  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTabIndex })).catch(() => {});
  }, [tabs, activeTabIndex, isLoaded]);

  const openTab = useCallback(
    (path: string) => {
      const existingIndex = tabs.findIndex((t) => t.path === path);
      if (existingIndex !== -1) {
        setActiveTabIndex(existingIndex);
      } else {
        const title = path.split('/').pop() || path;
        setTabs((prev) => [...prev, { path, title, isDirty: false }]);
        setActiveTabIndex(tabs.length);
      }
    },
    [tabs]
  );

  const closeTab = useCallback(
    (index: number) => {
      if (index < 0 || index >= tabs.length) return;

      setTabs((prev) => {
        const newTabs = [...prev];
        newTabs.splice(index, 1);
        return newTabs;
      });

      setActiveTabIndex((prev) => {
        if (tabs.length <= 1) return 0;
        if (index < prev) return prev - 1;
        if (index === prev) return Math.min(prev, tabs.length - 2);
        return prev;
      });
    },
    [tabs.length]
  );

  const switchTab = useCallback(
    (index: number) => {
      if (index >= 0 && index < tabs.length) {
        setActiveTabIndex(index);
      }
    },
    [tabs.length]
  );

  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabIndex(0);
  }, []);

  return (
    <FilesTabContext.Provider
      value={{
        tabs,
        activeTabIndex,
        openTab,
        closeTab,
        switchTab,
        closeAllTabs,
      }}
    >
      {children}
    </FilesTabContext.Provider>
  );
}
