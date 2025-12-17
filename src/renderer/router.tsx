import React from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLoader from './components/AppLoader';
import { useAuth } from './context/AuthContext';
import Conversation from './pages/conversation';
import Guid from './pages/guid';
import About from './pages/settings/About';
import AgentSettings from './pages/settings/AgentSettings';
import DisplaySettings from './pages/settings/DisplaySettings';
import GeminiSettings from './pages/settings/GeminiSettings';
import ModeSettings from './pages/settings/ModeSettings';
import SystemSettings from './pages/settings/SystemSettings';
import ToolsSettings from './pages/settings/ToolsSettings';
import LoginPage from './pages/login';
import ComponentsShowcase from './pages/test/ComponentsShowcase';

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

  return (
    <HashRouter>
      <Routes>
        <Route path='/login' element={status === 'authenticated' ? <Navigate to='/guid' replace /> : <LoginPage />} />
        <Route element={<ProtectedLayout layout={layout} />}>
          <Route index element={<Navigate to='/guid' replace />} />
          <Route path='/guid' element={<Guid />} />
          <Route path='/conversation/:id' element={<Conversation />} />
          <Route path='/settings/gemini' element={<GeminiSettings />} />
          <Route path='/settings/model' element={<ModeSettings />} />
          <Route path='/settings/agent' element={<AgentSettings />} />
          <Route path='/settings/display' element={<DisplaySettings />} />
          <Route path='/settings/system' element={<SystemSettings />} />
          <Route path='/settings/about' element={<About />} />
          <Route path='/settings/tools' element={<ToolsSettings />} />
          <Route path='/settings' element={<Navigate to='/settings/gemini' replace />} />
          <Route path='/test/components' element={<ComponentsShowcase />} />
        </Route>
        <Route path='*' element={<Navigate to={status === 'authenticated' ? '/guid' : '/login'} replace />} />
      </Routes>
    </HashRouter>
  );
};

export default PanelRoute;
