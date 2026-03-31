import React, { createContext, useCallback, useContext, useState } from 'react';
import type { TeamAgent, TeamAgentRuntime } from '@process/team/types';

export type TeamTabsContextValue = {
  agents: TeamAgent[];
  activeSlotId: string;
  runtimes: Map<string, TeamAgentRuntime>;
  switchTab: (slotId: string) => void;
};

const TeamTabsContext = createContext<TeamTabsContextValue | null>(null);

export const TeamTabsProvider: React.FC<{
  children: React.ReactNode;
  agents: TeamAgent[];
  runtimes: Map<string, TeamAgentRuntime>;
  defaultActiveSlotId: string;
}> = ({ children, agents, runtimes, defaultActiveSlotId }) => {
  const [activeSlotId, setActiveSlotId] = useState(defaultActiveSlotId);

  const switchTab = useCallback((slotId: string) => {
    setActiveSlotId(slotId);
  }, []);

  return (
    <TeamTabsContext.Provider value={{ agents, activeSlotId, runtimes, switchTab }}>
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
