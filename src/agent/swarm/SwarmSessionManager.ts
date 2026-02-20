/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { SwarmFeedManager } from './SwarmFeedManager';
import { SwarmMessageQueue } from './SwarmMessageQueue';
import { SwarmTurnController } from './SwarmTurnController';
import { runSwarmHooks } from './SwarmHookRunner';
import type { SwarmConfig, SwarmAgentConfig, SwarmFeedEntry } from './types';
import type AcpAgentManager from '@/process/task/AcpAgentManager';
import { ConversationService } from '@/process/services/conversationService';
import WorkerManage from '@/process/WorkerManage';
import { ipcBridge } from '@/common';
import { transformMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import { uuid } from '@/common/utils';
import { addOrUpdateMessage } from '@/process/message';
import { getDatabase } from '@/process/database/export';

type SwarmAgentHandle = {
  role: string;
  config: SwarmAgentConfig;
  backend: string;
  conversationId: string;
  manager: AcpAgentManager;
  mq: SwarmMessageQueue;
  hooksPath: string;
  systemPromptPath: string;
};

/** Per-agent buffer that accumulates text content during a turn for the group chat */
type AgentTurnBuffer = {
  content: string;
  msgId: string;
};

/**
 * Read a JSON file and parse it.
 */
function readJson<T = any>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Read the system prompt .md file for an agent role.
 * Supports i18n: {role}.{locale}.md → {role}.md fallback.
 */
function readPromptMd(agentDir: string, role: string): string {
  const locale = process.env.LANG?.split('.')[0]?.replace('_', '-') || 'en-US';
  const localePath = path.join(agentDir, `${role}.${locale}.md`);
  if (fs.existsSync(localePath)) {
    const content = fs.readFileSync(localePath, 'utf-8');
    console.log(`[readPromptMd] Reading from locale path: ${localePath}`);
    console.log(`[readPromptMd] First 300 chars: ${content.substring(0, 300)}`);
    return content;
  }
  const defaultPath = path.join(agentDir, `${role}.md`);
  if (fs.existsSync(defaultPath)) {
    const content = fs.readFileSync(defaultPath, 'utf-8');
    console.log(`[readPromptMd] Reading from default path: ${defaultPath}`);
    console.log(`[readPromptMd] First 300 chars: ${content.substring(0, 300)}`);
    return content;
  }
  console.log(`[readPromptMd] No prompt file found for ${role} in ${agentDir}`);
  return '';
}

/**
 * Thin orchestrator that spawns each swarm agent as a regular AionUi conversation
 * via the existing ConversationService → createAcpAgent → AcpAgentManager pipeline.
 *
 * The parent conversation is a "group chat" — agent text responses are forwarded
 * to it with agentMeta so the UI shows a unified multi-agent conversation.
 *
 * Source of truth: all state lives in .swarm/ files
 *   .swarm/feed.jsonl       — shared message bus between agents
 *   .swarm/{role}-mq.jsonl  — per-agent message queue with status tracking
 */
export class SwarmSessionManager {
  private feedManager: SwarmFeedManager;
  private turnController: SwarmTurnController;
  private agents: Map<string, SwarmAgentHandle> = new Map();
  private config: SwarmConfig;
  private parentConversationId: string;
  private defaultBackend: string;
  private workspace: string;
  private assistantId: string;
  private assistantDir: string;
  private running: boolean = false;
  private initialized = false;
  /** Per-agent buffers that accumulate text during a turn for consolidated group messages */
  private turnBuffers: Map<string, AgentTurnBuffer> = new Map();

  constructor(config: SwarmConfig, parentConversationId: string, workspace: string, defaultBackend: string, assistantId: string, assistantDir: string) {
    this.config = config;
    this.parentConversationId = parentConversationId;
    this.workspace = workspace;
    this.defaultBackend = defaultBackend;
    this.assistantId = assistantId;
    this.assistantDir = assistantDir;
    this.feedManager = new SwarmFeedManager(workspace, config.feedPath);
    this.turnController = new SwarmTurnController(config.turnStrategy, config.agents, config.maxTurns);
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Initialize: spawn each agent as a child conversation linked to the parent group.
   * Each agent loads its own agent.json (like assistant.json) with hooks support.
   */
  async init(userMessage: string): Promise<void> {
    if (this.initialized) {
      console.warn('[SwarmSessionManager] Already initialized, skipping');
      return;
    }

    this.feedManager.init();
    this.running = true;

    for (const agentName of this.config.agents) {
      const agentDir = path.join(this.assistantDir, 'swarm', agentName);
      const agentConfig: SwarmAgentConfig = readJson(path.join(agentDir, 'agent.json'));
      const resolvedBackend = agentConfig.presetAgentType || this.defaultBackend;
      const systemPrompt = readPromptMd(agentDir, agentConfig.role);

      // Detailed logging to verify prompt content
      console.log(`[SwarmSessionManager] ===== LOADING SYSTEM PROMPT FOR ${agentConfig.role} =====`);
      console.log(`[SwarmSessionManager] Prompt file path: ${path.join(agentDir, agentConfig.role + '.md')}`);
      console.log(`[SwarmSessionManager] Total length: ${systemPrompt.length} characters`);
      console.log(`[SwarmSessionManager] First 300 chars: ${systemPrompt.substring(0, 300)}`);

      // Verify critical sections exist
      const hasCriticalRequirement = systemPrompt.includes('CRITICAL REQUIREMENT');
      const hasDirectiveTag = systemPrompt.includes('<directive>');
      const hasPlanTag = systemPrompt.includes('<plan>');
      const hasReportTag = systemPrompt.includes('<report>');

      console.log(`[SwarmSessionManager] Validation:`);
      console.log(`[SwarmSessionManager]   - Has CRITICAL REQUIREMENT section: ${hasCriticalRequirement}`);
      console.log(`[SwarmSessionManager]   - Has <directive> tag docs: ${hasDirectiveTag}`);
      console.log(`[SwarmSessionManager]   - Has <plan> tag docs: ${hasPlanTag}`);
      console.log(`[SwarmSessionManager]   - Has <report> tag docs: ${hasReportTag}`);

      if (!hasCriticalRequirement) {
        console.error(`[SwarmSessionManager] ⚠️  WARNING: Missing CRITICAL REQUIREMENT section for ${agentConfig.role}!`);
      }
      console.log(`[SwarmSessionManager] ===== END SYSTEM PROMPT VALIDATION =====\n`);

      const hooksPath = path.join(agentDir, 'hooks');

      // Resolve hooks path — only set if the hooks directory exists
      const resolvedHooksPath = fs.existsSync(hooksPath) ? hooksPath : undefined;

      // Create persistent message queue for this agent
      const mq = new SwarmMessageQueue(this.workspace, agentConfig.role);
      mq.init();

      // Reuse existing pipeline: spawn as a regular conversation with parentId
      // NOTE: Do NOT pass presetAssistantId here because that would cause
      // ConversationService to detect this as a swarm and create another swarm instead of ACP.
      // Instead, we use presetContext to provide the agent's system prompt.
      const result = await ConversationService.createConversation({
        type: 'acp',
        model: {
          id: resolvedBackend,
          platform: resolvedBackend,
          name: resolvedBackend,
          baseUrl: '',
          apiKey: '',
          useModel: '',
        },
        extra: {
          workspace: this.workspace,
          backend: resolvedBackend as any,
          presetContext: systemPrompt,
          enabledSkills: agentConfig.defaultEnabledSkills || [],
          agentName: agentConfig.name,
        },
        name: `${this.assistantId}/${agentConfig.role}`,
        source: 'aionui' as any,
      });

      if (!result.success || !result.conversation) {
        throw new Error(`Failed to spawn swarm agent "${agentConfig.role}": ${result.error}`);
      }

      console.log(`[SwarmSessionManager] Created agent conversation ${result.conversation.id} for role ${agentConfig.role}`);

      // Set parentId and assistantHooksPath on the child conversation
      const childConv = result.conversation;
      childConv.parentId = this.parentConversationId;

      // Persist the parentId and hooksPath to the database
      try {
        const db = getDatabase();
        db.updateConversation(childConv.id, {
          parentId: this.parentConversationId,
          extra: {
            ...childConv.extra,
            assistantHooksPath: resolvedHooksPath,
          },
        } as any);
      } catch (err) {
        console.warn(`[SwarmSessionManager] Failed to update child conversation:`, err);
      }

      const manager = WorkerManage.getTaskById(result.conversation.id) as AcpAgentManager;
      console.log(`[SwarmSessionManager] Got manager for ${agentConfig.role}:`, !!manager);

      if (!manager) {
        throw new Error(`Failed to get task manager for swarm agent "${agentConfig.role}" (conversation ${result.conversation.id})`);
      }

      // Set up response forwarding: when an agent emits text content,
      // forward it to the parent group conversation with agentMeta
      this.setupAgentResponseForwarding(manager, agentConfig);

      // Wire finish signal to trigger swarm turn handoff
      manager.onFinish((output: string) => {
        void this.onAgentFinished(agentConfig.role, output);
      });

      this.agents.set(agentConfig.role, {
        role: agentConfig.role,
        config: agentConfig,
        backend: resolvedBackend,
        conversationId: result.conversation.id,
        manager,
        mq,
        hooksPath: resolvedHooksPath || hooksPath,
        systemPromptPath: path.join(agentDir, `${agentConfig.role}.md`),
      });
    }

    // Fire onSwarmInit for each agent → hook returns queueMessages → persist to MQ → deliver
    for (const [role, handle] of this.agents) {
      const result = await runSwarmHooks('onSwarmInit', {
        role,
        agentConfig: handle.config,
        feedManager: this.feedManager,
        turnNumber: 0,
        maxTurns: this.config.maxTurns,
        turnStrategy: this.config.turnStrategy,
        peers: this.getPeers(role),
        workspace: this.workspace,
        assistantHooksPath: handle.hooksPath,
        content: userMessage,
      });

      if (result.queueMessages?.length) {
        for (const msg of result.queueMessages) {
          this.enqueueAndDeliver(handle, msg);
        }
      }
    }

    // Start the first agent's turn
    const firstRole = this.turnController.next();
    await this.startTurn(firstRole);

    this.initialized = true;
    console.log(`[SwarmSessionManager] Swarm initialized for ${this.parentConversationId}`);
  }

  /**
   * Set up forwarding of agent text responses to the parent group conversation.
   * Accumulates streaming text during a turn and only flushes to the group chat
   * when the agent finishes — producing one clean message per turn, not noisy
   * streaming chunks. Internal reasoning, tool calls, etc. are excluded.
   */
  private setupAgentResponseForwarding(manager: AcpAgentManager, agentConfig: SwarmAgentConfig): void {
    const role = agentConfig.role;

    // Accumulate streaming text content during the agent's turn
    manager.onStream((message: any) => {
      if (message.type === 'content' && typeof message.data === 'string' && message.data.length > 0) {
        const existing = this.turnBuffers.get(role);
        if (existing) {
          existing.content += message.data;
        } else {
          this.turnBuffers.set(role, {
            content: message.data,
            msgId: message.msg_id || uuid(),
          });
        }
      }
    });
  }

  /**
   * Flush accumulated turn content to the group chat as a single consolidated message.
   * Called when an agent finishes its turn.
   */
  private flushTurnToGroup(role: string, agentConfig: SwarmAgentConfig): void {
    const buffer = this.turnBuffers.get(role);
    if (!buffer || !buffer.content.trim()) {
      this.turnBuffers.delete(role);
      return;
    }

    const agentMeta = {
      role: agentConfig.role,
      name: agentConfig.name,
      avatar: agentConfig.avatar,
    };
    const parentId = this.parentConversationId;
    const msgId = uuid();

    const groupMessage: IResponseMessage = {
      conversation_id: parentId,
      type: 'content',
      data: buffer.content,
      msg_id: msgId,
      timestamp: Date.now(),
      agentMeta,
    };

    // Save consolidated message to group conversation DB
    const tMessage = transformMessage(groupMessage);
    if (tMessage) {
      addOrUpdateMessage(parentId, tMessage);
    }

    // Emit to the response stream so the UI renders it
    ipcBridge.conversation.responseStream.emit(groupMessage);

    // Clear the buffer for next turn
    this.turnBuffers.delete(role);
  }

  /** Called when an agent finishes its turn */
  async onAgentFinished(role: string, output: string): Promise<void> {
    if (!this.running) return;

    const handle = this.agents.get(role)!;

    // Flush accumulated text to the group chat as a single consolidated message
    this.flushTurnToGroup(role, handle.config);

    // Mark all delivered MQ entries as processed for this agent
    for (const entry of handle.mq.getRecoverable()) {
      handle.mq.markProcessed(entry.id);
    }

    // 1. Fire onSwarmTurnEnd — hook parses output, writes to feed
    const turnEndResult = await runSwarmHooks('onSwarmTurnEnd', {
      role,
      agentConfig: handle.config,
      feedManager: this.feedManager,
      turnNumber: this.turnController.getTurnCount(),
      maxTurns: this.config.maxTurns,
      turnStrategy: this.config.turnStrategy,
      peers: this.getPeers(role),
      workspace: this.workspace,
      assistantHooksPath: handle.hooksPath,
      agentOutput: output,
    });

    // 2. Check termination
    if (turnEndResult.done || this.feedManager.isDone() || this.turnController.isExhausted()) {
      this.terminate();
      return;
    }

    // 3. Determine next agent
    const nextRole = turnEndResult.nextAgent || this.turnController.next();
    const nextHandle = this.agents.get(nextRole)!;

    // 4. Read new feed entries for the next agent, mark as delivered
    const newEntries = this.feedManager.readNewFor(nextRole);
    this.feedManager.markDelivered(newEntries);

    // 5. Fire onSwarmFeedMessage for the next agent
    const feedResult = await runSwarmHooks('onSwarmFeedMessage', {
      role: nextRole,
      agentConfig: nextHandle.config,
      feedManager: this.feedManager,
      turnNumber: this.turnController.getTurnCount(),
      maxTurns: this.config.maxTurns,
      turnStrategy: this.config.turnStrategy,
      peers: this.getPeers(nextRole),
      workspace: this.workspace,
      assistantHooksPath: nextHandle.hooksPath,
      feedEntries: newEntries,
    });

    // 6. Persist to MQ then deliver (tag messages with the sending agent's role)
    if (feedResult.queueMessages?.length) {
      for (const msg of feedResult.queueMessages) {
        this.enqueueAndDeliver(nextHandle, { ...msg, fromRole: role });
      }
    }

    await this.startTurn(nextRole);
  }

  /**
   * Persist a message to the agent's MQ file, then deliver to the agent process.
   * MQ file is the source of truth — if delivery fails, the message stays pending.
   * Also emits a visual directive separator in the agent's individual conversation.
   */
  private enqueueAndDeliver(handle: SwarmAgentHandle, msg: { content: string; files?: string[]; fromRole?: string }): void {
    const entry = handle.mq.enqueue({
      content: msg.content,
      source: 'hook',
      files: msg.files,
    });

    // Emit a directive separator in the agent's individual conversation
    // so the user can see when a new instruction arrived from a peer agent
    const fromRole = msg.fromRole || 'system';
    const fromAgent = this.agents.get(fromRole);
    const directiveMessage: IResponseMessage = {
      conversation_id: handle.conversationId,
      type: 'swarm_directive',
      data: {
        from: fromRole,
        fromName: fromAgent?.config.name || fromRole,
        fromAvatar: fromAgent?.config.avatar || '📋',
        summary: msg.content.length > 200 ? msg.content.substring(0, 200) + '...' : msg.content,
      },
      msg_id: uuid(),
      timestamp: Date.now(),
    };
    ipcBridge.conversation.responseStream.emit(directiveMessage);

    // Also save the directive to the agent's message DB for persistence
    const tDirective = transformMessage(directiveMessage);
    if (tDirective) {
      addOrUpdateMessage(handle.conversationId, tDirective);
    }

    try {
      void handle.manager.sendMessage({ content: msg.content, files: msg.files });
      handle.mq.markDelivered(entry.id);
    } catch (err) {
      console.error(`[SwarmSessionManager] Failed to deliver message to ${handle.role}:`, err);
      handle.mq.markError(entry.id);
    }
  }

  /** Route a feed entry to the target agent's message queue */
  routeToAgent(entry: SwarmFeedEntry): void {
    const handle = this.agents.get(entry.to);
    if (handle) {
      this.enqueueAndDeliver(handle, { content: entry.content, files: entry.files });
      this.feedManager.markProcessed(entry.id);
    }
  }

  private async startTurn(role: string): Promise<void> {
    const handle = this.agents.get(role)!;

    await runSwarmHooks('onSwarmTurnStart', {
      role,
      agentConfig: handle.config,
      feedManager: this.feedManager,
      turnNumber: this.turnController.getTurnCount(),
      maxTurns: this.config.maxTurns,
      turnStrategy: this.config.turnStrategy,
      peers: this.getPeers(role),
      workspace: this.workspace,
      assistantHooksPath: handle.hooksPath,
    });
  }

  private getPeers(role: string): string[] {
    return [...this.agents.keys()].filter((r) => r !== role);
  }

  /** Pause all agents */
  pause(): void {
    this.running = false;
  }

  /** Resume all agents */
  resume(): void {
    this.running = true;
  }

  /** Terminate the swarm session */
  terminate(): void {
    this.running = false;
    for (const handle of this.agents.values()) {
      handle.manager.kill();
    }
    console.log(`[SwarmSessionManager] Swarm terminated for parent conversation ${this.parentConversationId}`);
  }

  /** Check if the task is complete */
  isDone(): boolean {
    return this.feedManager.isDone() || this.turnController.isExhausted();
  }

  /** Get the parent conversation ID */
  getParentConversationId(): string {
    return this.parentConversationId;
  }

  /** Get agent handles (for UI integration) */
  getAgents(): Map<string, SwarmAgentHandle> {
    return this.agents;
  }

  /** Get agent configs for UI rendering */
  getAgentConfigs(): Array<{ role: string; name: string; avatar: string; conversationId: string }> {
    return Array.from(this.agents.values()).map((handle) => ({
      role: handle.role,
      name: handle.config.name,
      avatar: handle.config.avatar,
      conversationId: handle.conversationId,
    }));
  }
}
