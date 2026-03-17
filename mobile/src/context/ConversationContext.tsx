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
    backend?: string;
    agentName?: string;
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
};

type ConversationContextType = {
  conversations: Conversation[];
  isLoading: boolean;
  availableAgents: AgentInfo[];
  refresh: () => Promise<void>;
  fetchAgents: () => Promise<void>;
  createConversation: (params: CreateConversationParams) => Promise<Conversation | null>;
  deleteConversation: (id: string) => Promise<boolean>;
};

const ConversationContext = createContext<ConversationContextType>({
  conversations: [],
  isLoading: false,
  availableAgents: [],
  refresh: async () => {},
  fetchAgents: async () => {},
  createConversation: async () => null,
  deleteConversation: async () => false,
});

export function ConversationProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<AgentInfo[]>([]);
  const { connectionState } = useConnection();

  const refresh = useCallback(async () => {
    if (connectionState !== 'connected') return;
    setIsLoading(true);
    try {
      const data = await bridge.request<Conversation[]>('database.get-user-conversations', {
        page: 1,
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
      refresh();
    } else {
      setConversations([]);
    }
  }, [connectionState, refresh]);

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
        const fullParams = {
          type: params.agentBackend,
          name: params.agentName || params.agentBackend,
          model: { id: '', useModel: '' },
          extra: {
            backend: params.agentBackend,
            agentName: params.agentName,
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
    [refresh]
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await bridge.request('remove-conversation', { id });
        await refresh();
        return true;
      } catch (e) {
        console.warn('[Conversations] Failed to delete:', e);
        return false;
      }
    },
    [refresh]
  );

  return (
    <ConversationContext.Provider
      value={{
        conversations,
        isLoading,
        availableAgents,
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
