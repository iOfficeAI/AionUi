// tests/unit/process/acp/session/MessageTranslator.test.ts
import { describe, it, expect } from 'vitest';
import { MessageTranslator } from '@process/acp/session/MessageTranslator';
import type { SessionNotification } from '@agentclientprotocol/sdk';

describe('MessageTranslator', () => {
  it('translates agent_message_chunk to TMessage', () => {
    const translator = new MessageTranslator();
    const notification: SessionNotification = {
      sessionId: 'sess-1',
      update: {
        sessionUpdate: 'agent_message_chunk',
        messageId: 'msg-1',
        content: { type: 'text', text: 'Hello' },
      },
    };
    const messages = translator.translate(notification);
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].type).toBeDefined();
  });

  it('accumulates chunks for same messageId', () => {
    const translator = new MessageTranslator();
    translator.translate({
      sessionId: 's1',
      update: {
        sessionUpdate: 'agent_message_chunk',
        messageId: 'm1',
        content: { type: 'text', text: 'Hello ' },
      },
    });
    const msgs = translator.translate({
      sessionId: 's1',
      update: {
        sessionUpdate: 'agent_message_chunk',
        messageId: 'm1',
        content: { type: 'text', text: 'world' },
      },
    });
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it('translates tool_call to TMessage', () => {
    const translator = new MessageTranslator();
    const messages = translator.translate({
      sessionId: 's1',
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'tc-1',
        title: 'read_file',
        rawInput: { path: '/foo' },
      },
    });
    expect(messages.length).toBeGreaterThanOrEqual(1);
  });

  it('onTurnEnd clears completed entries (INV-S-12)', () => {
    const translator = new MessageTranslator();
    translator.translate({
      sessionId: 's1',
      update: {
        sessionUpdate: 'agent_message_chunk',
        messageId: 'm1',
        content: { type: 'text', text: 'test' },
      },
    });
    expect(translator.activeEntryCount).toBeGreaterThan(0);
    translator.onTurnEnd();
    expect(translator.activeEntryCount).toBe(0);
  });

  it('reset clears all state', () => {
    const translator = new MessageTranslator();
    translator.translate({
      sessionId: 's1',
      update: {
        sessionUpdate: 'agent_message_chunk',
        messageId: 'm1',
        content: { type: 'text', text: 'test' },
      },
    });
    translator.reset();
    expect(translator.activeEntryCount).toBe(0);
  });

  it('returns empty array for config-type updates (handled by AcpSession directly)', () => {
    const translator = new MessageTranslator();
    const msgs = translator.translate({
      sessionId: 's1',
      update: { sessionUpdate: 'current_mode_update', currentModeId: 'code' },
    });
    expect(msgs).toEqual([]);
  });
});
