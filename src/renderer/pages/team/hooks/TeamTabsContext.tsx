import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { TeamAgent, TeammateStatus } from '@/common/types/teamTypes';
import {
  readStoredSiderOrder,
  sortSiderItemsByStoredOrder,
  writeStoredSiderOrder,
} from '@renderer/components/layout/Sider/siderOrder';

type AgentStatusInfo = {
  slotId: string;
  status: TeammateStatus;
  lastMessage?: string;
};

export type TeamTabsContextValue = {
  agents: TeamAgent[];
  activeSlotId: string;
  statusMap: Map<string, AgentStatusInfo>;
  teamId: string;
  switchTab: (slotId: string) => void;
  renameAgent?: (slotId: string, newName: string) => Promise<void>;
  removeAgent?: (slotId: string) => void;
  reorderAgents: (fromSlotId: string, toSlotId: string) => void;
};

const TeamTabsContext = createContext<TeamTabsContextValue | null>(null);
const TEAM_AGENT_ORDER_STORAGE_PREFIX = 'team-agent-order-';

const getTeamAgentOrderStorageKey = (teamId: string): string => `${TEAM_AGENT_ORDER_STORAGE_PREFIX}${teamId}`;

const sortTeamAgents = (agents: TeamAgent[], teamId: string, fallbackOrder?: string[]): TeamAgent[] => {
  const leadAgent = agents.find((agent) => agent.role === 'leader');
  const teammateAgents = agents.filter((agent) => agent.role !== 'leader');
  const storedOrder = fallbackOrder ?? readStoredSiderOrder(getTeamAgentOrderStorageKey(teamId));
  const orderedTeammates = sortSiderItemsByStoredOrder({
    items: teammateAgents,
    storedOrder,
    getId: (agent) => agent.slotId,
  });

  return leadAgent ? [leadAgent, ...orderedTeammates] : orderedTeammates;
};

export const TeamTabsProvider: React.FC<{
  children: React.ReactNode;
  agents: TeamAgent[];
  statusMap: Map<string, AgentStatusInfo>;
  defaultActiveSlotId: string;
  teamId: string;
  renameAgent?: (slotId: string, newName: string) => Promise<void>;
  removeAgent?: (slotId: string) => void;
}> = ({ children, agents: externalAgents, statusMap, defaultActiveSlotId, teamId, renameAgent, removeAgent }) => {
  const storageKey = `team-active-slot-${teamId}`;
  const savedSlotId = localStorage.getItem(storageKey);
  const initialSlotId =
    savedSlotId && externalAgents.some((a) => a.slotId === savedSlotId) ? savedSlotId : defaultActiveSlotId;
  const [activeSlotId, setActiveSlotId] = useState(initialSlotId);
  const [localAgents, setLocalAgents] = useState<TeamAgent[]>(() => sortTeamAgents(externalAgents, teamId));

  // Sync external agent list changes (e.g., new agent added)
  useEffect(() => {
    setLocalAgents((previousAgents) => {
      const previousTeammateOrder = previousAgents
        .filter((agent) => agent.role !== 'leader')
        .map((agent) => agent.slotId);
      return sortTeamAgents(externalAgents, teamId, previousTeammateOrder);
    });
  }, [externalAgents, teamId]);

  useEffect(() => {
    writeStoredSiderOrder(
      getTeamAgentOrderStorageKey(teamId),
      localAgents.filter((agent) => agent.role !== 'leader').map((agent) => agent.slotId)
    );
  }, [localAgents, teamId]);

  const agents = localAgents;

  // Auto-switch when active tab is removed or on first spawn
  useEffect(() => {
    if (agents.length > 0 && !agents.some((a) => a.slotId === activeSlotId)) {
      // Prefer leader tab; fall back to first agent
      const leadAgent = agents.find((a) => a.role === 'leader');
      const fallbackSlotId = leadAgent?.slotId ?? agents[0]?.slotId ?? '';
      setActiveSlotId(fallbackSlotId);
      localStorage.setItem(storageKey, fallbackSlotId);
    }
  }, [agents, activeSlotId, storageKey]);

  const switchTab = useCallback(
    (slotId: string) => {
      setActiveSlotId(slotId);
      localStorage.setItem(storageKey, slotId);
    },
    [storageKey]
  );

  const reorderAgents = useCallback((fromSlotId: string, toSlotId: string) => {
    if (fromSlotId === toSlotId) return;

    setLocalAgents((prev) => {
      const leadAgent = prev.find((agent) => agent.role === 'leader');
      const teammates = prev.filter((agent) => agent.role !== 'leader');
      const fromIndex = teammates.findIndex((agent) => agent.slotId === fromSlotId);
      const toIndex = teammates.findIndex((agent) => agent.slotId === toSlotId);
      if (fromIndex === -1 || toIndex === -1) return prev;

      const nextTeammates = [...teammates];
      const [removed] = nextTeammates.splice(fromIndex, 1);
      nextTeammates.splice(toIndex, 0, removed);

      return leadAgent ? [leadAgent, ...nextTeammates] : nextTeammates;
    });
  }, []);

  const contextValue = useMemo(
    () => ({ agents, activeSlotId, statusMap, teamId, switchTab, renameAgent, removeAgent, reorderAgents }),
    [agents, activeSlotId, statusMap, teamId, switchTab, renameAgent, removeAgent, reorderAgents]
  );

  return <TeamTabsContext.Provider value={contextValue}>{children}</TeamTabsContext.Provider>;
};

export const useTeamTabs = (): TeamTabsContextValue => {
  const context = useContext(TeamTabsContext);
  if (!context) {
    throw new Error('useTeamTabs must be used within TeamTabsProvider');
  }
  return context;
};
