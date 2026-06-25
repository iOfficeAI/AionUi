/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CapabilitiesSettings — Combined page for Skills Hub and MCP/Tools.
 *
 * This page merges the previously separate "Skills Hub" (skill packs) and
 * "Tools" (MCP servers + speech-to-text) pages into a single "Capabilities"
 * entry, accessible via /settings/capabilities.
 *
 * Old routes (/settings/skills-hub and /settings/tools) are redirected here
 * with a ?tab= query parameter to select the appropriate tab.
 */

import { Tabs } from '@arco-design/web-react';
import React from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SkillsHubSettings from './SkillsHubSettings';
import ToolsModalContent from '@/renderer/components/settings/SettingsModal/contents/ToolsModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';

type CapabilitiesTab = 'skills' | 'tools';

const isCapabilitiesTab = (value: string | null): value is CapabilitiesTab => value === 'skills' || value === 'tools';

const CapabilitiesSettings: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: CapabilitiesTab =
    location.pathname.startsWith('/settings/capabilities/skills/') || !isCapabilitiesTab(tabParam)
      ? 'skills'
      : tabParam;

  const handleTabChange = (key: string) => {
    if (!isCapabilitiesTab(key) || key === activeTab) {
      return;
    }

    if (location.pathname !== '/settings/capabilities') {
      void navigate(`/settings/capabilities?tab=${key}`, { replace: true });
      return;
    }

    // Preserve any other query params the embedded content may rely on.
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  return (
    <SettingsPageWrapper contentClassName='max-w-1200px'>
      <Tabs
        activeTab={activeTab}
        onChange={handleTabChange}
        type='line'
        animation={{ tabPane: false, inkBar: true }}
        className='flex flex-col flex-1 min-h-0 [&>.arco-tabs-content]:pt-0'
      >
        <Tabs.TabPane key='skills' title={t('settings.capabilitiesTab.skills', { defaultValue: 'Skills' })}>
          <SkillsHubSettings withWrapper={false} />
        </Tabs.TabPane>
        <Tabs.TabPane key='tools' title={t('settings.capabilitiesTab.tools', { defaultValue: 'Tools' })}>
          <ToolsModalContent />
        </Tabs.TabPane>
      </Tabs>
    </SettingsPageWrapper>
  );
};

export default CapabilitiesSettings;
