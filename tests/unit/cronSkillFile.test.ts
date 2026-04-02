import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildCronSkillContent,
  parseCronSkillContent,
  validateSkillContent,
  writeRawCronSkillFile,
} from '@/process/services/cron/cronSkillFile';

describe('buildCronSkillContent', () => {
  it('builds correct YAML frontmatter format', () => {
    const result = buildCronSkillContent('Test Job', 'A test description', 'Do something');
    expect(result).toContain('---\nname: Test Job\ndescription: A test description\n---');
    expect(result).toContain('This is a scheduled task: **Test Job**');
    expect(result).toContain('## Instructions');
    expect(result).toContain('Do something');
  });

  it('sanitizes description by removing line breaks', () => {
    const result = buildCronSkillContent('Test', 'Line 1\nLine 2\r\nLine 3', 'Prompt');
    expect(result).toContain('description: Line 1 Line 2 Line 3');
  });

  it('handles empty prompt', () => {
    const result = buildCronSkillContent('Test', 'Description', '');
    expect(result).toContain('---\nname: Test\ndescription: Description\n---');
    expect(result).toContain('## Instructions');
    // Prompt is empty, but the instructions template is still present
    expect(result).toContain('This is a scheduled task: **Test**');
  });

  it('preserves prompt with multiple paragraphs', () => {
    const prompt = 'First paragraph\n\nSecond paragraph';
    const result = buildCronSkillContent('Test', 'Desc', prompt);
    expect(result).toContain('First paragraph\n\nSecond paragraph');
  });
});

describe('parseCronSkillContent', () => {
  it('parses valid skill content', () => {
    const content = '---\nname: Test Job\ndescription: A test description\n---\n\nDo something';
    const result = parseCronSkillContent(content);
    expect(result).toEqual({
      name: 'Test Job',
      description: 'A test description',
      prompt: 'Do something',
    });
  });

  it('trims leading/trailing whitespace from fields', () => {
    const content = '---\nname:   Spaced Name  \ndescription:   Spaced Desc  \n---\n\n  Prompt with spaces  ';
    const result = parseCronSkillContent(content);
    expect(result?.name).toBe('Spaced Name');
    expect(result?.description).toBe('Spaced Desc');
    // prompt is trimmed at end but not start (per trimEnd)
    expect(result?.prompt).toBe('  Prompt with spaces');
  });

  it('handles multi-line prompt', () => {
    const content = '---\nname: Test\ndescription: Desc\n---\n\nLine 1\nLine 2\n\nLine 3';
    const result = parseCronSkillContent(content);
    expect(result?.prompt).toBe('Line 1\nLine 2\n\nLine 3');
  });

  it('returns null for missing frontmatter', () => {
    const content = 'Just a plain text without frontmatter';
    const result = parseCronSkillContent(content);
    expect(result).toBeNull();
  });

  it('returns null for missing name field', () => {
    const content = '---\ndescription: Desc\n---\n\nPrompt';
    const result = parseCronSkillContent(content);
    expect(result).toBeNull();
  });

  it('returns null for missing description field', () => {
    const content = '---\nname: Test\n---\n\nPrompt';
    const result = parseCronSkillContent(content);
    expect(result).toBeNull();
  });

  it('handles empty prompt body', () => {
    const content = '---\nname: Test\ndescription: Desc\n---\n\n';
    const result = parseCronSkillContent(content);
    expect(result).toEqual({
      name: 'Test',
      description: 'Desc',
      prompt: '',
    });
  });

  it('handles Windows line endings (CRLF)', () => {
    // The regex pattern requires Unix-style line endings in frontmatter delimiters
    // Mixed CRLF content is acceptable as long as delimiter uses \n
    const content = '---\nname: Test Job\r\ndescription: A test description\r\n---\n\nDo something';
    const result = parseCronSkillContent(content);
    expect(result).toEqual({
      name: 'Test Job',
      description: 'A test description',
      prompt: 'Do something',
    });
  });

  it('handles extra whitespace between frontmatter and prompt', () => {
    // The regex pattern \n+ consumes all newlines after closing ---
    // So extra newlines are consumed by the pattern, not included in prompt
    const content = '---\nname: Test\ndescription: Desc\n---\n\n\n\nPrompt starts here';
    const result = parseCronSkillContent(content);
    // All newlines after --- are consumed by \n+ pattern
    expect(result?.prompt).toBe('Prompt starts here');
  });
});

