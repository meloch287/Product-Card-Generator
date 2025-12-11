import { useState } from 'react';
import { Sparkles, Settings } from 'lucide-react';
import { useTabStore, type TabType } from '@/stores/tabStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SettingsDialog } from '@/components/Cards/SettingsDialog';

interface TabButtonProps {
  tab: TabType;
  label: string;
  activeTab: TabType;
  onClick: (tab: TabType) => void;
}

function TabButton({ tab, label, activeTab, onClick }: TabButtonProps) {
  const isActive = activeTab === tab;
  
  return (
    <button
      onClick={() => onClick(tab)}
      className={cn(
        'px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200',
        isActive
          ? 'bg-primary text-primary-foreground shadow-md'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      )}
    >
      {label}
    </button>
  );
}

export function Header() {
  const { activeTab, setActiveTab } = useTabStore();

  return (
    <header className="h-16 border-b border-border/50 bg-card/50 backdrop-blur-xl flex items-center justify-between px-6 relative overflow-hidden">
      {/* Gradient line at top */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      
      {/* Ambient glow */}
      <div className="absolute -top-20 left-1/4 w-96 h-40 bg-primary/10 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute -top-20 right-1/4 w-96 h-40 bg-accent/10 blur-3xl rounded-full pointer-events-none" />
      
      <div className="flex items-center gap-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-lg animate-pulse-glow">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              <span className="text-gradient">Product Card</span>
              <span className="text-foreground"> Generator</span>
            </h1>
          </div>
        </div>
        <span className="text-xs text-primary font-mono bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
          v1.0
        </span>
      </div>

      {/* Tab Navigation */}
      <nav className="flex items-center gap-2 relative z-10">
        <TabButton
          tab="generator"
          label="Генератор"
          activeTab={activeTab}
          onClick={setActiveTab}
        />
        <TabButton
          tab="editor"
          label="Редактор фото"
          activeTab={activeTab}
          onClick={setActiveTab}
        />
        <TabButton
          tab="cards"
          label="Карточки"
          activeTab={activeTab}
          onClick={setActiveTab}
        />
      </nav>
    </header>
  );
}
