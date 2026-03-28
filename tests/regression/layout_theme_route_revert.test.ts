import { describe, it, expect } from 'vitest';
import { BACKGROUND_BLOCK_START } from '@/renderer/pages/settings/DisplaySettings/backgroundUtils';
import {
  CSS_SYNC_RECENT_UPDATE_WINDOW_MS,
  computeCssSyncDecision,
  resolveCssByActiveTheme,
} from '@/renderer/utils/theme/themeCssSync';

const NEW_CSS = '.new-theme-flag { color: rgb(1, 2, 3); }';
const OLD_CSS = '.old-theme-flag { color: rgb(3, 2, 1); }';

describe('layout css sync decision', () => {
  it('heals stale customCss from active theme mapping', () => {
    const decision = computeCssSyncDecision({
      savedCss: OLD_CSS,
      activeThemeId: 'new-theme',
      savedThemes: [
        {
          id: 'new-theme',
          name: 'New Theme',
          css: NEW_CSS,
          isPreset: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      currentUiCss: NEW_CSS,
      lastUiCssUpdateAt: 0,
      now: Date.now(),
    });

    expect(decision.shouldSkipApply).toBe(false);
    expect(decision.shouldHealStorage).toBe(true);
    expect(decision.effectiveCss).toContain('.new-theme-flag');
  });

  it('skips stale storage apply immediately after UI theme update', () => {
    const now = Date.now();
    const decision = computeCssSyncDecision({
      savedCss: OLD_CSS,
      activeThemeId: '',
      savedThemes: [],
      currentUiCss: NEW_CSS,
      lastUiCssUpdateAt: now - 100,
      now,
    });

    expect(decision.shouldSkipApply).toBe(true);
    expect(decision.shouldHealStorage).toBe(false);
  });

  it('allows storage apply after recent-update window expires', () => {
    const now = Date.now();
    const decision = computeCssSyncDecision({
      savedCss: OLD_CSS,
      activeThemeId: '',
      savedThemes: [],
      currentUiCss: NEW_CSS,
      lastUiCssUpdateAt: now - CSS_SYNC_RECENT_UPDATE_WINDOW_MS - 10,
      now,
    });

    expect(decision.shouldSkipApply).toBe(false);
    expect(decision.shouldHealStorage).toBe(false);
    expect(decision.effectiveCss).toContain('.old-theme-flag');
  });

  it('keeps background block for cover themes when resolving active theme css', () => {
    const resolved = resolveCssByActiveTheme('cover-theme', [
      {
        id: 'cover-theme',
        name: 'Cover Theme',
        css: '.cover-theme-flag { color: #123456; }',
        cover: 'data:image/png;base64,abc',
        isPreset: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);

    expect(resolved).toContain('.cover-theme-flag');
    expect(resolved).toContain(BACKGROUND_BLOCK_START);
    expect(resolved).toContain('background-image');
  });
});
