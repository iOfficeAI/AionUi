// hooks/useTheme.ts
import { ConfigStorage } from '@/common/storage';
import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const DEFAULT_THEME: Theme = 'light';

// Initialize theme immediately when module loads
const initTheme = async () => {
  try {
    const theme = (await ConfigStorage.get('theme')) as Theme;
    const initialTheme = theme || DEFAULT_THEME;
    document.documentElement.setAttribute('data-theme', initialTheme);
    document.body.setAttribute('arco-theme', initialTheme);
    return initialTheme;
  } catch (error) {
    console.error('Failed to load initial theme:', error);
    document.documentElement.setAttribute('data-theme', DEFAULT_THEME);
    document.body.setAttribute('arco-theme', DEFAULT_THEME);
    return DEFAULT_THEME;
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
    document.documentElement.setAttribute('data-theme', newTheme);
    document.body.setAttribute('arco-theme', newTheme);
  }, []);

  // Set theme with persistence
  const setTheme = useCallback(
    async (newTheme: Theme) => {
      try {
        setThemeState(newTheme);
        applyTheme(newTheme);
        await ConfigStorage.set('theme', newTheme);
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
