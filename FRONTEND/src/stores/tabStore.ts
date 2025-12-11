import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TabType = 'generator' | 'editor' | 'cards';

interface TabState {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

export const useTabStore = create<TabState>()(
  persist(
    (set) => ({
      activeTab: 'generator',
      setActiveTab: (tab: TabType) => set({ activeTab: tab }),
    }),
    {
      name: 'tab-store',
      partialize: (state) => ({
        activeTab: state.activeTab,
      }),
    }
  )
);
