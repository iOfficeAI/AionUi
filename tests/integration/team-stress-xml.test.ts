/**
 * Stress tests: xmlFallbackAdapter edge cases and boundary conditions.
 *
 * Tests:
 * - Malformed XML (unclosed tags, nested tags, special chars)
 * - Extremely long responses (100KB+ with embedded XML actions)
 * - Unicode content in XML attributes and text
 * - Multiple actions in a single response
 * - XML injection attempts in attribute values
 * - Regex backtracking edge cases
 *
 * No mocks needed — adapter is pure logic with no external dependencies.
 */

import { describe, it, expect } from 'vitest';
import { createXmlFallbackAdapter } from '@process/team/adapters/xmlFallbackAdapter';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parse(text: string) {
  const adapter = createXmlFallbackAdapter();
  return adapter.parseResponse({ text });
}

function _parseWithMcp(text: string) {
  const adapter = createXmlFallbackAdapter({ hasMcpTools: true });
  return adapter.parseResponse({ text });
}

// ── Basic action parsing ──────────────────────────────────────────────────────

describe('xmlFallbackAdapter — basic action parsing', () => {
  it('parses send_message with content', () => {
    const actions = parse('<send_message to="Alice">Hello teammate</send_message>');
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: 'send_message', to: 'Alice', content: 'Hello teammate' });
  });

  it('parses task_create with all attributes', () => {
    const actions = parse('<task_create subject="Build API" owner="Bob" description="REST endpoints"/>');
    expect(actions[0]).toMatchObject({
      type: 'task_create',
      subject: 'Build API',
      owner: 'Bob',
      description: 'REST endpoints',
    });
  });

  it('parses task_update with status', () => {
    const actions = parse('<task_update task_id="abc-123" status="completed"/>');
    expect(actions[0]).toMatchObject({ type: 'task_update', taskId: 'abc-123', status: 'completed' });
  });

  it('parses spawn_agent', () => {
    const actions = parse('<spawn_agent name="Researcher" type="claude"/>');
    expect(actions[0]).toMatchObject({ type: 'spawn_agent', agentName: 'Researcher', agentType: 'claude' });
  });

  it('parses idle with reason and summary', () => {
    const actions = parse('<idle reason="available" summary="Task complete"/>');
    expect(actions[0]).toMatchObject({ type: 'idle_notification', reason: 'available', summary: 'Task complete' });
  });

  it('remaining text outside XML becomes plain_response', () => {
    const actions = parse('Here is my thinking.\n<task_create subject="Fix bug"/>\nDone.');
    const plainActions = actions.filter((a) => a.type === 'plain_response');
    expect(plainActions).toHaveLength(1);
    expect((plainActions[0] as { content: string }).content).toContain('Here is my thinking');
    expect((plainActions[0] as { content: string }).content).toContain('Done.');
  });
});

// ── Multiple actions ──────────────────────────────────────────────────────────

