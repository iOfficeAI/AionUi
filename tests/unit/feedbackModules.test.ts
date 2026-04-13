import { describe, it, expect } from 'vitest';
import { FEEDBACK_MODULES } from '@renderer/components/settings/SettingsModal/contents/feedbackModules';

describe('FEEDBACK_MODULES', () => {
  it('should have 15 module options', () => {
    expect(FEEDBACK_MODULES).toHaveLength(15);
  });

  it('should have unique tag values', () => {
    const tags = FEEDBACK_MODULES.map((m) => m.tag);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('should have unique i18n keys', () => {
    const keys = FEEDBACK_MODULES.map((m) => m.i18nKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('should have unique description i18n keys', () => {
    const keys = FEEDBACK_MODULES.map((m) => m.descriptionI18nKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('should include "other" as the last option', () => {
    const last = FEEDBACK_MODULES[FEEDBACK_MODULES.length - 1];
    expect(last.tag).toBe('other');
  });

  it('should include dedicated buckets for agent detection and history related issues', () => {
    const tags = FEEDBACK_MODULES.map((m) => m.tag);
    expect(tags).toContain('agent-detection');
    expect(tags).toContain('search-history');
    expect(tags).toContain('webui-remote');
  });
});
