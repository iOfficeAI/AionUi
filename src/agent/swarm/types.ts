/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HookContext, HookResult, QueueMessage } from '@/assistant/hooks/types';

/**
 * Turn-taking strategy for swarm agents
 */
export type TurnStrategy = 'round-robin' | 'on-demand';

/**
 * Swarm configuration from assistant.json → swarm field
 */
export type SwarmConfig = {
  feedPath: string;
  agents: string[];
  maxTurns: number;
  turnStrategy: TurnStrategy;
};

/**
 * Per-agent configuration from swarm/[role]/agent.json
 */
export type SwarmAgentConfig = {
  role: string;
  name: string;
  avatar: string;
  description: string;
  presetAgentType?: string;
  nameI18n?: Record<string, string>;
  defaultEnabledSkills?: string[];
};

/**
 * Feed entry stored in .swarm/feed.jsonl
 */
export type SwarmFeedEntry = {
  id: string;
  seq: number;
  from: string;
  to: string;
  type: 'message' | 'action' | 'review' | 'directive' | 'plan' | 'task' | 'blocker' | 'status' | 'done';
  content: string;
  files?: string[];
  backend?: string;
  /** Delivery status: tracks whether this entry has been consumed */
  status?: 'pending' | 'delivered' | 'processed';
  ts: string;
};

/**
 * Per-agent message queue entry stored in .swarm/{role}-mq.jsonl
 */
export type SwarmMqEntry = {
  id: string;
  seq: number;
  role: string;
  status: 'pending' | 'delivered' | 'processed' | 'error';
  content: string;
  source: string;
  priority: string;
  files?: string[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Agent identity metadata for multi-agent (swarm) conversations
 */
export type SwarmAgentMeta = {
  role: string;
  name: string;
  avatar: string;
};

/**
 * Swarm-specific context passed to swarm hook events
 */
export type SwarmHookContext = {
  role: string;
  name: string;
  agentBackend: string;
  peers: string[];
  turnNumber: number;
  maxTurns: number;
  turnStrategy: TurnStrategy;
  feed: {
    append: (entry: { to: string; type: string; content: string; files?: string[] }) => SwarmFeedEntry;
    readNew: () => SwarmFeedEntry[];
    readAll: () => SwarmFeedEntry[];
    isDone: () => boolean;
  };
  /** Enqueue a message into this agent's persistent message queue */
  enqueue: (message: QueueMessage) => void;
};

/**
 * Full context passed to swarm hook handlers
 */
export type SwarmFullHookContext = HookContext & {
  swarm: SwarmHookContext;
  feedEntries?: SwarmFeedEntry[];
  agentOutput?: string;
};

/**
 * Extended hook result for swarm events
 */
export type SwarmHookResult = HookResult & {
  feedEntries?: Array<{ to: string; type: string; content: string; files?: string[] }>;
  queueMessages?: QueueMessage[];
  done?: boolean;
  nextAgent?: string;
};
