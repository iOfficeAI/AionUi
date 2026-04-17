import { describe, expect, it } from 'vitest';
import { detectCronCommands, hasCronCommands, stripCronCommands } from '@/process/task/CronCommandDetector';

describe('detectCronCommands - CRON_CREATE', () => {
  it('detects a complete CRON_CREATE block', () => {
    const content = `[CRON_CREATE]
name: Daily Reminder
schedule: 0 9 * * *
schedule_description: Every day at 9:00 AM
message: Reply with a friendly morning reminder
[/CRON_CREATE]`;
    const commands = detectCronCommands(content);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      kind: 'create',
      name: 'Daily Reminder',
      schedule: '0 9 * * *',
      scheduleDescription: 'Every day at 9:00 AM',
      message: 'Reply with a friendly morning reminder',
    });
  });

  it('detects CRON_CREATE with surrounding text', () => {
    const content = `Sure! I'll create a scheduled task for you.

[CRON_CREATE]
name: Water Reminder
schedule: 0 */2 * * *
schedule_description: Every 2 hours
message: Reply with a reminder to drink water
[/CRON_CREATE]

The task has been set up!`;
    const commands = detectCronCommands(content);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      kind: 'create',
      name: 'Water Reminder',
      schedule: '0 */2 * * *',
      scheduleDescription: 'Every 2 hours',
      message: 'Reply with a reminder to drink water',
    });
  });

  it('detects fallback CRON_CREATE without closing tag', () => {
    const content = `[CRON_CREATE]
name: Broken Tag
schedule: 0 9 * * MON
schedule_description: Every Monday at 9:00 AM
message: This block was not closed`;
    const commands = detectCronCommands(content);
    expect(commands).toHaveLength(1);
    expect(commands[0]!.kind).toBe('create');
    expect(commands[0]).toHaveProperty('name', 'Broken Tag');
  });

  it('rejects CRON_CREATE with missing required fields', () => {
    const content = `[CRON_CREATE]
name: Incomplete
schedule: 0 9 * * *
[/CRON_CREATE]`;
    const commands = detectCronCommands(content);
    expect(commands).toHaveLength(0);
  });
});

describe('detectCronCommands - CRON_LIST', () => {
  it('detects CRON_LIST', () => {
    const content = 'Let me check your tasks [CRON_LIST]';
    const commands = detectCronCommands(content);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({ kind: 'list' });
  });

  it('detects case-insensitive CRON_LIST', () => {
    expect(detectCronCommands('[cron_list]')).toHaveLength(1);
    expect(detectCronCommands('[Cron_List]')).toHaveLength(1);
  });
});

describe('detectCronCommands - CRON_UPDATE', () => {
  it('detects CRON_UPDATE with job ID and body', () => {
    const content = `[CRON_UPDATE: cron_abc123]
name: Updated Reminder
schedule: 0 10 * * *
schedule_description: Every day at 10:00 AM
message: Reply with an updated reminder
[/CRON_UPDATE]`;
    const commands = detectCronCommands(content);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({
      kind: 'update',
      jobId: 'cron_abc123',
      name: 'Updated Reminder',
      schedule: '0 10 * * *',
      scheduleDescription: 'Every day at 10:00 AM',
      message: 'Reply with an updated reminder',
    });
  });

  it('rejects CRON_UPDATE with missing required fields', () => {
    const content = `[CRON_UPDATE: cron_abc123]
name: Updated Reminder
[/CRON_UPDATE]`;
    const commands = detectCronCommands(content);
    expect(commands).toHaveLength(0);
  });
});

describe('detectCronCommands - CRON_DELETE ignored', () => {
  it('ignores CRON_DELETE with valid ID', () => {
    const commands = detectCronCommands('[CRON_DELETE: cron_abc123]');
    expect(commands).toHaveLength(0);
  });

  it('ignores CRON_DELETE with placeholder ID', () => {
    const placeholders = ['[CRON_DELETE: task-id]', '[CRON_DELETE: xxx]', '[CRON_DELETE: 任务ID]'];
    for (const placeholder of placeholders) {
      expect(detectCronCommands(placeholder)).toHaveLength(0);
    }
  });

  it('does not strip CRON_DELETE from content', () => {
    const content = 'Before [CRON_DELETE: cron_123] After';
    expect(stripCronCommands(content)).toBe(content);
  });
});

