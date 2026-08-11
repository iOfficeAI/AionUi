/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { extensions as extensionsIpc } from '@/common/adapter/ipcBridge';
import WebviewHost from '@/renderer/components/media/WebviewHost';
import { useConversationTabs } from '@/renderer/pages/conversation/hooks/ConversationTabsContext';
import { isElectronDesktop, resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { useNavigate } from 'react-router-dom';
import { getExtensionHostApiHandlers } from './hostApiHandlers';

const isExternalSettingsUrl = (url?: string): boolean => /^https?:\/\//i.test(url || '');
const LOCAL_ASSET_PROTOCOL_PREFIX = 'aion-asset://asset/';

type ExtensionApiCallMessage = {
  type?: string;
  reqId?: string;
  requestId?: string;
  data?: {
    action?: string;
    payload?: unknown;
  };
};

interface ExtensionSettingsTabContentProps {
  /** aion-asset:// local page URL or external https:// URL */
  entryUrl: string;
  /** Tab ID for keying */
  tabId: string;
  /** Source extension name */
  extensionName: string;
  /** Minimum content height for the embedded settings surface */
  minHeight?: number | string;
}

type EmbeddedAssetLoader = (assetUrl: string) => Promise<string>;

const toFileUrl = (rawPath: string): string => {
  let normalized = rawPath.replace(/\\/g, '/');
  if (/^\/[A-Za-z]:/.test(normalized)) {
    normalized = normalized.slice(1);
  }

  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`;
  }

  return `file://${encodeURI(normalized)}`;
};

const toBrowserAssetUrl = (fileUrl: string): string => {
  let filePath = decodeURIComponent(fileUrl.replace(/^file:\/\/\/?/, ''));
  if (/^\/[A-Za-z]:/.test(filePath)) {
    filePath = filePath.slice(1);
  }

  return `/api/ext-asset?path=${encodeURIComponent(filePath)}`;
};

const getLocalEntryFileUrl = (entryUrl: string): string | null => {
  if (entryUrl.startsWith(LOCAL_ASSET_PROTOCOL_PREFIX)) {
    return toFileUrl(entryUrl.slice(LOCAL_ASSET_PROTOCOL_PREFIX.length));
  }

  if (entryUrl.startsWith('file://')) {
    return entryUrl;
  }

  return null;
};

const isRewritableAssetReference = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('/')) {
    return false;
  }

  if (/^(data|blob|javascript|mailto|tel|about):/i.test(trimmed)) {
    return false;
  }

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) {
    return trimmed.startsWith('file://') || trimmed.startsWith(LOCAL_ASSET_PROTOCOL_PREFIX);
  }

  return true;
};

const resolveEmbeddedAssetUrl = (entryFileUrl: string, rawValue: string): string | null => {
  if (!isRewritableAssetReference(rawValue)) {
    return null;
  }

  let resolvedFileUrl: string;
  if (rawValue.startsWith(LOCAL_ASSET_PROTOCOL_PREFIX)) {
    const fileUrl = getLocalEntryFileUrl(rawValue);
    if (!fileUrl) {
      return null;
    }
    resolvedFileUrl = fileUrl;
  } else if (rawValue.startsWith('file://')) {
    resolvedFileUrl = rawValue;
  } else {
    resolvedFileUrl = new URL(rawValue, entryFileUrl).toString();
  }

  return toBrowserAssetUrl(resolvedFileUrl);
};

const rewriteSrcSet = (srcSet: string, entryFileUrl: string): string => {
  return srcSet
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return trimmed;

      const [urlCandidate, ...descriptorParts] = trimmed.split(/\s+/);
      const rewrittenUrl = resolveEmbeddedAssetUrl(entryFileUrl, urlCandidate);
      if (!rewrittenUrl) {
        return trimmed;
      }

      return [rewrittenUrl, ...descriptorParts].join(' ').trim();
    })
    .join(', ');
};

const defaultEmbeddedAssetLoader: EmbeddedAssetLoader = async (assetUrl) => {
  const response = await fetch(assetUrl, {
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error(`Failed to load embedded asset: ${response.status}`);
  }

  return response.text();
};

const buildEmbeddedErrorDocument = (): string => {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<body style="margin:0;padding:16px;font:14px/1.6 sans-serif;">',
    'Failed to load extension settings content.',
    '</body>',
    '</html>',
  ].join('');
};

