import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { TeamAgent, TeammateStatus } from '@/common/types/teamTypes';

type AgentStatusInfo = {
  slotId: string;
  status: TeammateStatus;
  lastMessage?: string;
};

export type TeamTabsContextValue = {
  agents: TeamAgent[];
  activeSlotId: string;
  statusMap: Map<string, AgentStatusInfo>;
  switchTab: (slotId: string) => void;
  renameAgent?: (slotId: string, newName: string) => Promise<void>;
};

const TeamTabsContext = createContext<TeamTabsContextValue | null>(null);

export const TeamTabsProvider: React.FC<{
  children: React.ReactNode;
  agents: TeamAgent[];
  statusMap: Map<string, AgentStatusInfo>;
  defaultActiveSlotId: string;
  renameAgent?: (slotId: string, newName: string) => Promise<void>;
}> = ({ children, agents, statusMap, defaultActiveSlotId, renameAgent }) => {
  const [activeSlotId, setActiveSlotId] = useState(defaultActiveSlotId);

  // Auto-switch when active tab is removed or on first spawn
  useEffect(() => {
    if (agents.length > 0 && !agents.some((a) => a.slotId === activeSlotId)) {
      // Prefer leader tab; fall back to first agent
      const leadAgent = agents.find((a) => a.role === 'lead');
      setActiveSlotId(leadAgent?.slotId ?? agents[0].slotId);
    }
  }, [agents, activeSlotId]);

  const switchTab = useCallback((slotId: string) => {
    setActiveSlotId(slotId);
  }, []);

  return (
    <TeamTabsContext.Provider value={{ agents, activeSlotId, statusMap, switchTab, renameAgent }}>
      {children}
    </TeamTabsContext.Provider>
  );
};

export const useTeamTabs = (): TeamTabsContextValue => {
  const context = useContext(TeamTabsContext);
  if (!context) {
    throw new Error('useTeamTabs must be used within TeamTabsProvider');
  }
  return context;
};
