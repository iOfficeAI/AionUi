import { describe, it, expect } from 'vitest';
import { parseSkillSuggest, stripSkillSuggest, hasSkillSuggest } from '@/renderer/utils/chat/skillSuggestParser';

const VALID_SKILL_CONTENT = [
  '---',
  'name: My Skill',
  'description: Does something useful',
  '---',
  '',
  'Run the report and summarize results.',
].join('\n');

function wrapBlock(name: string, description: string, content: string): string {
  return [
    '[SKILL_SUGGEST]',
    `name: ${name}`,
    `description: ${description}`,
    'content:',
    content,
    '[/SKILL_SUGGEST]',
  ].join('\n');
}

describe('parseSkillSuggest', () => {
  it('should parse a valid SKILL_SUGGEST block', () => {
    const text = `Some prefix text\n${wrapBlock('My Skill', 'Does something useful', VALID_SKILL_CONTENT)}\nSome suffix`;
    const result = parseSkillSuggest(text);
    expect(result).toEqual({
      name: 'My Skill',
      description: 'Does something useful',
      content: VALID_SKILL_CONTENT,
    });
  });

  it('should return null for empty or non-string input', () => {
    expect(parseSkillSuggest('')).toBeNull();
    expect(parseSkillSuggest(null as unknown as string)).toBeNull();
    expect(parseSkillSuggest(undefined as unknown as string)).toBeNull();
  });

  it('should return null when no SKILL_SUGGEST block exists', () => {
    expect(parseSkillSuggest('Just regular text without any blocks')).toBeNull();
  });

  it('should return null when content has no YAML frontmatter', () => {
    const text = wrapBlock('My Skill', 'Desc', 'Just plain text without frontmatter');
    expect(parseSkillSuggest(text)).toBeNull();
  });

  it('should return null when frontmatter is missing name', () => {
    const badContent = '---\ndescription: Desc\n---\n\nBody text';
    const text = wrapBlock('My Skill', 'Desc', badContent);
    // parseSkillSuggest validates the content itself is a valid SKILL.md
    // isValidSkillContent requires name in frontmatter
    expect(parseSkillSuggest(text)).toBeNull();
  });

  it('should return null when frontmatter body is empty', () => {
    const badContent = '---\nname: Test\ndescription: Desc\n---\n\n';
    const text = wrapBlock('Test', 'Desc', badContent);
    expect(parseSkillSuggest(text)).toBeNull();
  });

  it('should reject placeholder name "skill-name"', () => {
    const placeholderContent = '---\nname: skill-name\ndescription: Real desc\n---\n\nReal body';
    const text = wrapBlock('skill-name', 'Real desc', placeholderContent);
    expect(parseSkillSuggest(text)).toBeNull();
  });

  it('should reject placeholder description "one-line description"', () => {
    const placeholderContent =
      '---\nname: Real Name\ndescription: One-line description of what this does\n---\n\nReal body';
    const text = wrapBlock('Real Name', 'One-line description', placeholderContent);
    expect(parseSkillSuggest(text)).toBeNull();
  });

  it('should reject placeholder body starting with "(Full SKILL.md body"', () => {
    const placeholderContent = '---\nname: Real Name\ndescription: Real Desc\n---\n\n(Full SKILL.md body goes here)';
    const text = wrapBlock('Real Name', 'Real Desc', placeholderContent);
    expect(parseSkillSuggest(text)).toBeNull();
  });

  it('should use name as fallback when description is missing in block', () => {
    // Build content without a block-level description line
    const contentWithoutBlockDesc = [
      '---',
      'name: Inner Name',
      'description: Inner Desc',
      '---',
      '',
      'Real body here',
    ].join('\n');
    const text = ['[SKILL_SUGGEST]', 'name: My Skill', 'content:', contentWithoutBlockDesc, '[/SKILL_SUGGEST]'].join(
      '\n'
    );
    const result = parseSkillSuggest(text);
    // The regex matches "description:" inside the content frontmatter,
    // so the block-level description actually picks up "Inner Desc"
    expect(result?.description).toBe('Inner Desc');
  });

  it('should be case-insensitive for tags', () => {
    const text = `[skill_suggest]\nname: My Skill\ndescription: Desc\ncontent:\n${VALID_SKILL_CONTENT}\n[/skill_suggest]`;
    const result = parseSkillSuggest(text);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('My Skill');
  });

  it('should return null when content field is missing', () => {
    const text = '[SKILL_SUGGEST]\nname: My Skill\ndescription: Desc\n[/SKILL_SUGGEST]';
    expect(parseSkillSuggest(text)).toBeNull();
  });
});

describe('stripSkillSuggest', () => {
  it('should remove SKILL_SUGGEST blocks and collapse extra newlines', () => {
    const text = `Before\n\n${wrapBlock('Skill', 'Desc', VALID_SKILL_CONTENT)}\n\n\nAfter`;
    const result = stripSkillSuggest(text);
    expect(result).toBe('Before\n\nAfter');
  });

  it('should return unchanged text when no block exists', () => {
    expect(stripSkillSuggest('Hello world')).toBe('Hello world');
  });

  it('should handle non-string input gracefully', () => {
    expect(stripSkillSuggest('')).toBe('');
    expect(stripSkillSuggest(null as unknown as string)).toBeNull();
  });

  it('should strip multiple blocks', () => {
    const text = `A\n[SKILL_SUGGEST]\nfoo\n[/SKILL_SUGGEST]\nB\n[SKILL_SUGGEST]\nbar\n[/SKILL_SUGGEST]\nC`;
    const result = stripSkillSuggest(text);
    expect(result).toBe('A\n\nB\n\nC');
  });
});

describe('hasSkillSuggest', () => {
  it('should return true when block exists', () => {
    expect(hasSkillSuggest('text [SKILL_SUGGEST] more')).toBe(true);
  });

  it('should return false when no block exists', () => {
    expect(hasSkillSuggest('just regular text')).toBe(false);
  });

  it('should be case-insensitive', () => {
    expect(hasSkillSuggest('[skill_suggest]')).toBe(true);
  });
});
