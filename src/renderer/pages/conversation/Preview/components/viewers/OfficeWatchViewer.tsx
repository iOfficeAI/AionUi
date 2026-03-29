/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import WebviewHost from '@/renderer/components/media/WebviewHost';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Spin } from '@arco-design/web-react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type DocType = 'ppt' | 'word' | 'excel';

const BRIDGE = {
  ppt: ipcBridge.pptPreview,
  word: ipcBridge.wordPreview,
  excel: ipcBridge.excelPreview,
} as const;

// Web-server proxy base paths (Electron uses the direct localhost URL instead)
const PROXY_PATH: Record<DocType, string> = {
  ppt: '/api/ppt-proxy',
  word: '/api/office-watch-proxy',
  excel: '/api/office-watch-proxy',
};

const IFRAME_TITLE: Record<DocType, string> = {
  ppt: 'PPT Preview',
  word: 'Word Preview',
  excel: 'Excel Preview',
};

const I18N_KEYS = {
  ppt: {
    loading: 'preview.ppt.loading',
    installing: 'preview.ppt.installing',
    startFailed: 'preview.ppt.startFailed',
    installHint: 'preview.ppt.installHint',
  },
  word: {
    loading: 'preview.word.watch.loading',
    installing: 'preview.word.watch.installing',
    startFailed: 'preview.word.watch.startFailed',
    installHint: 'preview.word.watch.installHint',
  },
  excel: {
    loading: 'preview.excel.watch.loading',
    installing: 'preview.excel.watch.installing',
    startFailed: 'preview.excel.watch.startFailed',
    installHint: 'preview.excel.watch.installHint',
  },
} as const;

interface OfficeWatchViewerProps {
  docType: DocType;
  filePath?: string;
  content?: string;
}

/**
 * Shared Office watch viewer.
 *
 * Launches an `officecli watch` child process via IPC, waits for the local
 * HTTP server to be ready, then renders it in a webview (Electron) or iframe
 * (web server mode). Cleans up the process on unmount.
 *
 * Used by PptViewer, OfficeDocViewer, and ExcelViewer — each passes its
 * docType to select the correct IPC bridge, proxy path, and i18n keys.
 */
const OfficeWatchViewer: React.FC<OfficeWatchViewerProps> = ({ docType, filePath }) => {
  const { t } = useTranslation();
  const keys = I18N_KEYS[docType];

  const [watchUrl, setWatchUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'starting' | 'installing'>('starting');
  const [error, setError] = useState<string | null>(null);
  const filePathRef = useRef(filePath);

  useEffect(() => {
    filePathRef.current = filePath;
    const bridge = BRIDGE[docType];

    if (!filePath) {
      setLoading(false);
      setError(t('preview.errors.missingFilePath'));
      return;
    }

    let cancelled = false;

    const unsubStatus = bridge.status.on((evt) => {
      if (cancelled) return;
      if (evt.state === 'installing') setStatus('installing');
      else if (evt.state === 'starting') setStatus('starting');
    });

    const start = async () => {
      setLoading(true);
      setStatus('starting');
      setError(null);
      try {
        const result = await bridge.start.invoke({ filePath });
        const url = result.url;
        if (!url || ('error' in result && result.error)) {
          throw new Error((result as { error?: string }).error || t(keys.startFailed));
        }
        // Small delay to ensure the watch HTTP server is fully ready for the webview
        await new Promise((r) => setTimeout(r, 300));
        if (!cancelled) {
          let resolvedUrl = url;
          if (!isElectronDesktop()) {
            const port = new URL(url).port;
            resolvedUrl = `${PROXY_PATH[docType]}/${port}/`;
          }
          setWatchUrl(resolvedUrl);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : t(keys.startFailed);
          setError(msg);
          setLoading(false);
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      unsubStatus();
      if (filePathRef.current) {
        bridge.stop.invoke({ filePath: filePathRef.current }).catch(() => {});
      }
    };
  }, [docType, filePath]);

  if (loading) {
    return (
      <div className='h-full w-full flex items-center justify-center bg-bg-1'>
        <div className='flex flex-col items-center gap-12px'>
          <Spin size={32} />
          <span className='text-13px text-t-secondary'>
            {status === 'installing' ? t(keys.installing) : t(keys.loading)}
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='h-full w-full flex items-center justify-center bg-bg-1'>
        <div className='text-center max-w-400px'>
          <div className='text-16px text-danger mb-8px'>{error}</div>
          <div className='text-12px text-t-secondary'>{t(keys.installHint)}</div>
        </div>
      </div>
    );
  }

  if (!watchUrl) return null;

  // Electron: use <webview> via WebviewHost for full Electron integration.
  // Web server mode: use <iframe> since <webview> is Electron-only.
  if (isElectronDesktop()) {
    return <WebviewHost url={watchUrl} className='bg-bg-1' />;
  }
  return <iframe src={watchUrl} className='w-full h-full border-0 bg-bg-1' title={IFRAME_TITLE[docType]} />;
};

export default OfficeWatchViewer;
