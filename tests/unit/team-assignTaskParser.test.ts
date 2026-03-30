// tests/unit/team-assignTaskParser.test.ts
import { describe, it, expect } from 'vitest';
import { parseAssignTasks, buildResultInjection, buildDispatchSystemPrompt } from '@process/team/assignTaskParser';

describe('parseAssignTasks', () => {
  it('parses a single assignment', () => {
    const text = 'Sure, I will delegate this.\n<assign_task agent="slot-1">\nAnalyse the code\n</assign_task>';
    const tasks = parseAssignTasks(text);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].slotId).toBe('slot-1');
    expect(tasks[0].prompt.trim()).toBe('Analyse the code');
  });

  it('parses multiple assignments', () => {
    const text = `
<assign_task agent="slot-1">
Task A
</assign_task>
<assign_task agent="slot-2">
Task B
</assign_task>`;
    const tasks = parseAssignTasks(text);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].slotId).toBe('slot-1');
    expect(tasks[1].slotId).toBe('slot-2');
  });

  it('returns empty array when no assignments present', () => {
    const text = 'Here is a direct answer to your question.';
    expect(parseAssignTasks(text)).toHaveLength(0);
  });

  it('handles multiline prompts', () => {
    const text = '<assign_task agent="slot-3">\nLine 1\nLine 2\nLine 3\n</assign_task>';
    const tasks = parseAssignTasks(text);
    expect(tasks[0].prompt).toContain('Line 1');
    expect(tasks[0].prompt).toContain('Line 3');
  });
});

describe('buildResultInjection', () => {
  it('builds a result injection message', () => {
    const msg = buildResultInjection('slot-1', 'Task completed successfully');
    expect(msg).toContain('[Task Result from slot-1]');
    expect(msg).toContain('Task completed successfully');
    expect(msg).toContain('[/Task Result]');
  });
});

describe('buildDispatchSystemPrompt', () => {
  it('includes all sub-agent slotIds and names', () => {
    const agents = [
      { slotId: 'slot-1', agentName: 'Gemini', agentType: 'gemini' },
      { slotId: 'slot-2', agentName: 'Claude', agentType: 'acp' },
    ];
    const prompt = buildDispatchSystemPrompt(agents);
    expect(prompt).toContain('slot-1');
    expect(prompt).toContain('Gemini');
    expect(prompt).toContain('slot-2');
    expect(prompt).toContain('Claude');
    expect(prompt).toContain('<assign_task');
  });
});
