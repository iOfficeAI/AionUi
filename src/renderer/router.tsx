import React from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import Conversation from './pages/conversation';
import Guid from './pages/guid';
import About from './pages/settings/About';
import GeminiSettings from './pages/settings/GeminiSettings';
import ModeSettings from './pages/settings/ModeSettings';
import SystemSettings from './pages/settings/SystemSettings';
const PanelRoute: React.FC<{ layout: React.ReactNode }> = (props) => {
  return (
    <HashRouter>
      <Routes>
        <Route path='/' element={props.layout}>
          <Route index path='/' element={<Navigate to='/guid' />}></Route>
          <Route index path='/guid' element={<Guid />} />
          <Route path='/conversation/:id' element={<Conversation></Conversation>} />
          <Route path='/settings/gemini' element={<GeminiSettings />} />
          <Route path='/settings/model' element={<ModeSettings />} />
          <Route path='/settings/system' element={<SystemSettings />} />
          <Route path='/settings/about' element={<About />} />
          <Route path='/settings' element={<Navigate to='/settings/gemini' />}></Route>
        </Route>
      </Routes>
    </HashRouter>
  );
};

export default PanelRoute;
