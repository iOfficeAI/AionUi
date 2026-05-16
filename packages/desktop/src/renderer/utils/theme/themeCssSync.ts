import { type ICssTheme } from '@/common/config/storage';
import {
  BACKGROUND_BLOCK_START,
  injectBackgroundCssBlock,
} from '@renderer/pages/settings/DisplaySettings/backgroundUtils';
import { DEFAULT_THEME_ID, PRESET_THEMES } from '@renderer/pages/settings/DisplaySettings/presets';

export const CSS_SYNC_RECENT_UPDATE_WINDOW_MS = 2000;

/**
 * Extension themes cache.
 * Populated by CssThemeSettings when it loads extension themes from main process.
 * This avoids requiring async IPC calls in the sync resolution path.
 */
let extensionThemesCache: ICssTheme[] = [];

/** Update the extension themes cache (called by CssThemeSettings after loading) */
export const setExtensionThemesCache = (themes: ICssTheme[]): void => {
  extensionThemesCache = themes;
};

/** Get the current extension themes cache */
export const getExtensionThemesCache = (): ICssTheme[] => extensionThemesCache;

type ComputeCssSyncDecisionParams = {
  savedCss: string;
  activeThemeId: string;
  savedThemes: ICssTheme[];
  currentUiCss: string;
  lastUiCssUpdateAt: number;
  now?: number;
};

type ComputeCssSyncDecisionResult = {
  shouldSkipApply: boolean;
  shouldHealStorage: boolean;
  effectiveCss: string;
};

export const resolveCssByActiveTheme = (activeThemeId: string, userThemes: ICssTheme[]): string => {
  const ensureBackgroundCss = (theme: ICssTheme): ICssTheme => {
    if (theme.id === DEFAULT_THEME_ID) return theme;
    if (theme.cover && theme.css && !theme.css.includes(BACKGROUND_BLOCK_START)) {
      return {
        ...theme,
        css: injectBackgroundCssBlock(theme.css, theme.cover),
      };
    }
    return theme;
  };

  const allThemes = [
    ...PRESET_THEMES.map(ensureBackgroundCss),
    ...extensionThemesCache.map(ensureBackgroundCss),
    ...(userThemes || []).map(ensureBackgroundCss),
  ];
  const resolvedId = activeThemeId || DEFAULT_THEME_ID;
  const match = allThemes.find((theme) => theme.id === resolvedId);
  if (match) return match.css || '';
  // Theme not found (e.g., extension removed) → fall back to default theme
  if (resolvedId !== DEFAULT_THEME_ID) {
    return allThemes.find((theme) => theme.id === DEFAULT_THEME_ID)?.css || '';
  }
  return '';
};

export const computeCssSyncDecision = ({
  savedCss,
  activeThemeId,
  savedThemes,
  currentUiCss,
  lastUiCssUpdateAt,
  now = Date.now(),
}: ComputeCssSyncDecisionParams): ComputeCssSyncDecisionResult => {
  const normalizedSavedCss = savedCss || '';
  const expectedCss = resolveCssByActiveTheme(activeThemeId || '', savedThemes || []);

  if (Boolean(activeThemeId) && normalizedSavedCss !== expectedCss) {
    return {
      shouldSkipApply: false,
      shouldHealStorage: true,
      effectiveCss: expectedCss,
    };
  }

  const recentUiUpdate = now - lastUiCssUpdateAt < CSS_SYNC_RECENT_UPDATE_WINDOW_MS;
  if (recentUiUpdate && currentUiCss && normalizedSavedCss !== currentUiCss) {
    return {
      shouldSkipApply: true,
      shouldHealStorage: false,
      effectiveCss: currentUiCss,
    };
  }

  return {
    shouldSkipApply: false,
    shouldHealStorage: false,
    effectiveCss: normalizedSavedCss,
  };
};
