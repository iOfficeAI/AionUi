// src/process/acp/session/MessageTranslator.ts
import type {
  IMessageAcpToolCall,
  IMessageAvailableCommands,
  IMessagePlan,
  IMessageText,
  IMessageThinking,
  TMessage,
} from '@/common/chat/chatLib';
import type { ToolCallContentItem, ToolCallLocationItem } from '@/common/types/acpTypes';
import type {
  ContentChunk,
  SessionNotification,
  SessionUpdate,
  ToolCall,
  ToolCallContent,
  ToolCallLocation,
  ToolCallUpdate,
  ToolKind,
} from '@agentclientprotocol/sdk';

const CONFIG_UPDATES = new Set<SessionUpdate['sessionUpdate']>([
  'current_mode_update',
  'config_option_update',
  'session_info_update',
  'usage_update',
]);

// ─── SDK → Old type mappers ─────────────────────────────────────

const TOOL_KIND_MAP: Record<string, 'read' | 'edit' | 'execute'> = {
  read: 'read',
  search: 'read',
  edit: 'edit',
  delete: 'edit',
  move: 'edit',
  execute: 'execute',
  think: 'execute',
  fetch: 'execute',
  switch_mode: 'execute',
  other: 'execute',
};

export function mapToolKind(kind: ToolKind | null | undefined): 'read' | 'edit' | 'execute' {
  if (!kind) return 'execute';
  return TOOL_KIND_MAP[kind] ?? 'execute';
}

export function mapToolContent(content: ToolCallContent[] | null | undefined): ToolCallContentItem[] | undefined {
  if (!content || content.length === 0) return undefined;
  return content.map((item): ToolCallContentItem => {
    if (item.type === 'diff') {
      const diff = item as { type: 'diff'; path?: string; oldText?: string; newText?: string };
      return { type: 'diff', path: diff.path, oldText: diff.oldText, newText: diff.newText };
    }
    // 'content' and 'terminal' both map to 'content' type
    const contentItem = item as { type: string; content?: { type: string; text?: string } };
    return { type: 'content', content: contentItem.content as { type: 'text'; text: string } | undefined };
  });
}

export function mapToolLocations(locations: ToolCallLocation[] | null | undefined): ToolCallLocationItem[] | undefined {
  if (!locations || locations.length === 0) return undefined;
  return locations.map((loc): ToolCallLocationItem => ({ path: loc.path ?? '' }));
}

// ─── MessageTranslator ─────────────────────────────────────────

/**
 * Stateless translator: SDK SessionNotification → TMessage.
 * Only maintains messageMap to assign stable per-turn msg_ids
 * (so chunks within a turn merge, but different turns don't).
 * No merge logic — compat layer (AcpAgentV2) handles tool call merging.
 */
export class MessageTranslator {
  /** SDK messageId → generated UUID (scoped to current turn, cleared on onTurnEnd) */
  private messageMap = new Map<string, string>();

  constructor(private readonly conversationId: string) {}

  get activeEntryCount(): number {
    return this.messageMap.size;
  }

  translate(notification: SessionNotification): TMessage[] {
    const update = notification.update;
    const updateType = update.sessionUpdate;

    if (CONFIG_UPDATES.has(updateType)) return [];

    switch (updateType) {
      case 'agent_message_chunk':
        return this.handleAgentMessageChunk(update);
      case 'agent_thought_chunk':
        return this.handleThoughtChunk(update);
      case 'tool_call':
        return this.handleToolCall(update);
      case 'tool_call_update':
        return this.handleToolCallUpdate(update);
      case 'plan':
        return this.handlePlan(update);
      case 'available_commands_update':
        return []; // Handled by AcpSession.handleMessage → ConfigTracker
      case 'user_message_chunk':
        return [];
      default:
        return [];
    }
  }

  onTurnEnd(): void {
    this.messageMap.clear();
  }

  reset(): void {
    this.messageMap.clear();
  }

  /** Get or create a stable UUID for a SDK messageId within the current turn. */
  private resolveMsgId(sdkMessageId: string): string {
    let msgId = this.messageMap.get(sdkMessageId);
    if (!msgId) {
      msgId = crypto.randomUUID();
      this.messageMap.set(sdkMessageId, msgId);
    }
    return msgId;
  }

  private handleAgentMessageChunk(update: ContentChunk): IMessageText[] {
    const messageId = update.messageId ?? 'default';
    const text = update.content.type === 'text' ? update.content.text : '';
    if (!text) return [];

    const msgId = this.resolveMsgId(messageId);

    return [
      {
        id: msgId,
        msg_id: msgId,
        conversation_id: this.conversationId,
        type: 'text',
        content: { content: text },
        position: 'left',
        status: 'work',
      },
    ];
  }

