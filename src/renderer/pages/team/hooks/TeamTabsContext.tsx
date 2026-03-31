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
};

const TeamTabsContext = createContext<TeamTabsContextValue | null>(null);

export const TeamTabsProvider: React.FC<{
  children: React.ReactNode;
  agents: TeamAgent[];
  statusMap: Map<string, AgentStatusInfo>;
  defaultActiveSlotId: string;
}> = ({ children, agents, statusMap, defaultActiveSlotId }) => {
  const [activeSlotId, setActiveSlotId] = useState(defaultActiveSlotId);

  // Auto-switch to newly spawned agent's tab
  useEffect(() => {
    if (agents.length > 0 && !agents.some((a) => a.slotId === activeSlotId)) {
      setActiveSlotId(agents[agents.length - 1].slotId);
    }
  }, [agents, activeSlotId]);

  const switchTab = useCallback((slotId: string) => {
    setActiveSlotId(slotId);
  }, []);

  return (
    <TeamTabsContext.Provider value={{ agents, activeSlotId, statusMap, switchTab }}>
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