describe('xmlFallbackAdapter — multiple actions in one response', () => {
  it('parses 10 send_message actions', () => {
    const text = Array.from(
      { length: 10 },
      (_, i) => `<send_message to="Agent${i}">Task ${i} done</send_message>`
    ).join('\n');
    const actions = parse(text);
    const sendActions = actions.filter((a) => a.type === 'send_message');
    expect(sendActions).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(sendActions[i]).toMatchObject({ to: `Agent${i}`, content: `Task ${i} done` });
    }
  });

  it('parses mixed action types in a single response', () => {
    const text = `
I've completed the analysis.
<task_create subject="Phase 2" owner="Bob"/>
<send_message to="Alice">Starting phase 2</send_message>
<task_update task_id="task-1" status="completed"/>
<idle reason="available" summary="Phase 1 done"/>
    `;
    const actions = parse(text.trim());
    expect(actions.find((a) => a.type === 'task_create')).toBeDefined();
    expect(actions.find((a) => a.type === 'send_message')).toBeDefined();
    expect(actions.find((a) => a.type === 'task_update')).toBeDefined();
    expect(actions.find((a) => a.type === 'idle_notification')).toBeDefined();
    expect(actions.find((a) => a.type === 'plain_response')).toBeDefined();
  });

  it('parses 50 mixed actions without performance degradation', () => {
    const parts: string[] = [];
    for (let i = 0; i < 25; i++) {
      parts.push(`<send_message to="Agent${i % 5}">Message ${i}</send_message>`);
    }
    for (let i = 0; i < 25; i++) {
      parts.push(`<task_create subject="Task ${i}" owner="Worker"/>`);
    }
    const text = parts.join('\n');

    const start = Date.now();
    const actions = parse(text);
    const elapsed = Date.now() - start;

    expect(actions.filter((a) => a.type === 'send_message')).toHaveLength(25);
    expect(actions.filter((a) => a.type === 'task_create')).toHaveLength(25);
    // Should parse 50 actions in well under 1 second
    expect(elapsed).toBeLessThan(1000);
  });
});

// ── Malformed XML ─────────────────────────────────────────────────────────────

describe('xmlFallbackAdapter — malformed XML', () => {
  it('unclosed send_message tag: not parsed as send_message', () => {
    const actions = parse('<send_message to="Alice">Hello without closing tag');
    const sendActions = actions.filter((a) => a.type === 'send_message');
    // Unclosed tag does not match the regex — treated as plain text
    expect(sendActions).toHaveLength(0);
  });

  it('self-closing send_message (wrong syntax): not parsed', () => {
    // send_message requires content — self-closing is wrong syntax
    const actions = parse('<send_message to="Alice"/>');
    const sendActions = actions.filter((a) => a.type === 'send_message');
    expect(sendActions).toHaveLength(0);
  });

  it('task_create without self-close: not parsed', () => {
    // Missing /> — open tag syntax
    const actions = parse('<task_create subject="Bad task">');
    const taskActions = actions.filter((a) => a.type === 'task_create');
    expect(taskActions).toHaveLength(0);
  });

  it('task_create missing required subject: skipped gracefully', () => {
    const actions = parse('<task_create owner="Bob" description="No subject"/>');
    const taskActions = actions.filter((a) => a.type === 'task_create');
    expect(taskActions).toHaveLength(0);
  });

  it('task_update missing required task_id: skipped gracefully', () => {
    const actions = parse('<task_update status="completed"/>');
    const taskActions = actions.filter((a) => a.type === 'task_update');
    expect(taskActions).toHaveLength(0);
  });

  it('idle missing summary: skipped gracefully', () => {
    const actions = parse('<idle reason="available"/>');
    const idleActions = actions.filter((a) => a.type === 'idle_notification');
    expect(idleActions).toHaveLength(0);
  });

  it('spawn_agent missing name: skipped gracefully', () => {
    const actions = parse('<spawn_agent type="claude"/>');
    const spawnActions = actions.filter((a) => a.type === 'spawn_agent');
    expect(spawnActions).toHaveLength(0);
  });

  /**
   * Nested send_message tags: the regex uses lazy [\s\S]*? matching.
   * Outer tag would capture inner tag as content.
   */
  it('nested send_message tags: outer tag captures inner as content', () => {
    const text = '<send_message to="Alice"><send_message to="Bob">inner</send_message></send_message>';
    const actions = parse(text);
    const sendActions = actions.filter((a) => a.type === 'send_message');
    // The regex is non-greedy: first match is <send_message to="Alice"><send_message to="Bob">inner</send_message>
    // This means to="Alice" gets content that includes the inner XML tag
    // Outer to="Alice" captures everything up to the first </send_message>
    expect(sendActions.length).toBeGreaterThanOrEqual(1);
    // The first action should be to Alice
    if (sendActions.length >= 1) {
      expect(sendActions[0]).toMatchObject({ type: 'send_message', to: 'Alice' });
    }
  });

  it('malformed attribute (no closing quote): not parsed', () => {
    const actions = parse('<task_create subject="unclosed attribute/>');
    const taskActions = actions.filter((a) => a.type === 'task_create');
    expect(taskActions).toHaveLength(0);
  });

  it('extra whitespace in self-closing tag: parsed correctly', () => {
    const actions = parse('<task_create   subject="Spaced"   owner="Bob"   />');
    expect(actions[0]).toMatchObject({ type: 'task_create', subject: 'Spaced', owner: 'Bob' });
  });
});

