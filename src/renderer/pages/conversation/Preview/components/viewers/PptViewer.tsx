/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
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

    const start = async () => {
      setLoading(true);
      setError(null);
      try {
        const { url } = await ipcBridge.pptPreview.start.invoke({ filePath });
        if (!cancelled) {
          setWatchUrl(url);
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
          <span className='text-13px text-t-secondary'>{t('preview.ppt.loading')}</span>
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

  return <WebviewHost url={watchUrl} className='bg-bg-1' />;
};

export default PptViewer;