export const buildEmbeddedExtensionHtml = async (
  html: string,
  entryUrl: string,
  assetLoader: EmbeddedAssetLoader = defaultEmbeddedAssetLoader
): Promise<string> => {
  const entryFileUrl = getLocalEntryFileUrl(entryUrl);
  if (!entryFileUrl || typeof DOMParser === 'undefined') {
    return html;
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(html, 'text/html');

  for (const linkElement of Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))) {
    const href = linkElement.getAttribute('href');
    if (!href) continue;

    const resolvedHref = resolveEmbeddedAssetUrl(entryFileUrl, href);
    if (!resolvedHref) continue;

    try {
      const cssText = await assetLoader(resolvedHref);
      const styleElement = document.createElement('style');
      styleElement.textContent = cssText;
      linkElement.replaceWith(styleElement);
    } catch (error) {
      console.error('[ExtensionSettingsTabContent] Failed to inline stylesheet asset:', error);
      linkElement.setAttribute('href', resolvedHref);
    }
  }

  for (const scriptElement of Array.from(document.querySelectorAll('script[src]'))) {
    const src = scriptElement.getAttribute('src');
    if (!src) continue;

    const resolvedSrc = resolveEmbeddedAssetUrl(entryFileUrl, src);
    if (!resolvedSrc) continue;

    try {
      const scriptText = await assetLoader(resolvedSrc);
      const inlineScript = document.createElement('script');
      for (const attr of Array.from(scriptElement.attributes)) {
        if (attr.name !== 'src') {
          inlineScript.setAttribute(attr.name, attr.value);
        }
      }
      inlineScript.textContent = scriptText;
      scriptElement.replaceWith(inlineScript);
    } catch (error) {
      console.error('[ExtensionSettingsTabContent] Failed to inline script asset:', error);
      scriptElement.setAttribute('src', resolvedSrc);
    }
  }

  for (const element of Array.from(document.querySelectorAll('[src],[href],[poster],[data],[srcset]'))) {
    for (const attr of ['src', 'href', 'poster', 'data'] as const) {
      const currentValue = element.getAttribute(attr);
      if (!currentValue) continue;

      const rewrittenValue = resolveEmbeddedAssetUrl(entryFileUrl, currentValue);
      if (rewrittenValue) {
        element.setAttribute(attr, rewrittenValue);
      }
    }

    const currentSrcSet = element.getAttribute('srcset');
    if (currentSrcSet) {
      element.setAttribute('srcset', rewriteSrcSet(currentSrcSet, entryFileUrl));
    }
  }

  return `<!doctype html>\n${document.documentElement.outerHTML}`;
};

/**
 * Renders an extension-contributed settings tab page.
 * - External URLs (https://) -> WebviewHost with link interception, navigation, partition cache.
 * - Local URLs (aion-asset://) -> sandboxed iframe with postMessage bridge.
 *   In browser WebUI mode, local HTML entries are rewritten into srcDoc so the page
 *   can be embedded safely and still load relative scripts/styles.
 */