  private handleThoughtChunk(update: ContentChunk): IMessageThinking[] {
    const messageId = `thought-${update.messageId ?? 'default'}`;
    const text = update.content.type === 'text' ? update.content.text : '';
    if (!text) return [];

    const msgId = this.resolveMsgId(messageId);

    return [
      {
        id: msgId,
        msg_id: msgId,
        conversation_id: this.conversationId,
        type: 'thinking',
        content: { content: text, status: 'thinking' },
        position: 'left',
        status: 'work',
      },
    ];
  }

  private handleToolCall(update: ToolCall): IMessageAcpToolCall[] {
    // Tool call interrupts the current text stream — clear text msg_id mappings
    // so subsequent text chunks start a new message (matching old AcpAdapter behavior).
    this.messageMap.clear();

    const toolCallId = update.toolCallId ?? crypto.randomUUID();

    return [
      {
        id: toolCallId,
        msg_id: toolCallId,
        conversation_id: this.conversationId,
        type: 'acp_tool_call',
        content: {
          sessionId: '',
          update: {
            sessionUpdate: 'tool_call',
            toolCallId,
            status: update.status ?? 'pending',
            title: update.title ?? 'unknown',
            kind: mapToolKind(update.kind),
            rawInput: update.rawInput as Record<string, unknown> | undefined,
            content: mapToolContent(update.content),
            locations: mapToolLocations(update.locations),
          },
        },
        position: 'left',
        status: 'work',
      },
    ];
  }

  private handleToolCallUpdate(update: ToolCallUpdate): IMessageAcpToolCall[] {
    const toolCallId = update.toolCallId ?? '';

    // NOTE: This outputs the raw translated update WITHOUT merging with the original tool_call.
    // Missing fields (title, kind) get fallback values ("unknown", "execute").
    //
    // Currently AcpAgentV2 (compat layer) merges updates before emitting to the renderer.
    // When AcpAgentV2 is removed, the renderer's composeMessageWithIndex should be updated
    // to do field-level merge for acp_tool_call (deep merge on content.update) instead of
    // the current shallow content spread. See hooks.ts acp_tool_call section.

    return [
      {
        id: toolCallId,
        msg_id: toolCallId,
        conversation_id: this.conversationId,
        type: 'acp_tool_call',
        content: {
          sessionId: '',
          update: {
            sessionUpdate: 'tool_call',
            toolCallId,
            status: update.status ?? 'completed',
            title: update.title ?? 'unknown',
            kind: mapToolKind(update.kind),
            rawInput: update.rawInput as Record<string, unknown> | undefined,
            content: mapToolContent(update.content),
          },
        },
        position: 'left',
        status: update.status === 'completed' || update.status === 'failed' ? 'finish' : 'work',
      },
    ];
  }

  private handlePlan(update: SessionUpdate): IMessagePlan[] {
    // Plan is a standalone UI block — clear text msg_id mappings
    // so surrounding text chunks don't merge across the plan.
    this.messageMap.clear();

    // SDK Plan type has entries at top level: { entries: PlanEntry[] }
    const plan = update as unknown as {
      entries?: Array<{ content: string; status: string; priority?: string }>;
    };
    if (!plan.entries || plan.entries.length === 0) return [];

    // Use stable per-turn ID so the renderer merges plan updates within a turn
    const planMsgId = this.resolveMsgId('plan');

    return [
      {
        id: planMsgId,
        msg_id: planMsgId,
        conversation_id: this.conversationId,
        type: 'plan',
        content: {
          sessionId: '',
          entries: plan.entries.map((e) => ({
            content: e.content,
            status: e.status as 'pending' | 'in_progress' | 'completed',
            priority: e.priority as 'low' | 'medium' | 'high' | undefined,
          })),
        },
        position: 'left',
        status: 'finish',
      },
    ];
  }

  private handleAvailableCommands(update: SessionUpdate): IMessageAvailableCommands[] {
    // SDK AvailableCommandsUpdate: { availableCommands: Array<{ name, description, input? }> }
    const data = update as unknown as {
      availableCommands?: Array<{ name: string; description: string; input?: { hint?: string } | null }>;
    };
    const commands = (data.availableCommands ?? []).map((cmd) => ({
      name: cmd.name,
      description: cmd.description,
      hint: cmd.input?.hint,
    }));

    return [
      {
        id: crypto.randomUUID(),
        msg_id: crypto.randomUUID(),
        conversation_id: this.conversationId,
        type: 'available_commands',
        content: { commands },
        position: 'left',
        status: 'finish',
      },
    ];
  }
}
