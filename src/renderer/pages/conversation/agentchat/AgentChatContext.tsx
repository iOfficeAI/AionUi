/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { AgentConfig, ReplyRef, TodoItem } from './types';
import { DEFAULT_AGENTS } from './types';

type AgentChatContextValue = {
  // Agent management
  agents: AgentConfig[];
  setAgents: React.Dispatch<React.SetStateAction<AgentConfig[]>>;
  getAgentColor: (name: string) => string;
  getAgent: (name: string) => AgentConfig | undefined;

  // Mention toggles
  activeMentions: Set<string>;
  toggleMention: (agentId: string) => void;
  clearMentions: () => void;

  // Reply threading
  replyTo: ReplyRef | null;
  setReplyTo: (ref: ReplyRef | null) => void;

  // Todo system
  todos: TodoItem[];
  addTodo: (item: Omit<TodoItem, 'id' | 'createdAt'>) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
  todoPanelOpen: boolean;
  setTodoPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Typing indicator
  typingAgent: string | null;
  setTypingAgent: (name: string | null) => void;

  // Settings
  username: string;
  setUsername: (name: string) => void;
  maxHops: number;
  setMaxHops: (n: number) => void;
};

const AgentChatCtx = createContext<AgentChatContextValue | null>(null);

export const AgentChatProvider: React.FC<{
  children: React.ReactNode;
  initialAgents?: AgentConfig[];
}> = ({ children, initialAgents }) => {
  const [agents, setAgents] = useState<AgentConfig[]>(initialAgents || DEFAULT_AGENTS);
  const [activeMentions, setActiveMentions] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todoPanelOpen, setTodoPanelOpen] = useState(false);
  const [typingAgent, setTypingAgent] = useState<string | null>(null);
  const [username, setUsername] = useState('user');
  const [maxHops, setMaxHops] = useState(4);

  const getAgentColor = useCallback(
    (name: string) => {
      const agent = agents.find((a) => a.name.toLowerCase() === name.toLowerCase() || a.id.toLowerCase() === name.toLowerCase());
      return agent?.color || '#a78bfa';
    },
    [agents]
  );

  const getAgent = useCallback(
    (name: string) => {
      return agents.find((a) => a.name.toLowerCase() === name.toLowerCase() || a.id.toLowerCase() === name.toLowerCase());
    },
    [agents]
  );

  const toggleMention = useCallback((agentId: string) => {
    setActiveMentions((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  }, []);

  const clearMentions = useCallback(() => {
    setActiveMentions(new Set());
  }, []);

  const addTodo = useCallback((item: Omit<TodoItem, 'id' | 'createdAt'>) => {
    setTodos((prev) => [
      ...prev,
      {
        ...item,
        id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
      },
    ]);
  }, []);

  const toggleTodo = useCallback((id: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, status: t.status === 'todo' ? 'done' : 'todo' } : t)));
  }, []);

  const removeTodo = useCallback((id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      agents,
      setAgents,
      getAgentColor,
      getAgent,
      activeMentions,
      toggleMention,
      clearMentions,
      replyTo,
      setReplyTo,
      todos,
      addTodo,
      toggleTodo,
      removeTodo,
      todoPanelOpen,
      setTodoPanelOpen,
      typingAgent,
      setTypingAgent,
      username,
      setUsername,
      maxHops,
      setMaxHops,
    }),
    [agents, getAgentColor, getAgent, activeMentions, toggleMention, clearMentions, replyTo, todos, addTodo, toggleTodo, removeTodo, todoPanelOpen, typingAgent, username, maxHops]
  );

  return <AgentChatCtx.Provider value={value}>{children}</AgentChatCtx.Provider>;
};

export const useAgentChat = (): AgentChatContextValue => {
  const ctx = useContext(AgentChatCtx);
  if (!ctx) throw new Error('useAgentChat must be used within AgentChatProvider');
  return ctx;
};
