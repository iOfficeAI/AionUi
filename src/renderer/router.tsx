import React, { Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLoader from './components/AppLoader';
import { useAuth } from './context/AuthContext';
import { isElectronShellRuntime } from './utils/platform';
import { getConnectivitySettingsPath } from './utils/settingsNavigation';

const Conversation = React.lazy(() => import('./pages/conversation'));
const Guid = React.lazy(() => import('./pages/guid'));
const About = React.lazy(() => import('./pages/settings/About'));
const AgentSettings = React.lazy(() => import('./pages/settings/AgentSettings'));
const ChannelsSettings = React.lazy(() => import('./pages/settings/ChannelsSettings'));
const DisplaySettings = React.lazy(() => import('./pages/settings/DisplaySettings'));
const GeminiSettings = React.lazy(() => import('./pages/settings/GeminiSettings'));
const ModeSettings = React.lazy(() => import('./pages/settings/ModeSettings'));
const SystemSettings = React.lazy(() => import('./pages/settings/SystemSettings'));
const ToolsSettings = React.lazy(() => import('./pages/settings/ToolsSettings'));
const WebuiSettings = React.lazy(() => import('./pages/settings/WebuiSettings'));
const ExtensionSettingsPage = React.lazy(() => import('./pages/settings/ExtensionSettingsPage'));
const LoginPage = React.lazy(() => import('./pages/login'));
const ComponentsShowcase = React.lazy(() => import('./pages/test/ComponentsShowcase'));

const withRouteFallback = (Component: React.LazyExoticComponent<React.ComponentType>) => (
  <Suspense fallback={<AppLoader />}>
    <Component />
  </Suspense>
);

const ProtectedLayout: React.FC<{ layout: React.ReactElement }> = ({ layout }) => {
  const { status } = useAuth();

  if (status === 'checking') {
    return <AppLoader />;
  }

  if (status !== 'authenticated') {
    return <Navigate to='/login' replace />;
  }

  return React.cloneElement(layout);
};

const PanelRoute: React.FC<{ layout: React.ReactElement }> = ({ layout }) => {
  const { status } = useAuth();
  const isDesktopRuntime = isElectronShellRuntime();
  const connectivitySettingsPath = getConnectivitySettingsPath(isDesktopRuntime);

  return (
    <HashRouter>
      <Routes>
        <Route path='/login' element={status === 'authenticated' ? <Navigate to='/guid' replace /> : withRouteFallback(LoginPage)} />
        <Route element={<ProtectedLayout layout={layout} />}>
          <Route index element={<Navigate to='/guid' replace />} />
          <Route path='/guid' element={withRouteFallback(Guid)} />
          <Route path='/conversation/:id' element={withRouteFallback(Conversation)} />
          <Route path='/settings/gemini' element={withRouteFallback(GeminiSettings)} />
          <Route path='/settings/model' element={withRouteFallback(ModeSettings)} />
          <Route path='/settings/agent' element={withRouteFallback(AgentSettings)} />
          <Route path='/settings/display' element={withRouteFallback(DisplaySettings)} />
          <Route path='/settings/webui' element={isDesktopRuntime ? withRouteFallback(WebuiSettings) : <Navigate to={connectivitySettingsPath} replace />} />
          <Route path='/settings/channels' element={withRouteFallback(ChannelsSettings)} />
          <Route path='/settings/system' element={withRouteFallback(SystemSettings)} />
          <Route path='/settings/about' element={withRouteFallback(About)} />
          <Route path='/settings/tools' element={withRouteFallback(ToolsSettings)} />
          <Route path='/settings/ext/:tabId' element={withRouteFallback(ExtensionSettingsPage)} />
          <Route path='/settings' element={<Navigate to='/settings/gemini' replace />} />
          <Route path='/test/components' element={withRouteFallback(ComponentsShowcase)} />
        </Route>
        <Route path='*' element={<Navigate to={status === 'authenticated' ? '/guid' : '/login'} replace />} />
      </Routes>
    </HashRouter>
  );
};

export default PanelRoute;
