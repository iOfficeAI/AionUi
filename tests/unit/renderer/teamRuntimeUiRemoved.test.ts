import { describe, expect, it } from 'vitest';
import zhCNTeamLocale from '@/renderer/services/i18n/locales/zh-CN/team.json';

describe('team runtime UI removal', () => {
  it('does not keep team runtime notice translations in the renderer locale', () => {
    expect('runtime' in zhCNTeamLocale).toBe(false);
  });
});
