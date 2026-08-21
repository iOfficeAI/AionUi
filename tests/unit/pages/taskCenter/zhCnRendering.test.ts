/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';

describe('task center zh-CN rendering', () => {
  it('loads zh-CN resources at startup even when global language is en-US', async () => {
    const i18nModule = await import('@/renderer/services/i18n');
    const i18n = i18nModule.default;
    expect(i18n).toBeDefined();
    // i18next should have zh-CN resources loaded synchronously at boot
    expect(i18n.hasLoadedNamespace('translation')).toBe(true);
  });

  it('resolves taskCenter.title to Chinese even when current language is en-US', async () => {
    const i18nModule = await import('@/renderer/services/i18n');
    const i18n = i18nModule.default;
    await i18n.changeLanguage('en-US');
    expect(i18n.t('taskCenter.title', { lng: 'zh-CN' })).toBe('任务中心');
  });
});