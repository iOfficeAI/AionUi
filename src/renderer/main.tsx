/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// --- Critical Runtime Patches & Adapters ---
import '@/common/adapter/browser';
import './utils/ui/runtimePatches';
import './services/i18n';

// --- Global Styles ---
import './styles/arco-override.css';
import './styles/themes/index.css';
import 'uno.css';

// --- Sentry Initialization (Electron Only) ---
// Sentry must be initialized first to capture early runtime errors.
// Use electron-specific renderer package only inside Electron; fall back to the
// browser SDK when running as a standalone web server (no window.electronAPI).
if ((window as { electronAPI?: unknown }).electronAPI) {
  // Dynamic import avoids bundling sentry-ipc:// protocol code into the web build
  import('@sentry/electron/renderer')
    .then((Sentry) => Sentry.init())
    .catch((err) => console.error('Sentry initialization failed:', err));
}

import React, { lazy, Suspense, startTransition, useEffect, useState, useMemo, memo } from 'react';
// Import type-only dependencies separately
import type { PropsWithChildren } from 'react';

import { createRoot } from 'react-dom/client';
import { ConfigProvider } from '@arco-design/web-react';
import '@arco-design/web-react/es/_util/react-19-adapter';
import '@arco-design/web-react/dist/css/arco.css';
import { useTranslation } from 'react-i18next';

// --- Contexts & UI Components ---

import { AuthProvider } from './hooks/context/AuthContext';
import { ThemeProvider } from './hooks/context/ThemeContext';
import { PreviewProvider } from './pages/conversation/Preview/context/PreviewContext';
import { ConversationTabsProvider } from './pages/conversation/hooks/ConversationTabsContext';
import { registerPwa } from './services/registerPwa';
import { useAuth } from './hooks/context/AuthContext';

// --- Lazy Loaded Components ---
// Splitting heavy components into separate chunks to improve First Contentful Paint (FCP)
const Layout = lazy(() => import('./components/layout/Layout'));
const Router = lazy(() => import('./components/layout/Router'));
const Sider = lazy(() => import('./components/layout/Sider'));
const ConversationHistoryProvider = lazy(() =>
  import('./hooks/context/ConversationHistoryContext').then(m => ({ default: m.ConversationHistoryProvider }))
);

/**
 * Dynamically loads Arco Design system locales.
 * This prevents all language files from being included in the main entry bundle.
 */
const loadArcoLocale = async (lang: string) => {
  try {
    switch (lang) {
      case 'zh-CN': return (await import('@arco-design/web-react/es/locale/zh-CN')).default;
      case 'zh-TW': return (await import('@arco-design/web-react/es/locale/zh-TW')).default;
      case 'ja-JP': return (await import('@arco-design/web-react/es/locale/ja-JP')).default;
      case 'ko-KR': {
        // Patch Korean locale with missing properties from English locale
        const koKR = (await import('@arco-design/web-react/es/locale/ko-KR')).default;
        const enUS = (await import('@arco-design/web-react/es/locale/en-US')).default;
        return {
          ...koKR,
          Calendar: {
            ...koKR.Calendar,
            monthFormat: enUS.Calendar.monthFormat,
            yearFormat: enUS.Calendar.yearFormat
          },
          DatePicker: {
            ...koKR.DatePicker,
            Calendar: {
              ...koKR.DatePicker.Calendar,
              monthFormat: enUS.Calendar.monthFormat,
              yearFormat: enUS.Calendar.yearFormat
            },
          },
          Form: enUS.Form,
          ColorPicker: enUS.ColorPicker,
        };
      }
      default: return (await import('@arco-design/web-react/es/locale/en-US')).default;
    }
  } catch (error) {
    console.error('Locale load failed, falling back to English:', error);
    return (await import('@arco-design/web-react/es/locale/en-US')).default;
  }
};

/**
 * AppProviders Component
 * Manages global contexts and dynamic localization setup.
 */
const AppProviders = memo(({ children }: PropsWithChildren) => {
  const { i18n } = useTranslation();
  const [locale, setLocale] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    loadArcoLocale(i18n.language).then(result => {
      if (mounted) setLocale(result);
    });
    return () => { mounted = false; };
  }, [i18n.language]);


  if (!locale) return;

  return (
    <AuthProvider>
      <ThemeProvider>
        <PreviewProvider>
          <ConversationTabsProvider>
            <ConfigProvider theme={{ primaryColor: '#4E5969' }} locale={locale}>
              {children}
            </ConfigProvider>
          </ConversationTabsProvider>
        </PreviewProvider>
      </ThemeProvider>
    </AuthProvider>
  );
});

/**
 * Main Component
 * Handles authentication readiness and sets up the primary layout structure.
 */
const Main = memo(() => {
  const { ready } = useAuth();

  // Memoize layout to prevent redundant re-renders of the sidebar and history providers
  const layout = useMemo(() => (
    <ConversationHistoryProvider>
      <Layout sider={<Sider />} />
    </ConversationHistoryProvider>
  ), []);

  // Wait for auth context to be ready before rendering the router
  if (!ready) return;

  return (
    <Router layout={layout} />
  );
});

// --- Application Bootstrapping ---
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);

  // Use setTimeout(0) and startTransition to yield to the main thread,
  setTimeout(() => {
    startTransition(() => {
      root.render(
        process.env.NODE_ENV === 'development' ? (
          <React.StrictMode>
            <AppProviders>
              <Main />
            </AppProviders>
          </React.StrictMode>
        ) : (
          <AppProviders>
            <Main />
          </AppProviders>
        )
      );
    });
  }, 0);
}

// Register Service Worker for PWA (Progressive Web App) capabilities
registerPwa().catch(console.error);
