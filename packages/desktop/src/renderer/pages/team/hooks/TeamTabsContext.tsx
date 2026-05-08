import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { TeamAgent, TeammateStatus } from '@/common/types/teamTypes';
import {
  readStoredSiderOrder,
  sortSiderItemsByStoredOrder,
  writeStoredSiderOrder,
} from '@renderer/components/layout/Sider/siderOrder';

type AgentStatusInfo = {
  slot_id: string;
  status: TeammateStatus;
  last_message?: string;
};

export type TeamTabsContextValue = {
  agents: TeamAgent[];
  activeSlotId: string;
  statusMap: Map<string, AgentStatusInfo>;
  team_id: string;
  switchTab: (slot_id: string) => void;
  renameAgent?: (slot_id: string, new_name: string) => Promise<void>;
  removeAgent?: (slot_id: string) => void;
  reorderAgents: (fromSlotId: string, toSlotId: string) => void;
};

const TeamTabsContext = createContext<TeamTabsContextValue | null>(null);
const TEAM_AGENT_ORDER_STORAGE_PREFIX = 'team-agent-order-';

const getTeamAgentOrderStorageKey = (team_id: string): string => `${TEAM_AGENT_ORDER_STORAGE_PREFIX}${team_id}`;

const sortTeamAgents = (agents: TeamAgent[], team_id: string, fallbackOrder?: string[]): TeamAgent[] => {
  const leadAgent = agents.find((agent) => agent.role === 'leader');
  const teammateAgents = agents.filter((agent) => agent.role !== 'leader');
  const storedOrder = fallbackOrder ?? readStoredSiderOrder(getTeamAgentOrderStorageKey(team_id));
  const orderedTeammates = sortSiderItemsByStoredOrder({
    items: teammateAgents,
    storedOrder,
    getId: (agent) => agent.slot_id,
  });

  return leadAgent ? [leadAgent, ...orderedTeammates] : orderedTeammates;
};

export const TeamTabsProvider: React.FC<{
  children: React.ReactNode;
  agents: TeamAgent[];
  statusMap: Map<string, AgentStatusInfo>;
  defaultActiveSlotId: string;
  team_id: string;
  renameAgent?: (slot_id: string, new_name: string) => Promise<void>;
  removeAgent?: (slot_id: string) => void;
}> = ({ children, agents: externalAgents, statusMap, defaultActiveSlotId, team_id, renameAgent, removeAgent }) => {
  const storageKey = `team-active-slot-${team_id}`;
  const savedSlotId = localStorage.getItem(storageKey);
  const initialSlotId =
    savedSlotId && externalAgents.some((a) => a.slot_id === savedSlotId) ? savedSlotId : defaultActiveSlotId;
  const [activeSlotId, setActiveSlotId] = useState(initialSlotId);
  const [localAgents, setLocalAgents] = useState<TeamAgent[]>(() => sortTeamAgents(externalAgents, team_id));

  // Sync external agent list changes (e.g., new agent added)
  useEffect(() => {
    setLocalAgents((previousAgents) => {
      const previousTeammateOrder = previousAgents
        .filter((agent) => agent.role !== 'leader')
        .map((agent) => agent.slot_id);
      return sortTeamAgents(externalAgents, team_id, previousTeammateOrder);
    });
  }, [externalAgents, team_id]);

  useEffect(() => {
    writeStoredSiderOrder(
      getTeamAgentOrderStorageKey(team_id),
      localAgents.filter((agent) => agent.role !== 'leader').map((agent) => agent.slot_id)
    );
  }, [localAgents, team_id]);

  const agents = localAgents;

  // Auto-switch when active tab is removed or on first spawn
  useEffect(() => {
    if (agents.length > 0 && !agents.some((a) => a.slot_id === activeSlotId)) {
      // Prefer leader tab; fall back to first agent
      const leadAgent = agents.find((a) => a.role === 'leader');
      const fallbackSlotId = leadAgent?.slot_id ?? agents[0]?.slot_id ?? '';
      setActiveSlotId(fallbackSlotId);
      localStorage.setItem(storageKey, fallbackSlotId);
    }
  }, [agents, activeSlotId, storageKey]);

  const switchTab = useCallback(
    (slot_id: string) => {
      setActiveSlotId(slot_id);
      localStorage.setItem(storageKey, slot_id);
    },
    [storageKey]
  );

  const reorderAgents = useCallback((fromSlotId: string, toSlotId: string) => {
    if (fromSlotId === toSlotId) return;

    setLocalAgents((prev) => {
      const leadAgent = prev.find((agent) => agent.role === 'leader');
      const teammates = prev.filter((agent) => agent.role !== 'leader');
      const fromIndex = teammates.findIndex((agent) => agent.slot_id === fromSlotId);
      const toIndex = teammates.findIndex((agent) => agent.slot_id === toSlotId);
      if (fromIndex === -1 || toIndex === -1) return prev;

      const nextTeammates = [...teammates];
      const [removed] = nextTeammates.splice(fromIndex, 1);
      nextTeammates.splice(toIndex, 0, removed);

      return leadAgent ? [leadAgent, ...nextTeammates] : nextTeammates;
    });
  }, []);

  const contextValue = useMemo(
    () => ({ agents, activeSlotId, statusMap, team_id, switchTab, renameAgent, removeAgent, reorderAgents }),
    [agents, activeSlotId, statusMap, team_id, switchTab, renameAgent, removeAgent, reorderAgents]
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
