import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { TeamAssistant, TeammateStatus } from '@/common/types/team/teamTypes';
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
  assistants: TeamAssistant[];
  activeSlotId: string;
  statusMap: Map<string, AgentStatusInfo>;
  team_id: string;
  switchTab: (slot_id: string) => void;
  renameAssistant?: (slot_id: string, new_name: string) => Promise<void>;
  removeAssistant?: (slot_id: string) => void;
  reorderAssistants: (fromSlotId: string, toSlotId: string) => void;
};

const TeamTabsContext = createContext<TeamTabsContextValue | null>(null);
const TEAM_ASSISTANT_ORDER_STORAGE_PREFIX = 'team-assistant-order-';

const getTeamAssistantOrderStorageKey = (team_id: string): string => `${TEAM_ASSISTANT_ORDER_STORAGE_PREFIX}${team_id}`;

const sortTeamAssistants = (
  assistants: TeamAssistant[],
  team_id: string,
  fallbackOrder?: string[]
): TeamAssistant[] => {
  const leadAssistant = assistants.find((assistant) => assistant.role === 'leader');
  const teammateAssistants = assistants.filter((assistant) => assistant.role !== 'leader');
  const storedOrder = fallbackOrder ?? readStoredSiderOrder(getTeamAssistantOrderStorageKey(team_id));
  const orderedTeammates = sortSiderItemsByStoredOrder({
    items: teammateAssistants,
    storedOrder,
    getId: (assistant) => assistant.slot_id,
  });

  return leadAssistant ? [leadAssistant, ...orderedTeammates] : orderedTeammates;
};

export const TeamTabsProvider: React.FC<{
  children: React.ReactNode;
  assistants: TeamAssistant[];
  statusMap: Map<string, AgentStatusInfo>;
  defaultActiveSlotId: string;
  team_id: string;
  renameAssistant?: (slot_id: string, new_name: string) => Promise<void>;
  removeAssistant?: (slot_id: string) => void;
}> = ({
  children,
  assistants: externalAssistants,
  statusMap,
  defaultActiveSlotId,
  team_id,
  renameAssistant,
  removeAssistant,
}) => {
  const storageKey = `team-active-slot-${team_id}`;
  const savedSlotId = localStorage.getItem(storageKey);
  const initialSlotId =
    savedSlotId && externalAssistants.some((assistant) => assistant.slot_id === savedSlotId)
      ? savedSlotId
      : defaultActiveSlotId;
  const [activeSlotId, setActiveSlotId] = useState(initialSlotId);
  const [localAssistants, setLocalAssistants] = useState<TeamAssistant[]>(() =>
    sortTeamAssistants(externalAssistants, team_id)
  );

  // Sync external assistant list changes (e.g., new assistant added)
  useEffect(() => {
    setLocalAssistants((previousAssistants) => {
      const previousTeammateOrder = previousAssistants
        .filter((assistant) => assistant.role !== 'leader')
        .map((assistant) => assistant.slot_id);
      return sortTeamAssistants(externalAssistants, team_id, previousTeammateOrder);
    });
  }, [externalAssistants, team_id]);

  useEffect(() => {
    writeStoredSiderOrder(
      getTeamAssistantOrderStorageKey(team_id),
      localAssistants.filter((assistant) => assistant.role !== 'leader').map((assistant) => assistant.slot_id)
    );
  }, [localAssistants, team_id]);

  const assistants = localAssistants;

  // Auto-switch when active tab is removed or on first spawn
  useEffect(() => {
    if (assistants.length > 0 && !assistants.some((assistant) => assistant.slot_id === activeSlotId)) {
      // Prefer leader tab; fall back to first assistant
      const leadAssistant = assistants.find((assistant) => assistant.role === 'leader');
      const fallbackSlotId = leadAssistant?.slot_id ?? assistants[0]?.slot_id ?? '';
      setActiveSlotId(fallbackSlotId);
      localStorage.setItem(storageKey, fallbackSlotId);
    }
  }, [assistants, activeSlotId, storageKey]);

  const switchTab = useCallback(
    (slot_id: string) => {
      setActiveSlotId(slot_id);
      localStorage.setItem(storageKey, slot_id);
    },
    [storageKey]
  );

  const reorderAssistants = useCallback((fromSlotId: string, toSlotId: string) => {
    if (fromSlotId === toSlotId) return;

    setLocalAssistants((prev) => {
      const leadAssistant = prev.find((assistant) => assistant.role === 'leader');
      const teammates = prev.filter((assistant) => assistant.role !== 'leader');
      const fromIndex = teammates.findIndex((assistant) => assistant.slot_id === fromSlotId);
      const toIndex = teammates.findIndex((assistant) => assistant.slot_id === toSlotId);
      if (fromIndex === -1 || toIndex === -1) return prev;

      const nextTeammates = [...teammates];
      const [removed] = nextTeammates.splice(fromIndex, 1);
      nextTeammates.splice(toIndex, 0, removed);

      return leadAssistant ? [leadAssistant, ...nextTeammates] : nextTeammates;
    });
  }, []);

  const handleRenameAssistant = useCallback(
    async (slot_id: string, new_name: string) => {
      await renameAssistant?.(slot_id, new_name);
      setLocalAssistants((prev) =>
        prev.map((assistant) =>
          assistant.slot_id === slot_id ? { ...assistant, assistant_name: new_name } : assistant
        )
      );
    },
    [renameAssistant]
  );

  const contextValue = useMemo(
    () => ({
      assistants,
      activeSlotId,
      statusMap,
      team_id,
      switchTab,
      renameAssistant: renameAssistant ? handleRenameAssistant : undefined,
      removeAssistant,
      reorderAssistants,
    }),
    [
      assistants,
      activeSlotId,
      statusMap,
      team_id,
      switchTab,
      renameAssistant,
      handleRenameAssistant,
      removeAssistant,
      reorderAssistants,
    ]
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
