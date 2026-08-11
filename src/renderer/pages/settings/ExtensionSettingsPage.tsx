/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ExtensionSettingsTabContent from '@/renderer/components/settings/SettingsModal/contents/ExtensionSettingsTabContent';
import { extensions as extensionsIpc, type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import SettingsPageWrapper from './components/SettingsPageWrapper';

/**
 * Route-based page for rendering extension-contributed settings tabs.
 * Loaded at `/settings/ext/:tabId` in the router.
 */
const ExtensionSettingsPage: React.FC = () => {
  const { tabId } = useParams<{ tabId: string }>();
  const [tab, setTab] = useState<IExtensionSettingsTab | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setTab(null);

    if (!tabId) {
      setError('No tab ID provided');
      setLoading(false);
      return;
    }

    void extensionsIpc.getSettingsTabs
      .invoke()
      .then((tabs) => {
        const found = (tabs ?? []).find((item) => item.id === tabId);
        if (found) {
          setTab(found);
        } else {
          setError(`Settings tab "${tabId}" not found`);
        }
      })
      .catch((err) => {
        console.error('[ExtensionSettingsPage] Failed to load tabs:', err);
        setError('Failed to load extension settings');
      })
      .finally(() => setLoading(false));
  }, [tabId]);

  return (
    <SettingsPageWrapper>
      <div className='relative w-full h-full min-h-400px'>
        {loading && !tab ? (
          <div className='absolute inset-0 flex items-center justify-center text-t-secondary text-14px'>
            <span className='animate-pulse'>Loading…</span>
          </div>
        ) : null}
        {error ? (
          <div className='flex h-full items-center justify-center text-14px text-t-secondary'>{error}</div>
        ) : null}
        {tab ? (
          <ExtensionSettingsTabContent
            entryUrl={tab.entryUrl}
            tabId={tab.id}
            extensionName={tab._extensionName}
            minHeight='calc(100vh - 200px)'
          />
        ) : null}
      </div>
    </SettingsPageWrapper>
  );
};

export default ExtensionSettingsPage;
