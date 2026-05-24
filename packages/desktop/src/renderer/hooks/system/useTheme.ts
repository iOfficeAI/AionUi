// hooks/useTheme.ts
import { configService } from '@/common/config/configService';
import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const DEFAULT_THEME: Theme = 'light';
const THEME_CACHE_KEY = '__aionui_theme';

const applyThemeToDom = (value: Theme) => {
  document.documentElement.setAttribute('data-theme', value);
  document.body.setAttribute('arco-theme', value);
};

const readCachedTheme = (): Theme => {
  try {
    const cached = localStorage.getItem(THEME_CACHE_KEY);
    if (cached === 'light' || cached === 'dark') return cached;
  } catch (_e) {
    /* noop */
  }
  return DEFAULT_THEME;
};

// Apply localStorage hint synchronously to avoid FOUC, then resolve to the
// authoritative value from configService once it has loaded from the backend.
const initTheme = async (): Promise<Theme> => {
  const hint = readCachedTheme();
  applyThemeToDom(hint);
  try {
    await configService.whenReady();
    const theme = (configService.get('theme') as Theme) || hint;
    applyThemeToDom(theme);
    try {
      localStorage.setItem(THEME_CACHE_KEY, theme);
    } catch (_e) {
      /* noop */
    }
    return theme;
  } catch (error) {
    console.error('Failed to load initial theme:', error);
    return hint;
  }
};

// Run theme initialization immediately
let initialThemePromise: Promise<Theme> | null = null;
if (typeof window !== 'undefined') {
  initialThemePromise = initTheme();
}

const useTheme = (): [Theme, (theme: Theme) => Promise<void>] => {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  // Apply theme to document
  const applyTheme = useCallback((newTheme: Theme) => {
    applyThemeToDom(newTheme);
    try {
      localStorage.setItem(THEME_CACHE_KEY, newTheme);
    } catch (_e) {
      /* noop */
    }
  }, []);

  // Set theme with persistence
  const setTheme = useCallback(
    async (newTheme: Theme) => {
      try {
        setThemeState(newTheme);
        applyTheme(newTheme);
        await configService.set('theme', newTheme);
      } catch (error) {
        console.error('Failed to save theme:', error);
        // Revert on error
        setThemeState(theme);
        applyTheme(theme);
      }
    },
    [theme, applyTheme]
  );

  // Initialize theme state from the early initialization
  useEffect(() => {
    if (initialThemePromise) {
      initialThemePromise
        .then((initialTheme) => {
          setThemeState(initialTheme);
        })
        .catch((error) => {
          console.error('Failed to initialize theme:', error);
        });
    }
  }, []);

  return [theme, setTheme];
};

export default useTheme;
