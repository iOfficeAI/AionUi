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

  describe('setLoadingSession (issue #2887)', () => {
    const replayChunk: SessionNotification = {
      sessionId: 's1',
      update: {
        // Mirrors @agentclientprotocol/claude-agent-acp@0.29.2 session/load behavior:
        // replay chunks arrive with messageId=undefined.
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'Hello, I was here before restart' },
      } as SessionNotification['update'],
    };

    it('drops agent_message_chunk during loadingSession', () => {
      const t = new MessageTranslator();
      t.setLoadingSession(true);
      expect(t.translate(replayChunk)).toEqual([]);
    });

    it('drops agent_thought_chunk during loadingSession', () => {
      const t = new MessageTranslator();
      t.setLoadingSession(true);
      const msgs = t.translate({
        sessionId: 's1',
        update: {
          sessionUpdate: 'agent_thought_chunk',
          messageId: 'thought-1',
          content: { type: 'text', text: 'thinking…' },
        },
      });
      expect(msgs).toEqual([]);
    });

    it('drops tool_call during loadingSession', () => {
      const t = new MessageTranslator();
      t.setLoadingSession(true);
      const msgs = t.translate({
        sessionId: 's1',
        update: { sessionUpdate: 'tool_call', toolCallId: 'tc-1', title: 'read_file', rawInput: {} },
      });
      expect(msgs).toEqual([]);
    });

    it('still passes through config_updates while loadingSession (state must stay in sync)', () => {
      const t = new MessageTranslator();
      t.setLoadingSession(true);
      // CONFIG_UPDATES short-circuit to [] before the gate, but the point is they are
      // not affected by the flag and AcpSession.handleMessage processes them upstream.
      const msgs = t.translate({
        sessionId: 's1',
        update: { sessionUpdate: 'current_mode_update', currentModeId: 'code' },
      });
      expect(msgs).toEqual([]);
    });

    it('translates normally after setLoadingSession(false)', () => {
      const t = new MessageTranslator();
      t.setLoadingSession(true);
      expect(t.translate(replayChunk)).toEqual([]);
      t.setLoadingSession(false);
      const msgs = t.translate({
        sessionId: 's1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          messageId: 'live-msg',
          content: { type: 'text', text: 'live response' },
        },
      });
      expect(msgs.length).toBe(1);
      expect(msgs[0].type).toBe('text');
    });

    it('clears messageMap when loadingSession ends (so replay-side mappings do not leak into live turns)', () => {
      const t = new MessageTranslator();
      // Populate messageMap with a non-replay chunk
      t.translate({
        sessionId: 's1',
        update: {
          sessionUpdate: 'agent_message_chunk',
          messageId: 'pre',
          content: { type: 'text', text: 'pre-loading state' },
        },
      });
      expect(t.activeEntryCount).toBeGreaterThan(0);
      // Begin a load — gate engages
      t.setLoadingSession(true);
      // End — should clear the map so any stale mapping does not carry over
      t.setLoadingSession(false);
      expect(t.activeEntryCount).toBe(0);
    });
  });
});
