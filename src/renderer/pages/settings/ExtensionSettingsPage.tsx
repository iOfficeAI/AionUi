/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { extensions as extensionsIpc, type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import { useExtensionSettingsTabs } from '@/renderer/hooks/system/useExtensionSettingsTabs';
import WebviewHost from '@/renderer/components/media/WebviewHost';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const isExternalSettingsUrl = (url?: string): boolean => /^https?:\/\//i.test(url || '');

/**
 * Route-based page for rendering extension-contributed settings tabs.
 * Loaded at `/settings/ext/:tabId` in the router.
 */
const ExtensionSettingsPage: React.FC = () => {
  const { tabId } = useParams<{ tabId: string }>();
  const { i18n } = useTranslation();
  const { resolveExtTabName } = useExtI18n();
  const extensionTabs = useExtensionSettingsTabs();
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { tab, error } = useMemo<{ tab: IExtensionSettingsTab | null; error: string | null }>(() => {
    if (!tabId) {
      return { tab: null, error: 'No tab ID provided' };
    }
    // While shared cache is still warming up (empty on first mount), defer
    // the "not found" error so a freshly-loaded tab list can resolve it.
    if (extensionTabs.length === 0) {
      return { tab: null, error: null };
    }
    const found = extensionTabs.find((t) => t.id === tabId);
    if (found) {
      return { tab: found, error: null };
    }
    return { tab: null, error: `Settings tab "${tabId}" not found` };
  }, [tabId, extensionTabs]);

  const resolvedEntryUrl = resolveExtensionAssetUrl(tab?.entryUrl) || tab?.entryUrl;
  const isExternalTab = isExternalSettingsUrl(resolvedEntryUrl);

  useEffect(() => {
    setLoading(true);
  }, [tab?.id, resolvedEntryUrl]);

  const postLocaleInit = useCallback(async () => {
    if (!tab || isExternalTab) return;

    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) return;

    try {
      const mergedI18n = await extensionsIpc.getExtI18nForLocale.invoke({ locale: i18n.language });
      const namespace = `ext.${tab._extensionName}`;
      const translations = (mergedI18n?.[namespace] as Record<string, unknown> | undefined) ?? {};

      frameWindow.postMessage(
        {
          type: 'aion:init',
          locale: i18n.language,
          extensionName: tab._extensionName,
          translations,
        },
        '*'
      );
    } catch (err) {
      console.error('[ExtensionSettingsPage] Failed to post locale init:', err);
    }
  }, [i18n.language, isExternalTab, tab]);

  useEffect(() => {
    if (!tab || isExternalTab) return;

    const onMessage = async (event: MessageEvent) => {
      const frameWindow = iframeRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) return;

      const data = event.data as { type?: string; reqId?: string } | undefined;
      if (!data) return;

      if (data.type === 'aion:get-locale') {
        void postLocaleInit();
        return;
      }

      if (data.type !== 'star-office:request-snapshot') return;

      try {
        const snapshot = await extensionsIpc.getAgentActivitySnapshot.invoke();
        frameWindow.postMessage(
          {
            type: 'star-office:activity-snapshot',
            reqId: data.reqId,
            snapshot,
          },
          '*'
        );
      } catch (err) {
        console.error('[ExtensionSettingsPage] Failed to get activity snapshot:', err);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isExternalTab, postLocaleInit, tab]);

  useEffect(() => {
    if (!loading) {
      void postLocaleInit();
    }
  }, [loading, postLocaleInit]);

  return (
    <SettingsPageWrapper>
      <div className='relative w-full h-full min-h-400px'>
        {!tab && !error && (
          <div className='absolute inset-0 flex items-center justify-center text-t-secondary text-14px'>
            <span className='animate-pulse'>Loading…</span>
          </div>
        )}
        {error && <div className='flex items-center justify-center h-full text-t-secondary text-14px'>{error}</div>}
        {tab &&
          (isExternalTab ? (
            <WebviewHost
              key={tab.id}
              url={resolvedEntryUrl || ''}
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
                src={resolvedEntryUrl}
                onLoad={() => setLoading(false)}
                sandbox='allow-scripts allow-same-origin'
                className='w-full border-none'
                style={{
                  minHeight: '400px',
                  height: 'calc(100vh - 200px)',
                  opacity: loading ? 0 : 1,
                  transition: 'opacity 150ms ease-in',
                }}
                title={`Extension settings: ${resolveExtTabName(tab)}`}
              />
            </>
          ))}
      </div>
    </SettingsPageWrapper>
  );
};

export default ExtensionSettingsPage;
