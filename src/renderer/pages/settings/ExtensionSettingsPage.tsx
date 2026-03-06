/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { extensions as extensionsIpc, type IExtensionSettingsTab } from '@/common/ipcBridge';
import WebviewHost from '@/renderer/components/WebviewHost';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const isExternalSettingsUrl = (url?: string): boolean => /^https?:\/\//i.test(url || '');

/**
 * Route-based page for rendering extension-contributed settings tabs.
 * Loaded at `/settings/ext/:tabId` in the router.
 */
const ExtensionSettingsPage: React.FC = () => {
  const { tabId } = useParams<{ tabId: string }>();
  const [tab, setTab] = useState<IExtensionSettingsTab | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!tabId) {
      setError('No tab ID provided');
      setLoading(false);
      return;
    }

    extensionsIpc.getSettingsTabs
      .invoke()
      .then((tabs) => {
        const found = (tabs ?? []).find((t) => t.id === tabId);
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

  const isExternalTab = isExternalSettingsUrl(tab?.entryUrl);

  useEffect(() => {
    setLoading(true);
  }, [tab?.id, tab?.entryUrl]);

  // postMessage bridge for local iframe tabs
  useEffect(() => {
    if (!tab || isExternalTab) return;

    const onMessage = async (event: MessageEvent) => {
      const frameWindow = iframeRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) return;

      const data = event.data as { type?: string; reqId?: string } | undefined;
      if (!data || data.type !== 'star-office:request-snapshot') return;

      try {
        const snapshot = await extensionsIpc.getAgentActivitySnapshot.invoke();
        frameWindow.postMessage({
          type: 'star-office:activity-snapshot',
          reqId: data.reqId,
          snapshot,
        }, '*');
      } catch (err) {
        console.error('[ExtensionSettingsPage] Failed to get activity snapshot:', err);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [tab?.id, isExternalTab]);

  return (
    <SettingsPageWrapper>
      <div className='relative w-full h-full min-h-400px'>
        {loading && !tab && (
          <div className='absolute inset-0 flex items-center justify-center text-t-secondary text-14px'>
            <span className='animate-pulse'>Loading…</span>
          </div>
        )}
        {error && (
          <div className='flex items-center justify-center h-full text-t-secondary text-14px'>
            {error}
          </div>
        )}
        {tab && (isExternalTab ? (
          <WebviewHost
            key={tab.id}
            url={tab.entryUrl}
            id={tab.id}
            partition={`persist:ext-settings-${tab.id}`}
            style={{
              minHeight: '400px',
              height: 'calc(100vh - 200px)',
            }}
          />
        ) : (
          <>
            {loading && (
              <div className='absolute inset-0 flex items-center justify-center text-t-secondary text-14px'>
                <span className='animate-pulse'>Loading…</span>
              </div>
            )}
            <iframe
              ref={iframeRef}
              key={tab.id}
              src={tab.entryUrl}
              onLoad={() => setLoading(false)}
              sandbox='allow-scripts allow-same-origin'
              className='w-full border-none'
              style={{
                minHeight: '400px',
                height: 'calc(100vh - 200px)',
                opacity: loading ? 0 : 1,
                transition: 'opacity 150ms ease-in',
              }}
              title={`Extension settings: ${tab.name}`}
            />
          </>
        ))}
      </div>
    </SettingsPageWrapper>
  );
};

export default ExtensionSettingsPage;
