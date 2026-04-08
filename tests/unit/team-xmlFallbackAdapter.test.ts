// tests/unit/team-xmlFallbackAdapter.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createXmlFallbackAdapter } from '@process/team/adapters/xmlFallbackAdapter';
import type { TeamAgent } from '@process/team/types';

// Mock buildRolePrompt dependencies (prompts module uses no external deps in test context)
vi.mock('@process/team/prompts/leadPrompt', () => ({
  buildLeadPrompt: vi.fn(() => 'LEAD_PROMPT'),
}));
vi.mock('@process/team/prompts/teammatePrompt', () => ({
  buildTeammatePrompt: vi.fn(() => 'TEAMMATE_PROMPT'),
}));

function makeAgent(overrides: Partial<TeamAgent> = {}): TeamAgent {
  return {
    slotId: 'slot-1',
    conversationId: 'conv-1',
    role: 'lead',
    agentType: 'acp',
    agentName: 'Claude',
    conversationType: 'acp',
    status: 'idle',
    ...overrides,
  };
}

describe('createXmlFallbackAdapter', () => {
  describe('getCapability', () => {
    it('reports supportsToolUse=false and supportsStreaming=true', () => {
      const adapter = createXmlFallbackAdapter();
      const cap = adapter.getCapability();
      expect(cap.supportsToolUse).toBe(false);
      expect(cap.supportsStreaming).toBe(true);
    });
  });

  describe('buildPayload', () => {
    it('returns a message string containing the role prompt', () => {
      const adapter = createXmlFallbackAdapter();
      const payload = adapter.buildPayload({
        agent: makeAgent({ role: 'lead' }),
        mailboxMessages: [],
        tasks: [],
        teammates: [],
      });
      expect(typeof payload.message).toBe('string');
      expect(payload.message).toContain('LEAD_PROMPT');
    });

    it('includes XML fallback instructions when hasMcpTools is false', () => {
      const adapter = createXmlFallbackAdapter({ hasMcpTools: false });
      const payload = adapter.buildPayload({
        agent: makeAgent(),
        mailboxMessages: [],
        tasks: [],
        teammates: [],
      });
      expect(payload.message).toContain('<send_message');
      expect(payload.message).toContain('<idle');
    });

    it('does NOT include XML fallback instructions when hasMcpTools is true', () => {
      const adapter = createXmlFallbackAdapter({ hasMcpTools: true });
      const payload = adapter.buildPayload({
        agent: makeAgent(),
        mailboxMessages: [],
        tasks: [],
        teammates: [],
      });
      expect(payload.message).not.toContain('<send_message');
      expect(payload.message).not.toContain('## Team Coordination (XML Fallback)');
    });

    it('includes XML fallback instructions by default (no options)', () => {
      const adapter = createXmlFallbackAdapter();
      const payload = adapter.buildPayload({
        agent: makeAgent(),
        mailboxMessages: [],
        tasks: [],
        teammates: [],
      });
      expect(payload.message).toContain('## Team Coordination (XML Fallback)');
    });
  });

  describe('parseResponse - send_message', () => {
    it('parses a send_message tag', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({
        text: '<send_message to="Alice">Hello Alice, please review the PR.</send_message>',
      });
      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({
        type: 'send_message',
        to: 'Alice',
        content: 'Hello Alice, please review the PR.',
      });
    });

    it('parses multiple send_message tags', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({
        text: '<send_message to="Alice">Hi Alice</send_message>\n<send_message to="Bob">Hi Bob</send_message>',
      });
      const sendMessages = actions.filter((a) => a.type === 'send_message');
      expect(sendMessages).toHaveLength(2);
    });

    it('trims whitespace from send_message content', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({
        text: '<send_message to="Bob">  spaced content  </send_message>',
      });
      const msg = actions.find((a) => a.type === 'send_message');
      expect(msg?.type === 'send_message' && msg.content).toBe('spaced content');
    });

    it('handles multiline send_message content', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({
        text: '<send_message to="Alice">\nLine 1\nLine 2\n</send_message>',
      });
      const msg = actions.find((a) => a.type === 'send_message');
      expect(msg?.type === 'send_message' && msg.content).toContain('Line 1');
    });
  });

  describe('parseResponse - task_create', () => {
    it('parses a task_create tag with all attributes', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({
        text: '<task_create subject="Write tests" owner="slot-2" description="Cover edge cases"/>',
      });
      expect(actions.some((a) => a.type === 'task_create')).toBe(true);
      const task = actions.find((a) => a.type === 'task_create');
      expect(task?.type === 'task_create' && task.subject).toBe('Write tests');
      expect(task?.type === 'task_create' && task.owner).toBe('slot-2');
      expect(task?.type === 'task_create' && task.description).toBe('Cover edge cases');
    });

    it('skips task_create without required subject attribute', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({
        text: '<task_create owner="slot-2" description="No subject"/>',
      });
      expect(actions.filter((a) => a.type === 'task_create')).toHaveLength(0);
    });

    it('creates task_create with only subject', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({
        text: '<task_create subject="Minimal task"/>',
      });
      const task = actions.find((a) => a.type === 'task_create');
      expect(task?.type === 'task_create' && task.subject).toBe('Minimal task');
      expect(task?.type === 'task_create' && task.owner).toBeUndefined();
    });
  });

  describe('parseResponse - task_update', () => {
    it('parses a task_update tag', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({
        text: '<task_update task_id="abc-123" status="completed"/>',
      });
      const update = actions.find((a) => a.type === 'task_update');
      expect(update?.type === 'task_update' && update.taskId).toBe('abc-123');
      expect(update?.type === 'task_update' && update.status).toBe('completed');
    });

    it('skips task_update without required task_id', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({
        text: '<task_update status="completed"/>',
      });
      expect(actions.filter((a) => a.type === 'task_update')).toHaveLength(0);
    });

    it('parses task_update with owner attribute', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({
        text: '<task_update task_id="t-1" owner="slot-3"/>',
      });
      const update = actions.find((a) => a.type === 'task_update');
      expect(update?.type === 'task_update' && update.owner).toBe('slot-3');
    });
  });

  describe('parseResponse - spawn_agent', () => {
    it('parses a spawn_agent tag', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({
        text: '<spawn_agent name="Bob" type="claude"/>',
      });
      const spawn = actions.find((a) => a.type === 'spawn_agent');
      expect(spawn?.type === 'spawn_agent' && spawn.agentName).toBe('Bob');
      expect(spawn?.type === 'spawn_agent' && spawn.agentType).toBe('claude');
    });

    it('skips spawn_agent without name attribute', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({
        text: '<spawn_agent type="claude"/>',
      });
      expect(actions.filter((a) => a.type === 'spawn_agent')).toHaveLength(0);
    });
  });

  describe('parseResponse - idle', () => {
    it('parses an idle tag with required attributes', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({
        text: '<idle reason="available" summary="Finished coding task" completed_task_id="t-1"/>',
      });
      const idle = actions.find((a) => a.type === 'idle_notification');
      expect(idle?.type === 'idle_notification' && idle.reason).toBe('available');
      expect(idle?.type === 'idle_notification' && idle.summary).toBe('Finished coding task');
      expect(idle?.type === 'idle_notification' && idle.completedTaskId).toBe('t-1');
    });

    it('skips idle tag missing summary attribute', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({
        text: '<idle reason="available"/>',
      });
      expect(actions.filter((a) => a.type === 'idle_notification')).toHaveLength(0);
    });

    it('skips idle tag missing reason attribute', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({
        text: '<idle summary="Done"/>',
      });
      expect(actions.filter((a) => a.type === 'idle_notification')).toHaveLength(0);
    });

    it('parses idle without optional completed_task_id', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({
        text: '<idle reason="available" summary="Ready"/>',
      });
      const idle = actions.find((a) => a.type === 'idle_notification');
      expect(idle).toBeDefined();
      expect(idle?.type === 'idle_notification' && idle.completedTaskId).toBeUndefined();
    });
  });

  describe('parseResponse - plain_response', () => {
    it('wraps non-XML text as plain_response', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({ text: 'This is a regular response.' });
      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual({ type: 'plain_response', content: 'This is a regular response.' });
    });

    it('returns empty array for empty text', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({ text: '' });
      expect(actions).toEqual([]);
    });

    it('returns empty array for whitespace-only text', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({ text: '   \n\t  ' });
      expect(actions).toEqual([]);
    });

    it('extracts remaining text after XML tags as plain_response', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({
        text: 'Prefix text. <idle reason="available" summary="Done"/> Suffix text.',
      });
      const plain = actions.find((a) => a.type === 'plain_response');
      expect(plain?.type === 'plain_response' && plain.content).toContain('Prefix text');
      expect(plain?.type === 'plain_response' && plain.content).toContain('Suffix text');
    });

    it('does not create plain_response when all text is consumed by XML tags', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({
        text: '<send_message to="Alice">Hello</send_message>',
      });
      expect(actions.every((a) => a.type !== 'plain_response')).toBe(true);
    });
  });

  describe('parseResponse - mixed content', () => {
    it('parses multiple action types in one response', () => {
      const adapter = createXmlFallbackAdapter();
      const text = [
        'Working on the task now.',
        '<task_create subject="New task" owner="slot-2"/>',
        '<send_message to="Bob">Starting your task</send_message>',
        '<idle reason="available" summary="Task created and assigned"/>',
      ].join('\n');

      const actions = adapter.parseResponse({ text });

      expect(actions.some((a) => a.type === 'task_create')).toBe(true);
      expect(actions.some((a) => a.type === 'send_message')).toBe(true);
      expect(actions.some((a) => a.type === 'idle_notification')).toBe(true);
      expect(actions.some((a) => a.type === 'plain_response')).toBe(true);
    });

    it('attribute order does not matter in task_create', () => {
      const adapter = createXmlFallbackAdapter();
      const actions = adapter.parseResponse({
        text: '<task_create description="desc" owner="slot-1" subject="My task"/>',
      });
      const task = actions.find((a) => a.type === 'task_create');
      expect(task?.type === 'task_create' && task.subject).toBe('My task');
      expect(task?.type === 'task_create' && task.description).toBe('desc');
    });
  });
});
