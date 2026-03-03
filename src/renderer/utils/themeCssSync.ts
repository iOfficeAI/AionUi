import { type ICssTheme } from '@/common/storage';
import { DEFAULT_THEME_ID, PRESET_THEMES } from '@/renderer/components/CssThemeSettings/presets';

export const CSS_SYNC_RECENT_UPDATE_WINDOW_MS = 2000;

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
  const allThemes = [...PRESET_THEMES, ...(userThemes || [])];
  const resolvedId = activeThemeId || DEFAULT_THEME_ID;
  return allThemes.find((theme) => theme.id === resolvedId)?.css || '';
};

export const computeCssSyncDecision = ({ savedCss, activeThemeId, savedThemes, currentUiCss, lastUiCssUpdateAt, now = Date.now() }: ComputeCssSyncDecisionParams): ComputeCssSyncDecisionResult => {
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
