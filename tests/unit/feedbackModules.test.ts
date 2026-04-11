import { describe, it, expect } from 'vitest';
import { FEEDBACK_MODULES } from '@renderer/components/settings/SettingsModal/contents/feedbackModules';

describe('FEEDBACK_MODULES', () => {
  it('should have 18 module options', () => {
    expect(FEEDBACK_MODULES).toHaveLength(18);
  });

  it('should have unique tag values', () => {
    const tags = FEEDBACK_MODULES.map((m) => m.tag);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('should have unique i18n keys', () => {
    const keys = FEEDBACK_MODULES.map((m) => m.i18nKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('should include "other" as the last option', () => {
    const last = FEEDBACK_MODULES[FEEDBACK_MODULES.length - 1];
    expect(last.tag).toBe('other');
  });
});
