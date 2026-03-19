import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { bridge } from '../services/bridge';
import { useConnection } from './ConnectionContext';

/**
 * Conversation type matching TChatConversation from AionUi.
 * Simplified for mobile — we only need display-relevant fields.
 */
export type Conversation = {
  id: string;
  name: string;
  type: string;
  status?: 'pending' | 'running' | 'finished';
  createTime: number;
  modifyTime: number;
  model: { id: string; useModel: string };
  extra: {
    workspace?: string;
    customWorkspace?: boolean;
    backend?: string;
    agentName?: string;
    pinned?: boolean;
    pinnedAt?: number;
  };
};

export type AgentInfo = {
  backend: string;
  name: string;
  label?: string;
};

type CreateConversationParams = {
  agentBackend: string;
  agentName?: string;
  cliPath?: string;
  workspace?: string;
  customWorkspace?: boolean;
  model?: { id: string; useModel: string };
};

type ConversationContextType = {
  conversations: Conversation[];
  isLoading: boolean;
  availableAgents: AgentInfo[];
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  refresh: () => Promise<void>;
  fetchAgents: () => Promise<void>;
  createConversation: (params: CreateConversationParams) => Promise<Conversation | null>;
  deleteConversation: (id: string) => Promise<boolean>;
};

const ConversationContext = createContext<ConversationContextType>({
  conversations: [],
  isLoading: false,
  availableAgents: [],
  activeConversationId: null,
  setActiveConversationId: () => {},
  refresh: async () => {},
  fetchAgents: async () => {},
  createConversation: async () => null,
  deleteConversation: async () => false,
});

export function ConversationProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<AgentInfo[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const { connectionState } = useConnection();

  const refresh = useCallback(async () => {
    if (connectionState !== 'connected') return;
    setIsLoading(true);
    try {
      const data = await bridge.request<Conversation[]>('database.get-user-conversations', {
        page: 0,
        pageSize: 100,
      });
      if (Array.isArray(data)) {
        setConversations(data);
      }
    } catch (e) {
      console.warn('[Conversations] Failed to fetch:', e);
    } finally {
      setIsLoading(false);
    }
  }, [connectionState]);

  // Auto-fetch when connected
  useEffect(() => {
    if (connectionState === 'connected') {
      void refresh();
    } else {
      setConversations([]);
      setActiveConversationId(null);
    }
  }, [connectionState, refresh]);

  // Auto-select most recent conversation when loaded and no active selection
  useEffect(() => {
    if (conversations.length > 0 && !activeConversationId) {
      setActiveConversationId(conversations[0].id);
    }
  }, [conversations, activeConversationId]);

  const fetchAgents = useCallback(async () => {
    if (connectionState !== 'connected') return;
    try {
      const data = await bridge.request<AgentInfo[]>('acp.get-available-agents');
      if (Array.isArray(data)) {
        setAvailableAgents(data);
      }
    } catch (e) {
      console.warn('[Conversations] Failed to fetch agents:', e);
    }
  }, [connectionState]);

  const createConversation = useCallback(
    async (params: CreateConversationParams) => {
      try {
        // Most agents are ACP type; only a few special types map directly
        const SPECIAL_TYPES = new Set(['gemini', 'codex', 'openclaw-gateway', 'nanobot']);
        const conversationType = SPECIAL_TYPES.has(params.agentBackend)
          ? params.agentBackend
          : 'acp';

        // Use provided workspace, or infer from most recent conversation that has one
        const workspace =
          params.workspace ?? conversations.find((c) => c.extra?.workspace)?.extra?.workspace;

        const fullParams = {
          type: conversationType,
          name: params.agentName || params.agentBackend,
          model: params.model || { id: '', useModel: '' },
          extra: {
            backend: params.agentBackend,
            agentName: params.agentName,
            ...(workspace ? { workspace, customWorkspace: params.customWorkspace ?? true } : {}),
            ...(params.cliPath ? { cliPath: params.cliPath } : {}),
          },
        };
        const result = await bridge.request<Conversation>('create-conversation', fullParams);
        if (result?.id) {
          await refresh();
          return result;
        }
      } catch (e) {
        console.warn('[Conversations] Failed to create:', e);
      }
      return null;
    },
    [refresh, conversations]
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await bridge.request('remove-conversation', { id });
        // If deleting the active conversation, switch to next one
        if (id === activeConversationId) {
          const remaining = conversations.filter((c) => c.id !== id);
          setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
        }
        await refresh();
        return true;
      } catch (e) {
        console.warn('[Conversations] Failed to delete:', e);
        return false;
      }
    },
    [refresh, activeConversationId, conversations]
  );

  return (
    <ConversationContext.Provider
      value={{
        conversations,
        isLoading,
        availableAgents,
        activeConversationId,
        setActiveConversationId,
        refresh,
        fetchAgents,
        createConversation,
        deleteConversation,
      }}
    >
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversations() {
  return useContext(ConversationContext);
}
