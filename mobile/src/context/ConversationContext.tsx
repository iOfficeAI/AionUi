import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { bridge } from '../services/bridge';
import { setPendingInitialMessage } from '../services/pendingInitialMessages';
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
  input?: string;
  defaultFiles?: string[];
  sessionMode?: string;
  currentModelId?: string;
};

export type CommitNewChatOptions = {
  workspace?: string;
  customWorkspace?: boolean;
  defaultFiles?: string[];
  sessionMode?: string;
  currentModelId?: string;
};

type ConversationContextType = {
  conversations: Conversation[];
  isLoading: boolean;
  availableAgents: AgentInfo[];
  activeConversationId: string | null;
  pendingAgent: AgentInfo | null;
  setActiveConversationId: (id: string | null) => void;
  startNewChat: (agent: AgentInfo) => void;
  commitNewChat: (message: string, options?: CommitNewChatOptions) => Promise<void>;
  cancelNewChat: () => void;
  refresh: () => Promise<void>;
  fetchAgents: () => Promise<void>;
  createConversation: (params: CreateConversationParams) => Promise<Conversation | null>;
  deleteConversation: (id: string) => Promise<boolean>;
  renameConversation: (id: string, name: string) => Promise<boolean>;
};

const ConversationContext = createContext<ConversationContextType>({
  conversations: [],
  isLoading: false,
  availableAgents: [],
  activeConversationId: null,
  pendingAgent: null,
  setActiveConversationId: () => {},
  startNewChat: () => {},
  commitNewChat: async () => {},
  cancelNewChat: () => {},
  refresh: async () => {},
  fetchAgents: async () => {},
  createConversation: async () => null,
  deleteConversation: async () => false,
  renameConversation: async () => false,
});

export function ConversationProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<AgentInfo[]>([]);
  const [activeConversationId, setActiveConversationIdRaw] = useState<string | null>(null);
  const [pendingAgent, setPendingAgent] = useState<AgentInfo | null>(null);
  const { connectionState, config } = useConnection();

  // When selecting an existing conversation, clear pendingAgent
  const setActiveConversationId = useCallback((id: string | null) => {
    setActiveConversationIdRaw(id);
    if (id !== null) {
      setPendingAgent(null);
    }
  }, []);

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
    }
  }, [connectionState, refresh]);

  // Clear data only when user actively disconnects (config becomes null)
  useEffect(() => {
    if (config === null) {
      setConversations([]);
      setActiveConversationIdRaw(null);
      setPendingAgent(null);
    }
  }, [config]);

  // Auto-select most recent conversation when loaded and no active selection
  useEffect(() => {
    if (conversations.length > 0 && !activeConversationId && !pendingAgent) {
      setActiveConversationIdRaw(conversations[0].id);
    }
  }, [conversations, activeConversationId, pendingAgent]);

  // Refresh conversation list when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && connectionState === 'connected') {
        void refresh();
      }
    });
    return () => sub.remove();
  }, [connectionState, refresh]);

  // Poll conversation list every 30s while connected
  useEffect(() => {
    if (connectionState !== 'connected') return;
    const timer = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(timer);
  }, [connectionState, refresh]);

  // Refresh conversation list on chat finish events (debounced)
  useEffect(() => {
    const debounceRef = { timer: null as ReturnType<typeof setTimeout> | null };

    const unsub = bridge.on('chat.response.stream', (data: unknown) => {
      const raw = data as { type: string };
      if (raw.type !== 'finish') return;

      if (debounceRef.timer) clearTimeout(debounceRef.timer);
      debounceRef.timer = setTimeout(() => void refresh(), 1000);
    });

    return () => {
      unsub();
      if (debounceRef.timer) clearTimeout(debounceRef.timer);
    };
  }, [refresh]);

  const fetchAgents = useCallback(async () => {
    if (connectionState !== 'connected') return;
    try {
      const response = await bridge.request<{ success: boolean; data?: AgentInfo[] }>(
        'acp.get-available-agents',
      );
      if (response?.success && Array.isArray(response.data)) {
        setAvailableAgents(response.data);
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
          name: params.input || params.agentName || params.agentBackend,
          model: params.model || { id: '', useModel: '' },
          extra: {
            backend: params.agentBackend,
            agentName: params.agentName,
            ...(workspace ? { workspace, customWorkspace: params.customWorkspace ?? true } : {}),
            ...(params.cliPath ? { cliPath: params.cliPath } : {}),
            ...(params.defaultFiles?.length ? { defaultFiles: params.defaultFiles } : {}),
            ...(params.sessionMode ? { sessionMode: params.sessionMode } : {}),
            ...(params.currentModelId ? { currentModelId: params.currentModelId } : {}),
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

  const startNewChat = useCallback((agent: AgentInfo) => {
    setPendingAgent(agent);
    setActiveConversationIdRaw(null);
  }, []);

  const commitNewChat = useCallback(
    async (message: string, options?: CommitNewChatOptions) => {
      if (!pendingAgent) return;
      const agent = pendingAgent;
      const result = await createConversation({
        agentBackend: agent.backend,
        agentName: agent.name,
        input: message,
        ...options,
      });
      if (result?.id) {
        setPendingInitialMessage(result.id, message);
        setPendingAgent(null);
        setActiveConversationIdRaw(result.id);
      }
    },
    [pendingAgent, createConversation],
  );

  const cancelNewChat = useCallback(() => {
    setPendingAgent(null);
  }, []);

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

  const renameConversation = useCallback(
    async (id: string, name: string) => {
      try {
        const success = await bridge.request<boolean>('update-conversation', {
          id,
          updates: { name },
        });
        if (success) {
          await refresh();
        }
        return !!success;
      } catch (e) {
        console.warn('[Conversations] Failed to rename:', e);
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
        activeConversationId,
        pendingAgent,
        setActiveConversationId,
        startNewChat,
        commitNewChat,
        cancelNewChat,
        refresh,
        fetchAgents,
        createConversation,
        deleteConversation,
        renameConversation,
      }}
    >
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversations() {
  return useContext(ConversationContext);
}
