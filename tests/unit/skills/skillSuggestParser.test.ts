/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for renderer/utils/chat/skillSuggestParser.ts (SK1 in N4a).
 * Tests SKILL_SUGGEST block parsing, validation, and placeholder rejection.
 */

import { describe, it, expect } from 'vitest';
import { parseSkillSuggest, stripSkillSuggest, hasSkillSuggest } from '@/renderer/utils/chat/skillSuggestParser';

describe('skillSuggestParser', () => {
  const validSkillMd = `---
name: MySkill
description: A valid skill
---

This is the skill body with instructions.`;

  const validSuggestion = `[SKILL_SUGGEST]
name: MySkill
description: A test skill
content:
${validSkillMd}
[/SKILL_SUGGEST]`;

  describe('parseSkillSuggest', () => {
    it('parses valid SKILL_SUGGEST block', () => {
      const result = parseSkillSuggest(validSuggestion);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('MySkill');
      expect(result?.description).toBe('A test skill');
      expect(result?.content).toContain('skill body');
    });

    it('returns null for invalid input', () => {
      expect(parseSkillSuggest('')).toBeNull();
      expect(parseSkillSuggest('no block here')).toBeNull();
      expect(parseSkillSuggest(null as any)).toBeNull();
    });

    it('rejects placeholder names (skill-name)', () => {
      const placeholder = `[SKILL_SUGGEST]
name: skill-name
description: desc
content:
---
name: skill-name
description: placeholder
---
body
[/SKILL_SUGGEST]`;
      expect(parseSkillSuggest(placeholder)).toBeNull();
    });

    it('rejects placeholder descriptions (one-line description)', () => {
      const placeholder = `[SKILL_SUGGEST]
name: ValidName
description: one-line description
content:
---
name: ValidName
description: one-line description
---
body
[/SKILL_SUGGEST]`;
      expect(parseSkillSuggest(placeholder)).toBeNull();
    });

    it('rejects malformed frontmatter (missing name or description)', () => {
      const malformed = `[SKILL_SUGGEST]
name: Test
content:
---
description: only desc
---
body
[/SKILL_SUGGEST]`;
      expect(parseSkillSuggest(malformed)).toBeNull();
    });

    it('rejects empty body in content', () => {
      const emptyBody = `[SKILL_SUGGEST]
name: Test
content:
---
name: Test
description: desc
---
[/SKILL_SUGGEST]`;
      expect(parseSkillSuggest(emptyBody)).toBeNull();
    });
  });

  describe('stripSkillSuggest', () => {
    it('removes SKILL_SUGGEST blocks from text', () => {
      const input = `Before block\n${validSuggestion}\nAfter block`;
      const result = stripSkillSuggest(input);
      expect(result).not.toContain('[SKILL_SUGGEST]');
      expect(result).toContain('Before block');
      expect(result).toContain('After block');
    });

    it('handles multiple blocks', () => {
      const input = `${validSuggestion}\n${validSuggestion}`;
      const result = stripSkillSuggest(input);
      expect(result).not.toContain('[SKILL_SUGGEST]');
    });

    it('returns original text if no blocks', () => {
      const input = 'Just plain text';
      expect(stripSkillSuggest(input)).toBe(input);
    });
  });

  describe('hasSkillSuggest', () => {
    it('returns true if text contains [SKILL_SUGGEST]', () => {
      expect(hasSkillSuggest(validSuggestion)).toBe(true);
      expect(hasSkillSuggest('[SKILL_SUGGEST] partial')).toBe(true);
    });

    it('returns false if no block present', () => {
      expect(hasSkillSuggest('plain text')).toBe(false);
      expect(hasSkillSuggest('')).toBe(false);
    });
  });
});
