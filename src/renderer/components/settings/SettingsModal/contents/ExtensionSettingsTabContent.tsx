/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { extensions as extensionsIpc } from '@/common/adapter/ipcBridge';
import WebviewHost from '@/renderer/components/media/WebviewHost';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';

const isExternalSettingsUrl = (url?: string): boolean => /^https?:\/\//i.test(url || '');

interface ExtensionSettingsTabContentProps {
  /** aion-asset:// local page URL or external https:// URL */
  entryUrl: string;
  /** Tab ID for keying */
  tabId: string;
  /** Source extension name */
  extensionName: string;
}

/**
 * Renders an extension-contributed settings tab page.
 * - External URLs (https://) → WebviewHost with link interception, navigation, partition cache.
 * - Local URLs (aion-asset://) → sandboxed iframe with postMessage bridge.
 */
const ExtensionSettingsTabContent: React.FC<ExtensionSettingsTabContentProps> = ({
  entryUrl,
  tabId,
  extensionName,
}) => {
  const { i18n } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const resolvedEntryUrl = resolveExtensionAssetUrl(entryUrl) || entryUrl;
  const isExternalTab = isExternalSettingsUrl(resolvedEntryUrl);

  useEffect(() => {
    setLoading(true);
  }, [resolvedEntryUrl]);

  const postLocaleInit = useCallback(async () => {
    if (isExternalTab) return;

    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) return;

    try {
      const mergedI18n = await extensionsIpc.getExtI18nForLocale.invoke({ locale: i18n.language });
      const namespace = `ext.${extensionName}`;
      const translations = (mergedI18n?.[namespace] as Record<string, unknown> | undefined) ?? {};

      frameWindow.postMessage(
        {
          type: 'aion:init',
          locale: i18n.language,
          extensionName,
          translations,
        },
        '*'
      );
    } catch (err) {
      console.error('[ExtensionSettingsTabContent] Failed to post locale init:', err);
    }
  }, [extensionName, i18n.language, isExternalTab]);

  // postMessage bridge for local iframe tabs (aion-asset://)
  useEffect(() => {
    if (isExternalTab) return;

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
        console.error('[ExtensionSettingsTabContent] Failed to get activity snapshot:', err);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isExternalTab, postLocaleInit]);

  useEffect(() => {
    if (!loading) {
      void postLocaleInit();
    }
  }, [loading, postLocaleInit]);

  return (
    <div className='relative w-full h-full min-h-200px'>
      {isExternalTab ? (
        <WebviewHost
          key={tabId}
          url={resolvedEntryUrl}
          id={tabId}
          partition={`persist:ext-settings-${tabId}`}
          style={{ minHeight: '200px' }}
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
            key={tabId}
            src={resolvedEntryUrl}
            onLoad={() => setLoading(false)}
            sandbox='allow-scripts allow-same-origin'
            className='w-full h-full border-none'
            style={{
              minHeight: '200px',
              opacity: loading ? 0 : 1,
              transition: 'opacity 150ms ease-in',
            }}
            title={`Extension settings: ${tabId}`}
          />
        </>
      )}
    </div>
  );
};

export default ExtensionSettingsTabContent;
