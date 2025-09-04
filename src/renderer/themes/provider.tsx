import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ConfigProvider } from '@arco-design/web-react';
import { themeManager } from './manager';
import { enableI18nStyleObserver } from './i18n-style-mapper';
import { enableAppStyleObserver } from './app-style-applier';
import type { ThemeMode, ThemePack } from './types';

interface ThemeContextValue {
  themeId: string;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  setTheme: (id: string) => void;
  list: ThemePack[];
  exportTheme: (id: string) => string | null;
  importTheme: (json: string) => boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};

export const ThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [{ themeId, mode }, setState] = useState(() => {
    const { pack, mode } = themeManager.getCurrent();
    return { themeId: pack.id, mode };
  });

  // keep DOM in sync; respect theme.defaultMode when switching theme
  const prevThemeIdRef = useRef<string>(themeId);
  useEffect(() => {
    const themeChanged = prevThemeIdRef.current !== themeId;
    const theme = themeManager.getAll().find((t) => t.id === themeId);
    const effectiveMode = themeChanged && theme?.defaultMode ? theme.defaultMode : mode;

    themeManager.setCurrentTheme(themeId);
    themeManager.setMode(effectiveMode);
    themeManager.applyToDOM(document.body);

    if (effectiveMode !== mode) {
      // sync react state so UI reflects default mode on theme switch
      setState((s) => ({ ...s, mode: effectiveMode }));
    }
    prevThemeIdRef.current = themeId;
  }, [themeId, mode]);

  // Enable i18n style observer on mount
  useEffect(() => {
    enableI18nStyleObserver(document.body);
    enableAppStyleObserver(document.body);
  }, []);

  const list = useMemo(() => themeManager.getAll(), [themeId, mode]);

  const setModeCb = useCallback((m: ThemeMode) => setState((s) => ({ ...s, mode: m })), []);
  const setThemeCb = useCallback((id: string) => setState((s) => ({ ...s, themeId: id })), []);

  const exportTheme = useCallback((id: string) => themeManager.exportTheme(id), []);
  const importTheme = useCallback((json: string) => {
    const ok = !!themeManager.importTheme(json);
    if (ok) {
      // Re-apply to DOM so variable/i18n style changes take effect immediately
      themeManager.applyToDOM(document.body);
      // ensure appStyles applied after variables
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { applyAppStyles } = require('./app-style-applier');
        applyAppStyles(document.body);
      } catch (error) {
        console.warn('Failed to apply app styles:', error);
      }
      // trigger context consumers if needed
      setState((s) => ({ ...s }));
    }
    return ok;
  }, []);

  const arcoTheme = useMemo(() => {
    const { pack } = themeManager.getCurrent();
    return mode === 'dark' ? pack.dark.arco : pack.light.arco;
  }, [themeId, mode]);

  return (
    <ConfigProvider theme={arcoTheme}>
      <ThemeContext.Provider
        value={{
          themeId,
          mode,
          setMode: setModeCb,
          setTheme: setThemeCb,
          list,
          exportTheme,
          importTheme,
        }}
      >
        {children}
      </ThemeContext.Provider>
    </ConfigProvider>
  );
};