const ExtensionSettingsTabContent: React.FC<ExtensionSettingsTabContentProps> = ({
  entryUrl,
  tabId,
  extensionName,
  minHeight = 200,
}) => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const { activeTab, closeAllTabs, openTab } = useConversationTabs();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [embeddedHtml, setEmbeddedHtml] = useState<string | null>(null);
  const locale = i18n?.language || 'en-US';
  const resolvedEntryUrl = resolveExtensionAssetUrl(entryUrl) || entryUrl;
  const isExternalTab = isExternalSettingsUrl(resolvedEntryUrl);
  const resolvedMinHeight = typeof minHeight === 'number' ? `${minHeight}px` : minHeight;
  const localEntryFileUrl = getLocalEntryFileUrl(entryUrl);
  const shouldUseEmbeddedHtml = !isElectronDesktop() && !isExternalTab && /\.html?$/i.test(localEntryFileUrl || '');
  const hostContext = useMemo(
    () => ({
      activeWorkspace: activeTab?.workspace ?? null,
      closeAllTabs,
      openTab,
      navigateToConversation: (conversationId: string) => Promise.resolve(navigate(`/conversation/${conversationId}`)),
    }),
    [activeTab?.workspace, closeAllTabs, navigate, openTab]
  );

  useEffect(() => {
    setLoading(true);
    setEmbeddedHtml(null);
  }, [resolvedEntryUrl]);

  useEffect(() => {
    if (!shouldUseEmbeddedHtml) {
      return;
    }

    let cancelled = false;

    const loadEmbeddedHtml = async () => {
      try {
        const response = await fetch(resolvedEntryUrl, {
          credentials: 'same-origin',
        });

        if (!response.ok) {
          throw new Error(`Failed to load extension entry: ${response.status}`);
        }

        const html = await response.text();
        const nextEmbeddedHtml = await buildEmbeddedExtensionHtml(html, entryUrl);
        if (!cancelled) {
          setEmbeddedHtml(nextEmbeddedHtml);
        }
      } catch (error) {
        console.error('[ExtensionSettingsTabContent] Failed to prepare browser embedded HTML:', error);
        if (!cancelled) {
          setEmbeddedHtml(buildEmbeddedErrorDocument());
        }
      }
    };

    void loadEmbeddedHtml();

    return () => {
      cancelled = true;
    };
  }, [entryUrl, resolvedEntryUrl, shouldUseEmbeddedHtml]);

  const postLocaleInit = useCallback(async () => {
    if (isExternalTab) return;

    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) return;

    try {
      const mergedI18n = await extensionsIpc.getExtI18nForLocale.invoke({ locale });
      const namespace = `ext.${extensionName}`;
      const translations = (mergedI18n?.[namespace] as Record<string, unknown> | undefined) ?? {};

      frameWindow.postMessage(
        {
          type: 'aion:init',
          locale,
          extensionName,
          translations,
        },
        '*'
      );
    } catch (err) {
      console.error('[ExtensionSettingsTabContent] Failed to post locale init:', err);
    }
  }, [extensionName, isExternalTab, locale]);

  useEffect(() => {
    if (isExternalTab) return;

    const onMessage = async (event: MessageEvent) => {
      const frameWindow = iframeRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) return;

      const data = event.data as ExtensionApiCallMessage | undefined;
      if (!data) return;

      if (data.type === 'aion:get-locale') {
        void postLocaleInit();
        return;
      }

      if (data.type === 'ext:api-call') {
        const requestId = data.requestId || data.reqId;
        const action = data.data?.action;
        const payload = data.data?.payload;
        const hostApiHandlers = getExtensionHostApiHandlers(extensionName, payload, hostContext);
        const handler = action ? hostApiHandlers?.[action] : undefined;

        if (!requestId || !handler) {
          frameWindow.postMessage(
            {
              type: 'ext:api-response',
              requestId,
              success: false,
              error: 'Unsupported host action',
            },
            '*'
          );
          return;
        }

        try {
          const response = await handler();
          frameWindow.postMessage(
            {
              type: 'ext:api-response',
              requestId,
              success: true,
              data: response,
            },
            '*'
          );
        } catch (err) {
          console.error('[ExtensionSettingsTabContent] Host API call failed:', err);
          frameWindow.postMessage(
            {
              type: 'ext:api-response',
              requestId,
              success: false,
              error: err instanceof Error ? err.message : 'Host API call failed',
            },
            '*'
          );
        }
        return;
      }

      if (data.type !== 'star-office:request-snapshot' || extensionName !== 'star-office') return;

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
  }, [extensionName, hostContext, isExternalTab, postLocaleInit]);

  useEffect(() => {
    if (!loading) {
      void postLocaleInit();
    }
  }, [loading, postLocaleInit]);

  return (
    <div className='relative w-full h-full' style={{ minHeight: resolvedMinHeight }}>
      {isExternalTab ? (
        <WebviewHost
          key={tabId}
          url={resolvedEntryUrl}
          id={tabId}
          partition={`persist:ext-settings-${tabId}`}
          style={{ minHeight: resolvedMinHeight }}
        />
      ) : (
        <>
          {loading ? (
            <div className='absolute inset-0 flex items-center justify-center text-t-secondary text-14px'>
              <span className='animate-pulse'>Loading...</span>
            </div>
          ) : null}
          {!shouldUseEmbeddedHtml || embeddedHtml !== null ? (
            <iframe
              ref={iframeRef}
              key={tabId}
              src={shouldUseEmbeddedHtml ? undefined : resolvedEntryUrl}
              srcDoc={shouldUseEmbeddedHtml ? embeddedHtml || undefined : undefined}
              onLoad={() => setLoading(false)}
              sandbox='allow-scripts allow-same-origin'
              className='w-full h-full border-none'
              style={{
                minHeight: resolvedMinHeight,
                opacity: loading ? 0 : 1,
                transition: 'opacity 150ms ease-in',
              }}
              title={`Extension settings: ${tabId}`}
            />
          ) : null}
        </>
      )}
    </div>
  );
};

export default ExtensionSettingsTabContent;
