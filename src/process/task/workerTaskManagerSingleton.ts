/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Singleton WorkerTaskManager wired with all registered agent creators.
 * Extracted to a separate module to avoid circular dependencies with initBridge.ts.
 */

import { AgentFactory } from './AgentFactory';
import { WorkerTaskManager } from './WorkerTaskManager';
import { SqliteConversationRepository } from '@process/services/database/SqliteConversationRepository';
import { GeminiAgentManager } from './GeminiAgentManager';
import AcpAgentManager from './AcpAgentManager';
import { CodexAgentManager } from '@process/agent/codex';
import OpenClawAgentManager from './OpenClawAgentManager';
import NanoBotAgentManager from './NanoBotAgentManager';

const agentFactory = new AgentFactory();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
agentFactory.register('gemini', (conv, opts) => {
  const c = conv as any;
  return new GeminiAgentManager(
    { ...c.extra, conversation_id: c.id, yoloMode: opts?.yoloMode },
    c.model
  ) as unknown as ReturnType<typeof agentFactory.create>;
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
agentFactory.register('acp', (conv, opts) => {
  const c = conv as any;
  return new AcpAgentManager({
    ...c.extra,
    conversation_id: c.id,
    yoloMode: opts?.yoloMode,
  }) as unknown as ReturnType<typeof agentFactory.create>;
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
agentFactory.register('codex', (conv, opts) => {
  const c = conv as any;
  return new CodexAgentManager({
    ...c.extra,
    conversation_id: c.id,
    yoloMode: opts?.yoloMode,
    sessionMode: c.extra.sessionMode,
  }) as unknown as ReturnType<typeof agentFactory.create>;
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
agentFactory.register('openclaw-gateway', (conv, opts) => {
  const c = conv as any;
  return new OpenClawAgentManager({
    ...c.extra,
    conversation_id: c.id,
    yoloMode: opts?.yoloMode,
  }) as unknown as ReturnType<typeof agentFactory.create>;
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
agentFactory.register('nanobot', (conv, opts) => {
  const c = conv as any;
  return new NanoBotAgentManager({
    ...c.extra,
    conversation_id: c.id,
    yoloMode: opts?.yoloMode,
  }) as unknown as ReturnType<typeof agentFactory.create>;
});

const conversationRepo = new SqliteConversationRepository();
export const workerTaskManager = new WorkerTaskManager(agentFactory, conversationRepo);
