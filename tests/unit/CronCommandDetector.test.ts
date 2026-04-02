import { describe, expect, it } from 'vitest';
import { detectCronCommands, hasCronCommands, stripCronCommands } from '@/process/task/CronCommandDetector';

describe('detectCronCommands - existing functionality', () => {
  it('detects CRON_LIST', () => {
    const content = 'Please show me all tasks [CRON_LIST]';
    const commands = detectCronCommands(content);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({ kind: 'list' });
  });

  it('detects CRON_DELETE with valid ID', () => {
    const content = '[CRON_DELETE: job-123-abc]';
    const commands = detectCronCommands(content);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({ kind: 'delete', jobId: 'job-123-abc' });
  });

  it('ignores CRON_DELETE with placeholder ID', () => {
    const placeholders = ['[CRON_DELETE: task-id]', '[CRON_DELETE: xxx]', '[CRON_DELETE: 任务ID]'];
    for (const placeholder of placeholders) {
      const commands = detectCronCommands(placeholder);
      expect(commands).toHaveLength(0);
    }
  });

  it('ignores commands inside code blocks', () => {
    const content = `
Here's how to use it:
\`\`\`
[CRON_CREATE]
name: Example
schedule: 0 9 * * *
schedule_description: Daily
prompt: Test
[/CRON_CREATE]
\`\`\`
`;
    const commands = detectCronCommands(content);
    expect(commands).toHaveLength(0);
  });
});

describe('hasCronCommands', () => {
  it('returns true for content with cron commands', () => {
    expect(hasCronCommands('[CRON_LIST]')).toBe(true);
    expect(hasCronCommands('[CRON_CREATE]...[/CRON_CREATE]')).toBe(true);
    expect(hasCronCommands('[CRON_DELETE: 123]')).toBe(true);
  });

  it('returns false for content without cron commands', () => {
    expect(hasCronCommands('Just plain text')).toBe(false);
    expect(hasCronCommands('')).toBe(false);
  });
});

describe('stripCronCommands', () => {
  it('removes cron command blocks', () => {
    const content = `Before
[CRON_CREATE]
name: Test
schedule: 0 9 * * *
schedule_description: Daily
prompt: Test
[/CRON_CREATE]
After`;
    const result = stripCronCommands(content);
    expect(result).toBe('Before\n\nAfter');
  });

  it('collapses multiple newlines', () => {
    const content = 'Line 1\n\n\n\n[CRON_LIST]\n\n\n\nLine 2';
    const result = stripCronCommands(content);
    expect(result).toBe('Line 1\n\nLine 2');
  });
});
