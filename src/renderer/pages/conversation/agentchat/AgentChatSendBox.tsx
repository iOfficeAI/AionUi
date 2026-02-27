/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { transformMessage, type TMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import { uuid } from '@/common/utils';
import SendBox from '@/renderer/components/sendbox';
import { useAddOrUpdateMessage } from '@/renderer/messages/hooks';
import { emitter } from '@/renderer/utils/emitter';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAgentChat } from './AgentChatContext';
import MentionToggles from './MentionToggles';
import ReplyPreview from './ReplyPreview';
import styles from './agentchat.module.css';

type AgentChatSendBoxProps = {
  conversation_id: string;
  backend?: string;
};

const AgentChatSendBox: React.FC<AgentChatSendBoxProps> = ({ conversation_id, backend = 'claude' }) => {
  const { t } = useTranslation();
  const { activeMentions, agents, replyTo, setReplyTo, username, setTypingAgent } = useAgentChat();
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const [running, setRunning] = useState(false);
  const [input, setInput] = useState('');
  const runningRef = useRef(running);

  // Capitalize first letter of backend for display
  const backendLabel = backend.charAt(0).toUpperCase() + backend.slice(1);

  // Sync ref
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  // Listen for response stream (same pattern as AcpSendBox)
  useEffect(() => {
    const handleResponseMessage = (message: IResponseMessage) => {
      if (conversation_id !== message.conversation_id) return;

      const transformedMessage = transformMessage(message);

      // Use agentMeta name for typing indicator when a delegated agent responds
      const agentLabel = message.agentMeta?.name || backendLabel;

      switch (message.type) {
        case 'start':
          setRunning(true);
          runningRef.current = true;
          setTypingAgent(agentLabel);
          break;
        case 'finish': {
          const timeoutId = setTimeout(() => {
            setRunning(false);
            runningRef.current = false;
            setTypingAgent(null);
          }, 1000);
          (window as unknown as { __agentChatFinishTimeout?: ReturnType<typeof setTimeout> }).__agentChatFinishTimeout = timeoutId;
          break;
        }
        case 'thought':
          // Agent is thinking — keep typing indicator alive, don't store
          if (!runningRef.current) {
            setRunning(true);
            runningRef.current = true;
          }
          setTypingAgent(agentLabel);
          break;
        case 'content':
          // Real conversational content — the only type we display as chat bubbles
          if (!runningRef.current) {
            setRunning(true);
            runningRef.current = true;
          }
          setTypingAgent(null);
          addOrUpdateMessage(transformedMessage);
          break;
        case 'user_content':
          // User's own message echoed back from backend
          addOrUpdateMessage(transformedMessage);
          break;
        case 'error':
          // Show errors so the user knows something went wrong
          setRunning(false);
          runningRef.current = false;
          setTypingAgent(null);
          addOrUpdateMessage(transformedMessage);
          break;
        default:
          // Silently ignore internal messages (tool_call, tool_group,
          // acp_tool_call, acp_permission, plan, agent_status, etc.)
          // — they are internal agent mechanics, not meaningful chat content
          if (!runningRef.current && message.type !== 'queue_status') {
            setRunning(true);
            runningRef.current = true;
          }
          break;
      }
    };

    return ipcBridge.acpConversation.responseStream.on(handleResponseMessage);
  }, [conversation_id, addOrUpdateMessage, setTypingAgent, backendLabel]);

  // Reset state on conversation change
  useEffect(() => {
    const pending = (window as unknown as { __agentChatFinishTimeout?: ReturnType<typeof setTimeout> }).__agentChatFinishTimeout;
    if (pending) {
      clearTimeout(pending);
      (window as unknown as { __agentChatFinishTimeout?: ReturnType<typeof setTimeout> }).__agentChatFinishTimeout = undefined;
    }

    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (!res) {
        setRunning(false);
        runningRef.current = false;
        return;
      }
      const isRunning = res.status === 'running';
      setRunning(isRunning);
      runningRef.current = isRunning;
    });
  }, [conversation_id]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      // Build mentions prefix from active toggles
      const mentionPrefixes = Array.from(activeMentions)
        .map((id) => {
          const agent = agents.find((a) => a.id === id);
          return agent ? `@${agent.name}` : '';
        })
        .filter(Boolean);

      const finalText = mentionPrefixes.length > 0 ? `${mentionPrefixes.join(' ')} ${text}` : text;
      const msg_id = uuid();

      // Set typing indicator for mentioned agents
      if (mentionPrefixes.length > 0) {
        const firstMentioned = agents.find((a) => activeMentions.has(a.id));
        if (firstMentioned) {
          setTypingAgent(firstMentioned.label);
        }
      }

      setRunning(true);
      runningRef.current = true;

      // Clear reply
      setReplyTo(null);

      // Send to backend via unified conversation API
      try {
        await ipcBridge.acpConversation.sendMessage.invoke({
          input: finalText,
          msg_id,
          conversation_id,
        });
        emitter.emit('chat.history.refresh');
      } catch (error) {
        console.error('[AgentChatSendBox] Failed to send:', error);
        setRunning(false);
        runningRef.current = false;
        setTypingAgent(null);
      }
    },
    [conversation_id, activeMentions, agents, addOrUpdateMessage, setReplyTo, setTypingAgent]
  );

  const handleStop = useCallback(async () => {
    try {
      await ipcBridge.conversation.stop.invoke({ conversation_id });
    } finally {
      setRunning(false);
      runningRef.current = false;
      setTypingAgent(null);
    }
  }, [conversation_id, setTypingAgent]);

  return (
    <div className={styles.footer}>
      <MentionToggles />
      <ReplyPreview />
      <SendBox
        value={input}
        onChange={setInput}
        onSend={handleSend}
        onStop={handleStop}
        loading={running}
        placeholder={t('conversation.agentchat.inputPlaceholder', 'Type a message... (use @name to mention agents)')}
        prefix={
          <div className={styles.senderLabel} style={{ marginBottom: 4 }}>
            {username}
          </div>
        }
      />
      <div className={styles.inputHint}>Enter to send &middot; Shift+Enter for newline &middot; Use @mentions or toggles to address agents</div>
    </div>
  );
};

export default AgentChatSendBox;
