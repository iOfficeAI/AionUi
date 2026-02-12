/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from '@jest/globals';
import type { IMessageToolGroup, TMessage } from '../../src/common/chatLib';
import { composeMessage } from '../../src/common/chatLib';

describe('composeMessage tool_group immutability', () => {
  it('should not mutate the existing list and should return new references for tool_group updates', () => {
    const conversation_id = 'conv-1';
    const callId = 'call-1';

    const userMessage: TMessage = {
      id: 'msg-user-1',
      msg_id: 'msg-user-1',
      conversation_id,
      type: 'text',
      position: 'right',
      content: { content: 'Organize my folder' },
    };

    const toolGroupExecuting: TMessage = {
      id: 'msg-tool-1',
      msg_id: 'msg-tool-1',
      conversation_id,
      type: 'tool_group',
      content: [
        {
          callId,
          name: 'ReadFolder',
          description: 'List files in current directory',
          renderOutputAsMarkdown: false,
          status: 'Executing',
        },
      ],
    };

    const initialList: TMessage[] = [userMessage];
    const listAfterExecuting = composeMessage(toolGroupExecuting, initialList);

    // Expected behavior: do not mutate the existing list in-place (React state relies on immutability)
    expect(initialList).toHaveLength(1);
    expect(listAfterExecuting).not.toBe(initialList);
    expect(listAfterExecuting).toHaveLength(2);

    const isToolGroupMessage = (m: TMessage): m is IMessageToolGroup => m.type === 'tool_group';

    const toolMessageExecuting = listAfterExecuting.find(isToolGroupMessage);
    if (!toolMessageExecuting) throw new Error('Expected a tool_group message');
    expect(toolMessageExecuting.content[0].status).toBe('Executing');

    const toolGroupConfirming: TMessage = {
      id: 'msg-tool-2',
      msg_id: 'msg-tool-1',
      conversation_id,
      type: 'tool_group',
      content: [
        {
          callId,
          name: 'ReadFolder',
          description: 'List files in current directory',
          renderOutputAsMarkdown: false,
          status: 'Confirming',
          confirmationDetails: {
            type: 'info',
            title: 'Read folder',
            urls: [],
            prompt: 'Allow ReadFolder to read the selected folder?',
          },
        },
      ],
    };

    const listAfterConfirming = composeMessage(toolGroupConfirming, listAfterExecuting);
    expect(listAfterConfirming).not.toBe(listAfterExecuting);

    const toolMessageConfirming = listAfterConfirming.find(isToolGroupMessage);
    if (!toolMessageConfirming) throw new Error('Expected a tool_group message');
    expect(toolMessageConfirming.content[0].status).toBe('Confirming');
    expect(toolMessageConfirming.content[0].confirmationDetails).toBeDefined();
    expect(toolMessageConfirming.content[0].confirmationDetails?.type).toBe('info');
  });

  it('should return the same list reference when tool_group content is empty', () => {
    const conversation_id = 'conv-empty';

    const userMessage: TMessage = {
      id: 'msg-user-empty-1',
      msg_id: 'msg-user-empty-1',
      conversation_id,
      type: 'text',
      position: 'right',
      content: { content: 'Hi' },
    };

    const list: TMessage[] = [userMessage];

    const emptyToolGroup: TMessage = {
      id: 'msg-tool-empty-1',
      msg_id: 'msg-tool-empty-1',
      conversation_id,
      type: 'tool_group',
      content: [],
    };

    const next = composeMessage(emptyToolGroup, list);
    expect(next).toBe(list);
    expect(next).toHaveLength(1);
  });

  it('should merge updates across multiple tool_group messages and insert new tools', () => {
    const conversation_id = 'conv-2';
    const callA = 'call-a';
    const callB = 'call-b';
    const callC = 'call-c';

    const toolGroupA: TMessage = {
      id: 'msg-tool-a',
      msg_id: 'msg-tool-a',
      conversation_id,
      type: 'tool_group',
      content: [
        {
          callId: callA,
          name: 'ToolA',
          description: 'Tool A',
          renderOutputAsMarkdown: false,
          status: 'Executing',
        },
      ],
    };

    const toolGroupB: TMessage = {
      id: 'msg-tool-b',
      msg_id: 'msg-tool-b',
      conversation_id,
      type: 'tool_group',
      content: [
        {
          callId: callB,
          name: 'ToolB',
          description: 'Tool B',
          renderOutputAsMarkdown: false,
          status: 'Executing',
        },
      ],
    };

    const initialList: TMessage[] = [toolGroupA, toolGroupB];

    const update: TMessage = {
      id: 'msg-tool-update',
      msg_id: 'msg-tool-update',
      conversation_id,
      type: 'tool_group',
      content: [
        {
          callId: callA,
          name: 'ToolA',
          description: 'Tool A',
          renderOutputAsMarkdown: false,
          status: 'Success',
          resultDisplay: 'ok',
        },
        {
          callId: callB,
          name: 'ToolB',
          description: 'Tool B',
          renderOutputAsMarkdown: false,
          status: 'Confirming',
          confirmationDetails: {
            type: 'info',
            title: 'Confirm',
            urls: [],
            prompt: 'Allow ToolB?',
          },
        },
        {
          callId: callC,
          name: 'ToolC',
          description: 'Tool C',
          renderOutputAsMarkdown: false,
          status: 'Pending',
        },
      ],
    };

    const mergedList = composeMessage(update, initialList);

    expect(initialList).toHaveLength(2);
    expect(mergedList).not.toBe(initialList);
    expect(mergedList).toHaveLength(3);

    const isToolGroupMessage = (m: TMessage): m is IMessageToolGroup => m.type === 'tool_group';

    const updatedA = mergedList.find((m) => m.id === 'msg-tool-a');
    if (!updatedA || !isToolGroupMessage(updatedA)) throw new Error('Expected tool_group A');
    expect(updatedA.content[0].status).toBe('Success');

    const updatedB = mergedList.find((m) => m.id === 'msg-tool-b');
    if (!updatedB || !isToolGroupMessage(updatedB)) throw new Error('Expected tool_group B');
    expect(updatedB.content[0].status).toBe('Confirming');
    expect(updatedB.content[0].confirmationDetails).toBeDefined();

    const inserted = mergedList.find((m) => m.id === 'msg-tool-update');
    if (!inserted || !isToolGroupMessage(inserted)) throw new Error('Expected inserted tool_group message');
    expect(inserted.content).toHaveLength(1);
    expect(inserted.content[0].callId).toBe(callC);
    expect(inserted.content[0].status).toBe('Pending');
  });

  it('should append a new tool_group message when all tools are new', () => {
    const conversation_id = 'conv-insert-only';
    const existingCall = 'call-existing';
    const newCall = 'call-new';

    const existingToolGroup: TMessage = {
      id: 'msg-tool-existing',
      msg_id: 'msg-tool-existing',
      conversation_id,
      type: 'tool_group',
      content: [
        {
          callId: existingCall,
          name: 'ToolExisting',
          description: 'Existing tool',
          renderOutputAsMarkdown: false,
          status: 'Executing',
        },
      ],
    };

    const insertOnly: TMessage = {
      id: 'msg-tool-insert-only',
      msg_id: 'msg-tool-insert-only',
      conversation_id,
      type: 'tool_group',
      content: [
        {
          callId: newCall,
          name: 'ToolNew',
          description: 'New tool',
          renderOutputAsMarkdown: false,
          status: 'Pending',
        },
      ],
    };

    const initialList: TMessage[] = [existingToolGroup];
    const mergedList = composeMessage(insertOnly, initialList);

    expect(initialList).toHaveLength(1);
    expect(mergedList).not.toBe(initialList);
    expect(mergedList).toHaveLength(2);
    expect(mergedList[0]).toBe(existingToolGroup);

    const isToolGroupMessage = (m: TMessage): m is IMessageToolGroup => m.type === 'tool_group';
    const inserted = mergedList[1];
    if (!isToolGroupMessage(inserted)) throw new Error('Expected inserted tool_group message');
    expect(inserted.content).toHaveLength(1);
    expect(inserted.content[0].callId).toBe(newCall);
    expect(inserted.content[0].status).toBe('Pending');
  });
});
