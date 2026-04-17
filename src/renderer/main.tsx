/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import '@/common/adapter/browser';
import './utils/ui/runtimePatches';
import './services/i18n';
import './styles/arco-override.css';
import './styles/themes/index.css';
import 'uno.css';

import React, { lazy, Suspense, startTransition, PropsWithChildren, useEffect, useState, useMemo, memo } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from '@arco-design/web-react';
import '@arco-design/web-react/es/_util/react-19-adapter';
import '@arco-design/web-react/dist/css/arco.css';
import { useTranslation } from 'react-i18next';

import { PageLoader } from './utils/model/pageLoader';
import { AuthProvider } from './hooks/context/AuthContext';
import { ThemeProvider } from './hooks/context/ThemeContext';
import { PreviewProvider } from './pages/conversation/Preview/context/PreviewContext';
import { ConversationTabsProvider } from './pages/conversation/hooks/ConversationTabsContext';
import { registerPwa } from './services/registerPwa';
import { useAuth } from './hooks/context/AuthContext';

// --- Composants Lazy ---
const Layout = lazy(() => import('./components/layout/Layout'));
const Router = lazy(() => import('./components/layout/Router'));
const Sider = lazy(() => import('./components/layout/Sider'));
const ConversationHistoryProvider = lazy(() =>
  import('./hooks/context/ConversationHistoryContext').then(m => ({ default: m.ConversationHistoryProvider }))
);



/**
 * Chargeur dynamique des locales Arco
 */
const loadArcoLocale = async (lang: string) => {
  try {
    switch (lang) {
      case 'zh-CN': return (await import('@arco-design/web-react/es/locale/zh-CN')).default;
      case 'zh-TW': return (await import('@arco-design/web-react/es/locale/zh-TW')).default;
      case 'ja-JP': return (await import('@arco-design/web-react/es/locale/ja-JP')).default;
      case 'ko-KR': {
        const koKR = (await import('@arco-design/web-react/es/locale/ko-KR')).default;
        const enUS = (await import('@arco-design/web-react/es/locale/en-US')).default;
        return {
          ...koKR,
          Calendar: { ...koKR.Calendar, monthFormat: enUS.Calendar.monthFormat, yearFormat: enUS.Calendar.yearFormat },
          DatePicker: {
            ...koKR.DatePicker,
            Calendar: { ...koKR.DatePicker.Calendar, monthFormat: enUS.Calendar.monthFormat, yearFormat: enUS.Calendar.yearFormat }
          },
          Form: enUS.Form,
          ColorPicker: enUS.ColorPicker,
        };
      }
      default: return (await import('@arco-design/web-react/es/locale/en-US')).default;
    }
  } catch (e) {
    // Fallback sur l'anglais en cas d'erreur réseau sur le chunk de langue
    return (await import('@arco-design/web-react/es/locale/en-US')).default;
  }
};

/**
 * AppProviders : Gère les contextes, les thèmes et le chargement des locales
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

  // Si la langue n'est pas encore chargée, on affiche le loader
  if (!locale) return <PageLoader />;

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
 * Main : Structure principale de l'application
 */
const Main = memo(() => {
  const { ready } = useAuth();
  
  // Mémorisation du layout pour éviter les re-renders inutiles
  const layout = useMemo(() => (
    <ConversationHistoryProvider>
      <Layout sider={<Sider />} />
    </ConversationHistoryProvider>
  ), []);

  // Si l'authentification n'est pas encore initialisée
  if (!ready) return <PageLoader />;

  return (
    <Suspense fallback={<PageLoader />}>
      <Router layout={layout} />
    </Suspense>
  );
});

// --- Initialisation Sentry (Electron uniquement) ---
if ((window as any).electronAPI) {
  import('@sentry/electron/renderer')
    .then(Sentry => Sentry.init())
    .catch(() => {});
}

// --- Rendu final de l'application ---
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);

  // setTimeout 0 pour laisser le thread principal respirer avant le premier gros rendu
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

// Enregistrement du Service Worker pour la PWA
registerPwa().catch(console.error);