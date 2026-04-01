import { describe, expect, it } from 'vitest';
import { buildCronSkillContent, parseCronSkillContent } from '@/process/services/cron/cronSkillFile';

describe('buildCronSkillContent', () => {
  it('builds correct YAML frontmatter format', () => {
    const result = buildCronSkillContent('Test Job', 'A test description', 'Do something');
    expect(result).toBe('---\nname: Test Job\ndescription: A test description\n---\n\nDo something');
  });

  it('sanitizes description by removing line breaks', () => {
    const result = buildCronSkillContent('Test', 'Line 1\nLine 2\r\nLine 3', 'Prompt');
    expect(result).toContain('description: Line 1 Line 2 Line 3');
  });

  it('handles empty prompt', () => {
    const result = buildCronSkillContent('Test', 'Description', '');
    expect(result).toBe('---\nname: Test\ndescription: Description\n---\n\n');
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
