import { transformMessage, composeMessage, IResponseMessage, TMessage } from '@/src/utils/messageAdapter';

// Deterministic uuid for snapshot stability
jest.mock('@/src/utils/uuid', () => {
  let count = 0;
  return { uuid: () => `test-id-${++count}` };
});

beforeEach(() => {
  jest.resetModules();
});

const makeResponse = (overrides: Partial<IResponseMessage> & { type: string }): IResponseMessage => ({
  msg_id: 'msg-1',
  conversation_id: 'conv-1',
  data: 'test',
  ...overrides,
});

describe('transformMessage', () => {
  it('transforms error → tips at center', () => {
    const result = transformMessage(makeResponse({ type: 'error', data: 'Something failed' }));
    expect(result).toMatchObject({
      type: 'tips',
      position: 'center',
      content: { content: 'Something failed', type: 'error' },
    });
  });

  it('transforms content → text at left', () => {
    const result = transformMessage(makeResponse({ type: 'content', data: 'hello' }));
    expect(result).toMatchObject({
      type: 'text',
      position: 'left',
      content: { content: 'hello' },
    });
  });

  it('transforms content with rich data object', () => {
    const result = transformMessage(makeResponse({ type: 'content', data: { content: 'rich text' } }));
    expect(result).toMatchObject({
      type: 'text',
      position: 'left',
      content: { content: 'rich text' },
    });
  });

  it('transforms user_content → text at right', () => {
    const result = transformMessage(makeResponse({ type: 'user_content', data: 'user msg' }));
    expect(result).toMatchObject({
      type: 'text',
      position: 'right',
      content: { content: 'user msg' },
    });
  });

  it('transforms tool_call → tool_call at left', () => {
    const data = { callId: 'c1', name: 'search', status: 'running' };
    const result = transformMessage(makeResponse({ type: 'tool_call', data }));
    expect(result).toMatchObject({
      type: 'tool_call',
      position: 'left',
      content: data,
    });
  });

  it('transforms tool_group', () => {
    const data = [{ callId: 'c1' }, { callId: 'c2' }];
    const result = transformMessage(makeResponse({ type: 'tool_group', data }));
    expect(result).toMatchObject({ type: 'tool_group', content: data });
  });

  it('transforms agent_status → center', () => {
    const result = transformMessage(makeResponse({ type: 'agent_status', data: { status: 'thinking' } }));
    expect(result).toMatchObject({ type: 'agent_status', position: 'center' });
  });

  it('transforms acp_permission → left', () => {
    const result = transformMessage(makeResponse({ type: 'acp_permission', data: {} }));
    expect(result).toMatchObject({ type: 'acp_permission', position: 'left' });
  });

  it('transforms acp_tool_call → left', () => {
    const result = transformMessage(makeResponse({ type: 'acp_tool_call', data: {} }));
    expect(result).toMatchObject({ type: 'acp_tool_call', position: 'left' });
  });

  it('transforms codex_permission → left', () => {
    const result = transformMessage(makeResponse({ type: 'codex_permission', data: {} }));
    expect(result).toMatchObject({ type: 'codex_permission', position: 'left' });
  });

  it('transforms codex_tool_call → left', () => {
    const result = transformMessage(makeResponse({ type: 'codex_tool_call', data: {} }));
    expect(result).toMatchObject({ type: 'codex_tool_call', position: 'left' });
  });

  it('transforms plan → left', () => {
    const data = { sessionId: 's1', steps: [] };
    const result = transformMessage(makeResponse({ type: 'plan', data }));
    expect(result).toMatchObject({ type: 'plan', position: 'left', content: data });
  });

  it.each(['start', 'finish', 'thought', 'system', 'acp_model_info', 'codex_model_info', 'acp_context_usage', 'request_trace', 'available_commands'])(
    'returns undefined for ignored type: %s',
    (type) => {
      expect(transformMessage(makeResponse({ type }))).toBeUndefined();
    },
  );

  it('returns undefined for unknown types', () => {
    expect(transformMessage(makeResponse({ type: 'nonexistent_type' }))).toBeUndefined();
  });
});