// ── Unicode content ───────────────────────────────────────────────────────────

describe('xmlFallbackAdapter — Unicode content', () => {
  it('Unicode in send_message content: preserved exactly', () => {
    const content = '你好，世界！🚀 Héllo Wörld — τεστ';
    const actions = parse(`<send_message to="Alice">${content}</send_message>`);
    expect(actions[0]).toMatchObject({ type: 'send_message', content });
  });

  it('Unicode in task_create subject attribute', () => {
    const subject = 'Tâche: résoudre le bogue #42 — URGENT 🔥';
    const actions = parse(`<task_create subject="${subject}"/>`);
    expect(actions[0]).toMatchObject({ type: 'task_create', subject });
  });

  it('CJK characters in agent name (to attribute)', () => {
    const actions = parse('<send_message to="助手">任务完成了</send_message>');
    expect(actions[0]).toMatchObject({ type: 'send_message', to: '助手', content: '任务完成了' });
  });

  it('emoji and RTL text in content: no parsing errors', () => {
    const text = '<send_message to="Alice">مرحبا ✅ 🎉 done</send_message>';
    const actions = parse(text);
    const sendActions = actions.filter((a) => a.type === 'send_message');
    expect(sendActions).toHaveLength(1);
    expect((sendActions[0] as { content: string }).content).toContain('مرحبا');
  });

  it('null bytes and control chars in content: handled without crash', () => {
    // XML technically disallows some control chars, but regex won't crash
    const content = 'line1\x00\x01\x02line2';
    const text = `<send_message to="Alice">${content}</send_message>`;
    expect(() => parse(text)).not.toThrow();
  });
});

// ── Extreme length responses ──────────────────────────────────────────────────

describe('xmlFallbackAdapter — extremely long responses', () => {
  it('100KB plain text + 1 XML action: action extracted, text remains', () => {
    const prose = 'x'.repeat(100 * 1024);
    const text = `${prose}<task_create subject="End task"/>`;

    const start = Date.now();
    const actions = parse(text);
    const elapsed = Date.now() - start;

    const taskActions = actions.filter((a) => a.type === 'task_create');
    expect(taskActions).toHaveLength(1);
    const plainActions = actions.filter((a) => a.type === 'plain_response');
    expect(plainActions).toHaveLength(1);
    // Performance: should complete within 500ms for 100KB
    expect(elapsed).toBeLessThan(500);
  });

  it('100KB text with XML action in the middle: action found at correct position', () => {
    const half = 'y'.repeat(50 * 1024);
    const text = `${half}<send_message to="Alice">midpoint message</send_message>${half}`;

    const actions = parse(text);
    const sendActions = actions.filter((a) => a.type === 'send_message');
    expect(sendActions).toHaveLength(1);
    expect(sendActions[0]).toMatchObject({ content: 'midpoint message' });
  });

  it('send_message with 50KB content body: content preserved without truncation', () => {
    const largeContent = 'z'.repeat(50 * 1024);
    const text = `<send_message to="Bob">${largeContent}</send_message>`;

    const actions = parse(text);
    const sendActions = actions.filter((a) => a.type === 'send_message');
    expect(sendActions).toHaveLength(1);
    expect((sendActions[0] as { content: string }).content).toHaveLength(50 * 1024);
  });

  it('100 XML actions spread across 100KB response: all actions parsed', () => {
    const chunk = '  narrative text  ';
    const parts: string[] = [];
    for (let i = 0; i < 100; i++) {
      parts.push(chunk.repeat(10)); // ~200 bytes between actions
      parts.push(`<task_create subject="Task ${i}"/>`);
    }
    const text = parts.join('');

    const actions = parse(text);
    const taskActions = actions.filter((a) => a.type === 'task_create');
    expect(taskActions).toHaveLength(100);
  });
});

