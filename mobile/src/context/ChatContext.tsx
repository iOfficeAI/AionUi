import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { bridge } from '../services/bridge';
import { consumePendingInitialMessage } from '../services/pendingInitialMessages';
import { transformMessage, composeMessage, type TMessage, type IResponseMessage } from '../utils/messageAdapter';
import { uuid } from '../utils/uuid';

type ChatContextType = {
  messages: TMessage[];
  isStreaming: boolean;
  conversationId: string | null;
  loadConversation: (id: string) => void;
  sendMessage: (text: string) => void;
  stopGeneration: () => void;
  confirmAction: (msgId: string, callId: string, confirmKey: string) => void;
};

const ChatContext = createContext<ChatContextType>({
  messages: [],
  isStreaming: false,
  conversationId: null,
  loadConversation: () => {},
  sendMessage: () => {},
  stopGeneration: () => {},
  confirmAction: () => {},
});

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<TMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesRef = useRef<TMessage[]>([]);

  // Keep ref in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Load message history
  const loadConversation = useCallback(async (id: string) => {
    setConversationId(id);
    setMessages([]);
    setIsStreaming(false);

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
        return;
      }

      const msg = transformMessage(raw);
      if (msg) {
        setMessages((prev) => composeMessage(msg, prev));
      }
    });

    // Also listen for confirmation events
    const unsubConfirmAdd = bridge.on('confirmation.add', (data: unknown) => {
      // Confirmation events are rendered inline via acp_permission / codex_permission messages
    });

    return () => {
      unsub();
      unsubConfirmAdd();
    };
  }, [conversationId]);

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
    (text: string) => {
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
      bridge.request('chat.send.message', {
        input: text,
        msg_id: msgId,
        conversation_id: conversationId,
      }).catch((e) => console.warn('[Chat] send failed:', e));
    },
    [conversationId]
  );

  const stopGeneration = useCallback(() => {
    if (!conversationId) return;
    setIsStreaming(false);
    bridge
      .request('chat.stop.stream', { conversation_id: conversationId })
      .catch((e) => console.warn('[Chat] stop stream failed:', e));
  }, [conversationId]);

  const confirmAction = useCallback(
    (msgId: string, callId: string, confirmKey: string) => {
      if (!conversationId) return;
      bridge
        .request('confirmation.confirm', {
          conversation_id: conversationId,
          msg_id: msgId,
          callId,
          data: confirmKey,
        })
        .catch((e) => console.warn('[Chat] confirm failed:', e));
    },
    [conversationId]
  );

  return (
    <ChatContext.Provider
      value={{
        messages,
        isStreaming,
        conversationId,
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