describe('detectCronCommands - code blocks', () => {
  it('ignores commands inside fenced code blocks', () => {
    const content = `Here's how to use it:
\`\`\`
[CRON_CREATE]
name: Example
schedule: 0 9 * * *
schedule_description: Daily
message: Test
[/CRON_CREATE]
\`\`\``;
    expect(detectCronCommands(content)).toHaveLength(0);
  });

  it('detects commands outside code blocks when code blocks also present', () => {
    const content = `\`\`\`
[CRON_LIST]
\`\`\`

[CRON_LIST]`;
    const commands = detectCronCommands(content);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({ kind: 'list' });
  });
});

describe('detectCronCommands - edge cases', () => {
  it('returns empty for null/undefined/empty input', () => {
    expect(detectCronCommands('')).toHaveLength(0);
    expect(detectCronCommands(null as unknown as string)).toHaveLength(0);
    expect(detectCronCommands(undefined as unknown as string)).toHaveLength(0);
  });

  it('detects multiple commands in one message', () => {
    const content = `[CRON_LIST]
[CRON_CREATE]
name: Task
schedule: 0 9 * * *
schedule_description: Daily
message: Do something
[/CRON_CREATE]`;
    const commands = detectCronCommands(content);
    expect(commands.some((c) => c.kind === 'list')).toBe(true);
    expect(commands.some((c) => c.kind === 'create')).toBe(true);
  });
});

describe('hasCronCommands', () => {
  it('returns true for supported commands', () => {
    expect(hasCronCommands('[CRON_LIST]')).toBe(true);
    expect(hasCronCommands('[CRON_CREATE]...[/CRON_CREATE]')).toBe(true);
    expect(hasCronCommands('[CRON_UPDATE: id]...[/CRON_UPDATE]')).toBe(true);
  });

  it('returns false for CRON_DELETE (no longer supported)', () => {
    expect(hasCronCommands('[CRON_DELETE: 123]')).toBe(false);
  });

  it('returns false for content without cron commands', () => {
    expect(hasCronCommands('Just plain text')).toBe(false);
    expect(hasCronCommands('')).toBe(false);
    expect(hasCronCommands(null as unknown as string)).toBe(false);
  });
});

describe('stripCronCommands', () => {
  it('strips CRON_CREATE blocks', () => {
    const content = `Before
[CRON_CREATE]
name: Test
schedule: 0 9 * * *
schedule_description: Daily
message: Test
[/CRON_CREATE]
After`;
    expect(stripCronCommands(content)).toBe('Before\n\nAfter');
  });

  it('strips CRON_UPDATE blocks', () => {
    const content = `Before
[CRON_UPDATE: cron_123]
name: Updated
schedule: 0 10 * * *
schedule_description: Daily at 10
message: Updated message
[/CRON_UPDATE]
After`;
    expect(stripCronCommands(content)).toBe('Before\n\nAfter');
  });

  it('strips CRON_LIST', () => {
    const content = 'Before [CRON_LIST] After';
    expect(stripCronCommands(content)).toBe('Before  After');
  });

  it('leaves CRON_DELETE untouched', () => {
    const content = 'Before [CRON_DELETE: cron_123] After';
    expect(stripCronCommands(content)).toBe(content);
  });

  it('collapses multiple newlines after stripping', () => {
    const content = 'Line 1\n\n\n\n[CRON_LIST]\n\n\n\nLine 2';
    expect(stripCronCommands(content)).toBe('Line 1\n\nLine 2');
  });

  it('handles null/undefined input gracefully', () => {
    expect(stripCronCommands(null as unknown as string)).toBe(null);
    expect(stripCronCommands(undefined as unknown as string)).toBe(undefined);
  });
});