// ── XML injection / security ──────────────────────────────────────────────────

describe('xmlFallbackAdapter — XML injection edge cases', () => {
  it('double-quotes in attribute value: stops at first closing quote', () => {
    // The regex `[^"]*` for attribute values terminates at first `"`
    // So `subject="foo"bar"` captures only `foo`
    const _actions = parse('<task_create subject="foo" bar"/>');
    // This may or may not parse depending on regex behavior — no crash is the goal
    expect(() => parse('<task_create subject="foo" bar"/>')).not.toThrow();
  });

  it('content with </send_message> lookalike in outer text: not confused', () => {
    const text = 'The tag </send_message> appears in text.\n<send_message to="Alice">actual content</send_message>';
    const actions = parse(text);
    const sendActions = actions.filter((a) => a.type === 'send_message');
    // The stray </send_message> in text should not confuse the regex
    // because there's no opening tag before it
    expect(sendActions).toHaveLength(1);
    expect(sendActions[0]).toMatchObject({ content: 'actual content' });
  });

  it('send_message content containing XML-like text: content preserved', () => {
    const content = 'Use <br/> tags and &amp; entities in HTML';
    const text = `<send_message to="Alice">${content}</send_message>`;
    const actions = parse(text);
    const sendAction = actions.find((a) => a.type === 'send_message');
    expect(sendAction).toMatchObject({ content });
  });

  it('completely empty response: returns empty actions array', () => {
    const actions = parse('');
    expect(actions).toHaveLength(0);
  });

  it('whitespace-only response: returns empty actions array', () => {
    const actions = parse('   \n\t\n   ');
    expect(actions).toHaveLength(0);
  });

  it('response with only XML comments (not valid actions): no actions parsed', () => {
    // XML comments are not valid action tags
    const actions = parse('<!-- This is a comment -->\n<!-- another comment -->');
    const nonPlain = actions.filter((a) => a.type !== 'plain_response');
    expect(nonPlain).toHaveLength(0);
  });
});

// ── removeXmlSpans correctness ────────────────────────────────────────────────

describe('xmlFallbackAdapter — span removal and plain_response extraction', () => {
  it('plain_response text is the exact complement of parsed XML spans', () => {
    const xmlPart = '<task_create subject="Work"/>';
    const plainPart = 'Some plain text before. ';
    const text = plainPart + xmlPart;

    const actions = parse(text);
    const plain = actions.find((a) => a.type === 'plain_response') as { content: string } | undefined;
    expect(plain?.content.trim()).toBe(plainPart.trim());
  });

  it('multiple spans removed: remaining text is accurate', () => {
    const text = 'Start. <task_create subject="A"/> Middle text. <task_create subject="B"/> End.';
    const actions = parse(text);
    const plain = actions.find((a) => a.type === 'plain_response') as { content: string } | undefined;
    expect(plain?.content).toContain('Start.');
    expect(plain?.content).toContain('Middle text.');
    expect(plain?.content).toContain('End.');
    // XML tags should not appear in the plain response
    expect(plain?.content).not.toContain('task_create');
  });

  it('all-XML response: no plain_response emitted', () => {
    const text = '<task_create subject="Only XML"/>';
    const actions = parse(text);
    const plain = actions.find((a) => a.type === 'plain_response');
    expect(plain).toBeUndefined();
  });
});
