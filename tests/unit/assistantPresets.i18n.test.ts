import { describe, expect, it } from 'vitest';
import { ASSISTANT_PRESETS } from '../../src/common/config/presets/assistantPresets';

describe('assistant preset ru-RU coverage', () => {
  it('every preset with a ru-RU name also has a ru-RU description', () => {
    const missing = ASSISTANT_PRESETS.filter(
      (preset) => preset.nameI18n['ru-RU'] && !preset.descriptionI18n['ru-RU']
    ).map((preset) => preset.id);

    expect(missing).toEqual([]);
  });
});
