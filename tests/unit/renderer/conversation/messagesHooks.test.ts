/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import { __test__ } from '@/renderer/pages/conversation/Messages/hooks';
import { describe, expect, it } from 'vitest';

const { buildMessageIndex, composeMessageWithIndex, permissionCallId } = __test__;

function permission(callId: string, msgId: string, command: string): TMessage {
  return {
    id: `id-${callId}`,
    type: 'permission',
    msg_id: msgId,
    position: 'left',
    conversation_id: 'conv-1',
    created_at: Date.now(),
    content: {
      id: callId,
      call_id: callId,
      title: 'Run a command on your machine?',
      action: 'run_shell',
      description: command,
      command_type: command,
      options: [{ label: 'Allow once', value: 'once' }],
    },
  } as unknown as TMessage;
}

function acpPermission(toolCallId: string, msgId: string): TMessage {
  return {
    id: `id-${toolCallId}`,
    type: 'acp_permission',
    msg_id: msgId,
    position: 'left',
    conversation_id: 'conv-1',
    created_at: Date.now(),
    content: {
      session_id: 'session-1',
      tool_call: {
        tool_call_id: toolCallId,
        title: 'Tool',
        kind: 'execute',
      },
      options: [{ option_id: 'allow', name: 'Allow', kind: 'allow_once' }],
    },
  } as unknown as TMessage;
}

function text(msgId: string, content: string): TMessage {
  return {
    id: `text-${msgId}`,
    type: 'text',
    msg_id: msgId,
    position: 'left',
    conversation_id: 'conv-1',
    created_at: Date.now(),
    content: { content },
  } as unknown as TMessage;
}

describe('composeMessageWithIndex — permission keying', () => {
  it('keeps every permission with a unique call_id even when they share a msg_id', () => {
    // Reproduces the missing-4th-card bug: OpenCode emits multiple parallel
    // permission requests inside one assistant turn, all carrying the same
    // primary msg_id. Before the fix they collapsed into a single slot via
    // the msg_id catch-all; now they each get their own slot keyed by
    // call_id.
    const turnMsgId = 'turn-1';
    let list: TMessage[] = [];
    let index = buildMessageIndex(list);

    const four = ['shell-A', 'shell-B', 'shell-C', 'shell-D'].map((id, i) =>
      permission(id, turnMsgId, `command-${i}`)
    );

    for (const msg of four) {
      list = composeMessageWithIndex(msg, list, index);
      index = buildMessageIndex(list);
    }

    expect(list).toHaveLength(4);
    expect(list.map((m) => (m.content as { call_id?: string }).call_id)).toEqual([
      'shell-A',
      'shell-B',
      'shell-C',
      'shell-D',
    ]);
  });

  it('updates an existing permission card in place when the same call_id is re-emitted', () => {
    const turnMsgId = 'turn-1';
    let list: TMessage[] = [permission('shell-A', turnMsgId, 'original command')];
    const index = buildMessageIndex(list);

    const updated = permission('shell-A', turnMsgId, 'updated command');
    list = composeMessageWithIndex(updated, list, index);

    expect(list).toHaveLength(1);
    expect((list[0].content as { description: string }).description).toBe('updated command');
  });

  it('treats acp_permission with the same tool_call_id as the same card', () => {
    let list: TMessage[] = [acpPermission('tool-1', 'turn-1')];
    const index = buildMessageIndex(list);

    const update = acpPermission('tool-1', 'turn-1');
    (update.content as { tool_call: { title?: string } }).tool_call.title = 'Updated';
    list = composeMessageWithIndex(update, list, index);

    expect(list).toHaveLength(1);
    expect((list[0].content as { tool_call: { title?: string } }).tool_call.title).toBe('Updated');
  });

  it('does not let a permission collapse a sibling text bubble that shares the same msg_id', () => {
    // If we keyed permission cards by msg_id (the bug), an assistant text
    // bubble that opened the turn would get wiped out the first time a
    // permission request arrived with the same primary msg_id.
    const turnMsgId = 'turn-1';
    let list: TMessage[] = [text(turnMsgId, 'Sure, running the commands…')];
    let index = buildMessageIndex(list);

    list = composeMessageWithIndex(permission('shell-A', turnMsgId, 'ls -la'), list, index);
    index = buildMessageIndex(list);

    expect(list).toHaveLength(2);
    expect(list[0].type).toBe('text');
    expect(list[1].type).toBe('permission');
  });
});

describe('permissionCallId', () => {
  it('reads call_id from a permission message', () => {
    expect(permissionCallId(permission('shell-X', 'turn-1', 'whoami'))).toBe('shell-X');
  });

  it('reads tool_call_id from an acp_permission message', () => {
    expect(permissionCallId(acpPermission('tool-Y', 'turn-1'))).toBe('tool-Y');
  });

  it('returns undefined for non-permission messages', () => {
    expect(permissionCallId(text('turn-1', 'hello'))).toBeUndefined();
  });
});