describe('buildCronSkillContent and parseCronSkillContent roundtrip', () => {
  it('roundtrips correctly', () => {
    const name = 'My Job';
    const description = 'My Description';
    const prompt = 'My Prompt\n\nWith multiple lines';

    const built = buildCronSkillContent(name, description, prompt);
    const parsed = parseCronSkillContent(built);

    expect(parsed).toEqual({ name, description, prompt });
  });
});

describe('buildCronSkillContent with scheduleDescription', () => {
  it('includes schedule info in output when provided', () => {
    const result = buildCronSkillContent('Daily Report', 'Generate daily report', 'Run report', 'Every day at 9am');
    expect(result).toContain('Schedule: Every day at 9am');
    expect(result).toContain('This is a scheduled task: **Daily Report**');
  });

  it('omits schedule line when undefined', () => {
    const result = buildCronSkillContent('Daily Report', 'Generate daily report', 'Run report');
    expect(result).not.toContain('Schedule:');
  });
});

describe('validateSkillContent', () => {
  it('returns { name, description, body } for valid content', () => {
    const content = '---\nname: My Task\ndescription: Runs a daily check\n---\n\nCheck all systems and report status.';
    const result = validateSkillContent(content);
    expect(result).toEqual({
      name: 'My Task',
      description: 'Runs a daily check',
      body: 'Check all systems and report status.',
    });
  });

  it('returns null for missing frontmatter', () => {
    const content = 'Just plain text without frontmatter delimiters';
    expect(validateSkillContent(content)).toBeNull();
  });

  it('returns null for missing name', () => {
    const content = '---\ndescription: Some description\n---\n\nBody content here';
    expect(validateSkillContent(content)).toBeNull();
  });

  it('returns null for missing description', () => {
    const content = '---\nname: Some Name\n---\n\nBody content here';
    expect(validateSkillContent(content)).toBeNull();
  });

  it('returns null for empty body', () => {
    const content = '---\nname: Task\ndescription: Desc\n---\n\n   ';
    expect(validateSkillContent(content)).toBeNull();
  });

  it('returns null for placeholder name "skill-name"', () => {
    const content = '---\nname: skill-name\ndescription: A real description\n---\n\nReal body content';
    expect(validateSkillContent(content)).toBeNull();
  });

  it('returns null for placeholder description "one-line description"', () => {
    const content = '---\nname: Real Name\ndescription: one-line description of the task\n---\n\nReal body content';
    expect(validateSkillContent(content)).toBeNull();
  });

  it('returns null for placeholder body "(Full SKILL.md body..."', () => {
    const content =
      '---\nname: Real Name\ndescription: Real description\n---\n\n(Full SKILL.md body with instructions)';
    expect(validateSkillContent(content)).toBeNull();
  });

  it('returns null for non-string input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(validateSkillContent(undefined as any)).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(validateSkillContent(null as any)).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(validateSkillContent(123 as any)).toBeNull();
  });

  it('returns null for empty string input', () => {
    expect(validateSkillContent('')).toBeNull();
  });
});

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  getCronSkillsDir: () => '/mock/cron-skills',
}));

describe('writeRawCronSkillFile', () => {
  it('writes valid content and returns file path', async () => {
    const fs = (await import('fs/promises')).default;
    const content = '---\nname: My Task\ndescription: A real task\n---\n\nDo the thing.';
    const result = await writeRawCronSkillFile('job-123', content);
    const expectedDir = path.join('/mock/cron-skills', 'job-123');
    const expectedFile = path.join(expectedDir, 'SKILL.md');
    expect(result).toBe(expectedFile);
    expect(fs.mkdir).toHaveBeenCalledWith(expectedDir, { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith(expectedFile, content, 'utf-8');
  });

  it('throws for invalid content', async () => {
    await expect(writeRawCronSkillFile('job-456', 'not valid')).rejects.toThrow(
      'Invalid SKILL.md content: must have YAML frontmatter with name/description and a non-empty body'
    );
  });
});