describe('composeMessage', () => {
  const makeMsg = (overrides: Partial<TMessage>): TMessage => ({
    id: 'id-1',
    msg_id: 'msg-1',
    conversation_id: 'conv-1',
    type: 'text',
    content: { content: 'hello' },
    position: 'left',
    ...overrides,
  });

  it('returns the same list when message is undefined', () => {
    const list = [makeMsg({})];
    expect(composeMessage(undefined, list)).toBe(list);
  });

  it('returns a new list with the message when list is empty', () => {
    const msg = makeMsg({});
    const result = composeMessage(msg, []);
    expect(result).toEqual([msg]);
  });

  it('appends message when msg_id differs', () => {
    const existing = makeMsg({ msg_id: 'msg-1' });
    const incoming = makeMsg({ id: 'id-2', msg_id: 'msg-2', content: { content: 'world' } });
    const result = composeMessage(incoming, [existing]);
    expect(result).toHaveLength(2);
    expect(result[1]).toBe(incoming);
  });

  describe('text streaming', () => {
    it('concatenates content for same msg_id text messages', () => {
      const existing = makeMsg({ msg_id: 'msg-1', type: 'text', content: { content: 'hel' } });
      const incoming = makeMsg({ id: 'id-2', msg_id: 'msg-1', type: 'text', content: { content: 'lo' } });
      const result = composeMessage(incoming, [existing]);
      expect(result).toHaveLength(1);
      expect(result[0].content.content).toBe('hello');
      // Keeps original id
      expect(result[0].id).toBe('id-1');
    });
  });

  describe('tool_call merging', () => {
    it('merges tool_call with same callId', () => {
      const existing = makeMsg({
        type: 'tool_call',
        content: { callId: 'c1', name: 'search', status: 'running' },
      });
      const incoming = makeMsg({
        id: 'id-2',
        type: 'tool_call',
        content: { callId: 'c1', status: 'done', result: 'found' },
      });
      const result = composeMessage(incoming, [existing]);
      expect(result).toHaveLength(1);
      expect(result[0].content).toEqual({ callId: 'c1', name: 'search', status: 'done', result: 'found' });
    });

    it('appends tool_call with different callId', () => {
      const existing = makeMsg({ type: 'tool_call', content: { callId: 'c1' } });
      const incoming = makeMsg({ id: 'id-2', type: 'tool_call', content: { callId: 'c2' } });
      const result = composeMessage(incoming, [existing]);
      expect(result).toHaveLength(2);
    });
  });

  describe('tool_group merging', () => {
    it('merges tool_group items by callId across existing groups', () => {
      const existing = makeMsg({
        type: 'tool_group',
        content: [{ callId: 'c1', status: 'running' }, { callId: 'c2', status: 'running' }],
      });
      const incoming = makeMsg({
        id: 'id-2',
        type: 'tool_group',
        content: [{ callId: 'c1', status: 'done', result: 'ok' }],
      });
      const result = composeMessage(incoming, [existing]);
      expect(result).toHaveLength(1);
      expect(result[0].content[0]).toEqual({ callId: 'c1', status: 'done', result: 'ok' });
      expect(result[0].content[1]).toEqual({ callId: 'c2', status: 'running' });
    });

    it('appends unmatched tool_group items as a new group', () => {
      const existing = makeMsg({
        type: 'tool_group',
        content: [{ callId: 'c1', status: 'done' }],
      });
      const incoming = makeMsg({
        id: 'id-2',
        type: 'tool_group',
        content: [{ callId: 'c3', status: 'running' }],
      });
      const result = composeMessage(incoming, [existing]);
      expect(result).toHaveLength(2);
      expect(result[1].content).toEqual([{ callId: 'c3', status: 'running' }]);
    });

    it('returns same list for empty tool_group content', () => {
      const existing = makeMsg({ type: 'text', content: { content: 'hi' } });
      const list = [existing];
      const incoming = makeMsg({ id: 'id-2', type: 'tool_group', content: [] });
      const result = composeMessage(incoming, list);
      expect(result).toBe(list);
    });
  });

  describe('plan merging', () => {
    it('merges plan with same sessionId', () => {
      const existing = makeMsg({
        type: 'plan',
        content: { sessionId: 's1', steps: ['step1'] },
      });
      const incoming = makeMsg({
        id: 'id-2',
        type: 'plan',
        content: { sessionId: 's1', steps: ['step1', 'step2'], status: 'complete' },
      });
      const result = composeMessage(incoming, [existing]);
      expect(result).toHaveLength(1);
      expect(result[0].content.steps).toEqual(['step1', 'step2']);
      expect(result[0].content.status).toBe('complete');
    });

    it('appends plan with different sessionId', () => {
      const existing = makeMsg({ type: 'plan', content: { sessionId: 's1' } });
      const incoming = makeMsg({ id: 'id-2', type: 'plan', content: { sessionId: 's2' } });
      const result = composeMessage(incoming, [existing]);
      expect(result).toHaveLength(2);
    });
  });

  describe('codex_tool_call merging', () => {
    it('merges by toolCallId', () => {
      const existing = makeMsg({
        type: 'codex_tool_call',
        content: { toolCallId: 't1', status: 'running' },
      });
      const incoming = makeMsg({
        id: 'id-2',
        type: 'codex_tool_call',
        content: { toolCallId: 't1', status: 'done' },
      });
      const result = composeMessage(incoming, [existing]);
      expect(result).toHaveLength(1);
      expect(result[0].content.status).toBe('done');
    });
  });

  describe('acp_tool_call merging', () => {
    it('merges by update.toolCallId', () => {
      const existing = makeMsg({
        type: 'acp_tool_call',
        content: { update: { toolCallId: 't1' }, status: 'running' },
      });
      const incoming = makeMsg({
        id: 'id-2',
        type: 'acp_tool_call',
        content: { update: { toolCallId: 't1' }, status: 'done' },
      });
      const result = composeMessage(incoming, [existing]);
      expect(result).toHaveLength(1);
      expect(result[0].content.status).toBe('done');
    });
  });
});
