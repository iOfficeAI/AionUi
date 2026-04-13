import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
  teamId: string;
  switchTab: (slotId: string) => void;
  renameAgent?: (slotId: string, newName: string) => Promise<void>;
  removeAgent?: (slotId: string) => void;
  reorderAgents: (fromSlotId: string, toSlotId: string) => void;
};

const TeamTabsContext = createContext<TeamTabsContextValue | null>(null);

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
  const [localAgents, setLocalAgents] = useState<TeamAgent[]>(externalAgents);

  // Sync external agent list changes (e.g., new agent added)
  useEffect(() => {
    setLocalAgents(externalAgents);
  }, [externalAgents]);

  const agents = localAgents;

  // Auto-switch when active tab is removed or on first spawn
  useEffect(() => {
    if (agents.length > 0 && !agents.some((a) => a.slotId === activeSlotId)) {
      // Prefer leader tab; fall back to first agent
      const leadAgent = agents.find((a) => a.role === 'lead');
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
      const fromIndex = prev.findIndex((a) => a.slotId === fromSlotId);
      const toIndex = prev.findIndex((a) => a.slotId === toSlotId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const next = [...prev];
      const [removed] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, removed);
      // Ensure leader always stays at index 0
      const leadIdx = next.findIndex((a) => a.role === 'lead');
      if (leadIdx > 0) {
        const [lead] = next.splice(leadIdx, 1);
        next.unshift(lead);
      }
      return next;
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
