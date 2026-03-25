/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isElectronDesktop } from '@/renderer/utils/platform';
import WebviewHost from '@/renderer/components/media/WebviewHost';
import { Spin } from '@arco-design/web-react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface PptViewerProps {
  filePath?: string;
  content?: string;
}

/**
 * PPT Preview Component
 *
 * Launches officecli watch as a local HTTP server and renders the
 * live preview in a webview. Automatically cleans up the watch
 * process when the component unmounts.
 */
const PptViewer: React.FC<PptViewerProps> = ({ filePath }) => {
  const { t } = useTranslation();
  const [watchUrl, setWatchUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'starting' | 'installing'>('starting');
  const [error, setError] = useState<string | null>(null);
  const filePathRef = useRef(filePath);

  useEffect(() => {
    filePathRef.current = filePath;

    if (!filePath) {
      setLoading(false);
      setError(t('preview.errors.missingFilePath'));
      return;
    }

    let cancelled = false;

    const unsubStatus = ipcBridge.pptPreview.status.on((evt) => {
      if (cancelled) return;
      if (evt.state === 'installing') setStatus('installing');
      else if (evt.state === 'starting') setStatus('starting');
    });

    const start = async () => {
      setLoading(true);
      setStatus('starting');
      setError(null);
      try {
        const { url } = await ipcBridge.pptPreview.start.invoke({ filePath });
        // Small delay to ensure watch HTTP server is fully ready for webview
        await new Promise((r) => setTimeout(r, 300));
        if (!cancelled) {
          // In Electron, use the direct localhost URL.
          // In server (web) mode, route through the web server proxy so the
          // client browser can reach the officecli watch server.
          let resolvedUrl = url;
          if (!isElectronDesktop()) {
            const port = new URL(url).port;
            resolvedUrl = `/api/ppt-proxy/${port}/`;
          }
          setWatchUrl(resolvedUrl);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : t('preview.ppt.startFailed');
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
        ipcBridge.pptPreview.stop.invoke({ filePath: filePathRef.current }).catch(() => {});
      }
    };
  }, [filePath]);

  if (loading) {
    return (
      <div className='h-full w-full flex items-center justify-center bg-bg-1'>
        <div className='flex flex-col items-center gap-12px'>
          <Spin size={32} />
          <span className='text-13px text-t-secondary'>
            {status === 'installing' ? t('preview.ppt.installing') : t('preview.ppt.loading')}
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
          <div className='text-12px text-t-secondary'>{t('preview.ppt.installHint')}</div>
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
  return <iframe src={watchUrl} className='w-full h-full border-0 bg-bg-1' title='PPT Preview' />;
};

export default PptViewer;
