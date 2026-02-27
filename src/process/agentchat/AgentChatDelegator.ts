/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type AcpAgentManager from '@/process/task/AcpAgentManager';
import type { IResponseMessage } from '@/common/ipcBridge';
import { transformMessage } from '@/common/chatLib';
import { uuid } from '@/common/utils';
import { ipcBridge } from '@/common';
import { ConversationService } from '@/process/services/conversationService';
import WorkerManage from '@/process/WorkerManage';
import { addOrUpdateMessage } from '@/process/message';

/**
 * A child agent conversation created by the delegator
 */
type ChildAgent = {
  conversationId: string;
  backend: string;
  displayName: string;
  manager: AcpAgentManager;
};

/**
 * Per-agent buffer that accumulates text content during a response
 * for consolidated DB persistence on finish.
 */
type ResponseBuffer = {
  content: string;
  msgId: string;
};

/** Module-level registry of delegators keyed by parent conversation ID */
const delegatorRegistry = new Map<string, AgentChatDelegator>();

/**
 * AgentChatDelegator manages @mention-based message routing in agentchat conversations.
 *
 * Only agents registered in the swarm/conversation are valid @mention targets.
 * Mentions of unknown agents are silently ignored (treated as plain text).
 *
 * When a user @mentions a valid agent, the delegator:
 * 1. Lazily creates a child ACP conversation for the mentioned backend
 * 2. Forwards the message to the child agent
 * 3. Streams the child's response back to the parent conversation with agentMeta
 */
export class AgentChatDelegator {
  private parentConversationId: string;
  private workspace: string;
  private defaultBackend: string;
  /** Only these agent names are valid @mention targets */
  private allowedAgents: Set<string>;
  private children: Map<string, ChildAgent> = new Map();
  private responseBuffers: Map<string, ResponseBuffer> = new Map();

  private constructor(parentConversationId: string, workspace: string, defaultBackend: string, allowedAgents: string[]) {
    this.parentConversationId = parentConversationId;
    this.workspace = workspace;
    this.defaultBackend = defaultBackend;
    // Always include the default backend as allowed
    this.allowedAgents = new Set([...allowedAgents.map((a) => a.toLowerCase()), defaultBackend.toLowerCase()]);
  }

  /**
   * Get or create a delegator for a parent conversation.
   *
   * @param allowedAgents - Only these agent names can be @mentioned.
   *   Typically comes from the swarm config or conversation agent list.
   */
  static getOrCreate(parentConversationId: string, workspace: string, defaultBackend: string, allowedAgents: string[]): AgentChatDelegator {
    let delegator = delegatorRegistry.get(parentConversationId);
    if (!delegator) {
      delegator = new AgentChatDelegator(parentConversationId, workspace, defaultBackend, allowedAgents);
      delegatorRegistry.set(parentConversationId, delegator);
    }
    return delegator;
  }

  /**
   * Remove a delegator and clean up child conversations.
   */
  static remove(parentConversationId: string): void {
    const delegator = delegatorRegistry.get(parentConversationId);
    if (delegator) {
      for (const child of delegator.children.values()) {
        child.manager.kill();
      }
      delegatorRegistry.delete(parentConversationId);
    }
  }

  /**
   * Check if a delegator exists for a conversation.
   */
  static has(parentConversationId: string): boolean {
    return delegatorRegistry.has(parentConversationId);
  }

