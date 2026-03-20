import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { bridge } from '../services/bridge';
import { consumePendingInitialMessage } from '../services/pendingInitialMessages';
import { transformMessage, composeMessage, type TMessage, type IResponseMessage } from '../utils/messageAdapter';
import { uuid } from '../utils/uuid';
import { useConnection } from './ConnectionContext';

export type ThoughtData = { subject: string; description: string } | null;

type ChatContextType = {
  messages: TMessage[];
  isStreaming: boolean;
  conversationId: string | null;
  confirmations: any[];
  contextUsage: { used: number; size: number } | null;
  thought: ThoughtData;
  loadConversation: (id: string) => void;
  sendMessage: (text: string, files?: string[]) => void;
  stopGeneration: () => void;
  confirmAction: (confirmationId: string, callId: string, confirmKey: string) => void;
};

const ChatContext = createContext<ChatContextType>({
  messages: [],
  isStreaming: false,
  conversationId: null,
  confirmations: [],
  contextUsage: null,
  thought: null,
  loadConversation: () => {},
  sendMessage: () => {},
  stopGeneration: () => {},
  confirmAction: () => {},
});

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<TMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [confirmations, setConfirmations] = useState<any[]>([]);
  const [contextUsage, setContextUsage] = useState<{ used: number; size: number } | null>(null);
  const [thought, setThought] = useState<ThoughtData>(null);
  const messagesRef = useRef<TMessage[]>([]);
  const { connectionState } = useConnection();
  const prevConnectionStateRef = useRef(connectionState);

  // Keep ref in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Load message history
  const loadConversation = useCallback(async (id: string) => {
    setConversationId(id);
    setMessages([]);
    setIsStreaming(false);
    setConfirmations([]);
    setContextUsage(null);
    setThought(null);

    try {
      const data = await bridge.request<TMessage[]>('database.get-conversation-messages', {
        conversation_id: id,
      });
      if (Array.isArray(data)) {
        setMessages(data);
      }
    } catch (e) {
      console.warn('[Chat] Failed to load messages:', e);
    }
  }, []);

  // Subscribe to streaming responses
  useEffect(() => {
    if (!conversationId) return;

    const unsub = bridge.on('chat.response.stream', (data: unknown) => {
      const raw = data as IResponseMessage;
      if (raw.conversation_id !== conversationId) return;

      // Track streaming state
      if (raw.type === 'start') {
        setIsStreaming(true);
        return;
      }
      if (raw.type === 'finish') {
        setIsStreaming(false);
        setThought(null);
        return;
      }

      // Ephemeral thought — update state, don't add to message list
      if (raw.type === 'thought') {
        const data = raw.data as { subject: string; description: string };
        setThought({ subject: data.subject, description: data.description });
        return;
      }

      // Clear thought when content arrives
      if (raw.type === 'content') {
        setThought(null);
      }

      // Extract context usage metadata
      if (raw.type === 'acp_context_usage') {
        setContextUsage(raw.data as { used: number; size: number });
        return;
      }

      const msg = transformMessage(raw);
      if (msg) {
        setMessages((prev) => composeMessage(msg, prev));
      }
    });

    // Confirmation lifecycle events
    const unsubConfirmAdd = bridge.on('confirmation.add', (data: unknown) => {
      const confirmation = data as any;
      if (confirmation.conversation_id !== conversationId) return;
      setConfirmations((prev) => [...prev, confirmation]);

      // Also inject as acp_permission message for inline rendering
      const permMsg: TMessage = {
        id: uuid(),
        msg_id: confirmation.msg_id,
        conversation_id: conversationId,
        type: 'acp_permission',
        position: 'left',
        content: confirmation,
      };
      setMessages((prev) => [...prev, permMsg]);
    });

    const unsubConfirmUpdate = bridge.on('confirmation.update', (data: unknown) => {
      const update = data as any;
      setConfirmations((prev) => prev.map((c) => (c.id === update.id ? { ...c, ...update } : c)));
    });

    const unsubConfirmRemove = bridge.on('confirmation.remove', (data: unknown) => {
      const removal = data as any;
      setConfirmations((prev) => prev.filter((c) => c.id !== removal.id));
    });

    return () => {
      unsub();
      unsubConfirmAdd();
      unsubConfirmUpdate();
      unsubConfirmRemove();
    };
  }, [conversationId]);

  // Restore pending confirmations on reconnect (Issue 2)
  useEffect(() => {
    const wasDisconnected = prevConnectionStateRef.current !== 'connected';
    prevConnectionStateRef.current = connectionState;

    if (wasDisconnected && connectionState === 'connected' && conversationId) {
      bridge
        .request<any[]>('confirmation.list', { conversation_id: conversationId })
        .then((list) => {
          if (Array.isArray(list)) {
            setConfirmations(list);
          }
        })
        .catch((e) => console.warn('[Chat] Failed to restore confirmations:', e));
    }
  }, [connectionState, conversationId]);

  // Auto-send initial message when conversation was created via commitNewChat
  useEffect(() => {
    if (!conversationId) return;
    const pending = consumePendingInitialMessage(conversationId);
    if (!pending) return;

    const msgId = uuid();
    const userMsg: TMessage = {
      id: uuid(),
      msg_id: msgId,
      conversation_id: conversationId,
      type: 'text',
      position: 'right',
      content: { content: pending },
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    bridge
      .request('chat.send.message', {
        input: pending,
        msg_id: msgId,
        conversation_id: conversationId,
      })
      .catch((e) => console.warn('[Chat] initial send failed:', e));
  }, [conversationId]);

  const sendMessage = useCallback(
    (text: string, files?: string[]) => {
      if (!conversationId || !text.trim()) return;

      const msgId = uuid();

      // Optimistic insert for user message
      const userMsg: TMessage = {
        id: uuid(),
        msg_id: msgId,
        conversation_id: conversationId,
        type: 'text',
        position: 'right',
        content: { content: text },
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Send via bridge
      bridge
        .request('chat.send.message', {
          input: text,
          msg_id: msgId,
          conversation_id: conversationId,
          ...(files?.length ? { files } : {}),
        })
        .catch((e) => console.warn('[Chat] send failed:', e));
    },
    [conversationId],
  );

  const stopGeneration = useCallback(() => {
    if (!conversationId) return;
    setIsStreaming(false);
    bridge
      .request('chat.stop.stream', { conversation_id: conversationId })
      .catch((e) => console.warn('[Chat] stop stream failed:', e));
  }, [conversationId]);

  const confirmAction = useCallback(
    (confirmationId: string, callId: string, confirmKey: string) => {
      if (!conversationId) return;
      bridge
        .request('confirmation.confirm', {
          conversation_id: conversationId,
          msg_id: confirmationId,
          callId,
          data: confirmKey,
        })
        .catch((e) => console.warn('[Chat] confirm failed:', e));
    },
    [conversationId],
  );

  return (
    <ChatContext.Provider
      value={{
        messages,
        isStreaming,
        conversationId,
        confirmations,
        contextUsage,
        thought,
        loadConversation,
        sendMessage,
        stopGeneration,
        confirmAction,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  return useContext(ChatContext);
}