  /**
   * Parse @mentions from a message text, filtered to only allowed agents.
   * Returns the list of valid mentioned agent names and the cleaned text.
   */
  parseMentions(text: string): { mentions: string[]; cleanText: string } {
    const allMentions: string[] = [];
    const mentionRegex = /@(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(text)) !== null) {
      const name = match[1].toLowerCase();
      // Only accept agents that are in the allowed set
      if (this.allowedAgents.has(name)) {
        allMentions.push(name);
      }
    }
    const cleanText = text.replace(/@\w+/g, '').trim();
    return { mentions: allMentions, cleanText };
  }

  /**
   * Static helper: parse @mentions from text, filtered against an allow list.
   * Used by the conversation bridge for swarm routing without a delegator instance.
   */
  static parseMentionsWithAllowList(text: string, allowedAgents: string[]): { mentions: string[]; cleanText: string } {
    const allowSet = new Set(allowedAgents.map((a) => a.toLowerCase()));
    const mentions: string[] = [];
    const mentionRegex = /@(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(text)) !== null) {
      const name = match[1].toLowerCase();
      if (allowSet.has(name)) {
        mentions.push(name);
      }
    }
    const cleanText = text.replace(/@\w+/g, '').trim();
    return { mentions: [...new Set(mentions)], cleanText };
  }

  /**
   * Delegate a user message to mentioned agents.
   *
   * Returns true if the message was delegated (i.e., at least one non-default agent
   * in the allowed set was mentioned). Returns false if no valid delegation happened,
   * meaning the caller should use the regular send flow.
   */
  async delegateMessage(input: string, msgId: string): Promise<boolean> {
    const { mentions, cleanText } = this.parseMentions(input);

    if (mentions.length === 0) {
      return false;
    }

    // Separate mentions into default and non-default backends
    const defaultMentions = mentions.filter((m) => m === this.defaultBackend);
    const delegatedMentions = [...new Set(mentions.filter((m) => m !== this.defaultBackend))];

    // If ALL mentions are for the default backend, let the regular flow handle it
    if (delegatedMentions.length === 0) {
      return false;
    }

    // Save user message to parent conversation and emit to UI
    const userMsg: IResponseMessage = {
      conversation_id: this.parentConversationId,
      type: 'user_content',
      data: input,
      msg_id: msgId,
      timestamp: Date.now(),
    };
    const tUserMsg = transformMessage(userMsg);
    if (tUserMsg) {
      addOrUpdateMessage(this.parentConversationId, tUserMsg);
    }
    ipcBridge.conversation.responseStream.emit(userMsg);

    // Also send to the default backend if it was mentioned
    if (defaultMentions.length > 0) {
      this.sendToDefault(cleanText, msgId);
    }

    // Delegate to each non-default mentioned agent
    for (const mention of delegatedMentions) {
      await this.sendToAgent(mention, cleanText, uuid());
    }

    return true;
  }

  /**
   * Send message to the default backend agent (the parent conversation's agent).
   */
  private sendToDefault(text: string, msgId: string): void {
    const task = WorkerManage.getTaskById(this.parentConversationId);
    if (task && 'sendMessage' in task) {
      void (task as AcpAgentManager).sendMessage({ content: text, msg_id: msgId });
    }
  }

  /**
   * Send a message to a specific agent by name.
   * Creates the child conversation lazily if it doesn't exist yet.
   */
  private async sendToAgent(agentName: string, text: string, msgId: string): Promise<void> {
    const child = await this.getOrCreateChild(agentName);
    if (!child) {
      console.warn(`[AgentChatDelegator] Failed to create child for agent "${agentName}"`);
      ipcBridge.conversation.responseStream.emit({
        conversation_id: this.parentConversationId,
        type: 'error',
        data: `Failed to start agent "${agentName}". Make sure it is installed and available.`,
        msg_id: uuid(),
        timestamp: Date.now(),
      });
      return;
    }

    // Emit start event for typing indicator
    ipcBridge.conversation.responseStream.emit({
      conversation_id: this.parentConversationId,
      type: 'start',
      data: '',
      msg_id: msgId,
      timestamp: Date.now(),
      agentMeta: {
        role: agentName,
        name: child.displayName,
        avatar: '',
      },
    });

    try {
      await child.manager.sendMessage({ content: text, msg_id: msgId });
    } catch (err) {
      console.error(`[AgentChatDelegator] Failed to send to "${agentName}":`, err);
    }
  }

  /**
   * Get or create a child agent conversation for a given backend.
   */
  private async getOrCreateChild(agentName: string): Promise<ChildAgent | null> {
    const existing = this.children.get(agentName);
    if (existing) return existing;

    const displayName = agentName.charAt(0).toUpperCase() + agentName.slice(1);

    try {
      const result = await ConversationService.createConversation({
        type: 'acp',
        model: {
          id: agentName,
          platform: agentName,
          name: agentName,
          baseUrl: '',
          apiKey: '',
          useModel: '',
        },
        extra: {
          workspace: this.workspace,
          backend: agentName as any,
          agentName: displayName,
        },
        name: `agentchat/${agentName}`,
        source: 'aionui' as any,
      });

      if (!result.success || !result.conversation) {
        console.error(`[AgentChatDelegator] Failed to create conversation for "${agentName}":`, result.error);
        return null;
      }

      const manager = WorkerManage.getTaskById(result.conversation.id) as AcpAgentManager;
      if (!manager) {
        console.error(`[AgentChatDelegator] No task manager found for "${agentName}" (${result.conversation.id})`);
        return null;
      }

      // Set up response forwarding from child to parent
      this.setupResponseForwarding(manager, agentName, displayName);

      const child: ChildAgent = {
        conversationId: result.conversation.id,
        backend: agentName,
        displayName,
        manager,
      };
      this.children.set(agentName, child);

      console.log(`[AgentChatDelegator] Created child conversation ${result.conversation.id} for "${agentName}"`);
      return child;
    } catch (err) {
      console.error(`[AgentChatDelegator] Error creating child for "${agentName}":`, err);
      return null;
    }
  }

  /**
   * Wire up response forwarding from a child agent to the parent conversation.
   *
   * Content events are forwarded in real-time for streaming UX.
   * On finish, the accumulated content is persisted to the parent conversation DB.
   */
  private setupResponseForwarding(manager: AcpAgentManager, agentName: string, displayName: string): void {
    const agentMeta = {
      role: agentName,
      name: displayName,
      avatar: '',
    };

    // Forward content events for real-time streaming in the UI
    manager.onStream((message: IResponseMessage) => {
      if (message.type === 'content' && typeof message.data === 'string' && message.data.length > 0) {
        // Accumulate for DB persistence
        const existing = this.responseBuffers.get(agentName);
        if (existing) {
          existing.content += message.data;
        } else {
          this.responseBuffers.set(agentName, {
            content: message.data,
            msgId: message.msg_id || uuid(),
          });
        }

        // Forward to parent for real-time streaming
        ipcBridge.conversation.responseStream.emit({
          ...message,
          conversation_id: this.parentConversationId,
          agentMeta,
        });
      } else if (message.type === 'thought') {
        // Forward thought events for typing indicator
        ipcBridge.conversation.responseStream.emit({
          ...message,
          conversation_id: this.parentConversationId,
          agentMeta,
        });
      }
    });

    // On finish, persist the accumulated content to the parent conversation DB
    manager.onFinish((_output: string) => {
      const buffer = this.responseBuffers.get(agentName);
      if (buffer && buffer.content.trim()) {
        // Save consolidated message to parent conversation DB
        const groupMessage: IResponseMessage = {
          conversation_id: this.parentConversationId,
          type: 'content',
          data: buffer.content,
          msg_id: buffer.msgId,
          timestamp: Date.now(),
          agentMeta,
        };
        const tMessage = transformMessage(groupMessage);
        if (tMessage) {
          addOrUpdateMessage(this.parentConversationId, tMessage);
        }
      }
      this.responseBuffers.delete(agentName);

      // Emit finish event to the parent
      ipcBridge.conversation.responseStream.emit({
        conversation_id: this.parentConversationId,
        type: 'finish',
        data: '',
        msg_id: uuid(),
        timestamp: Date.now(),
        agentMeta,
      });
    });
  }

  /**
   * Get all child agent names and their conversation IDs.
   */
  getChildren(): Array<{ agentName: string; conversationId: string }> {
    return Array.from(this.children.entries()).map(([name, child]) => ({
      agentName: name,
      conversationId: child.conversationId,
    }));
  }

  /**
   * Get the set of allowed agent names.
   */
  getAllowedAgents(): string[] {
    return [...this.allowedAgents];
  }
}
