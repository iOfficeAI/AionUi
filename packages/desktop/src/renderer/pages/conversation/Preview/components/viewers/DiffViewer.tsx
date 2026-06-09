/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Full-bleed diff preview used by the conversation Preview panel.
 *
 * Replaces the previous diff2html-based renderer with a Pierre Diffs
 * implementation (see `DiffView`). Adds the panel's own toolbar (source /
 * preview toggle + download) on top of the shared viewer, which exposes
 * the stacked / side-by-side toggle and click-to-open navigation.
 */

import type { PreviewMetadata } from '../../context/PreviewContext';
import { useTextSelection } from '@/renderer/hooks/ui/useTextSelection';
import { ipcBridge } from '@/common';
import { Checkbox } from '@arco-design/web-react';
import React, { useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { forgeDark, forgeLight } from '@/renderer/components/Markdown/codeThemes';
import SelectionToolbar from '../renderers/SelectionToolbar';
import { useTranslation } from 'react-i18next';
import DiffView from '@/renderer/components/media/DiffView';

interface DiffPreviewProps {
  content: string; // Diff content
  metadata?: PreviewMetadata;
  onClose?: () => void;
  hideToolbar?: boolean;
  viewMode?: 'source' | 'preview';
  onViewModeChange?: (mode: 'source' | 'preview') => void;
}

/**
 * Diff preview component built on top of the shared Pierre Diffs viewer.
 */
const DiffPreview: React.FC<DiffPreviewProps> = ({
  content,
  hideToolbar = false,
  viewMode: externalViewMode,
  onViewModeChange,
  metadata,
}) => {
  const { t } = useTranslation();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document === 'undefined') return 'light';
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });
  const [internalViewMode, setInternalViewMode] = useState<'source' | 'preview'>('preview');
  const [sideBySide, setSideBySide] = useState(false);

  const viewMode = externalViewMode !== undefined ? externalViewMode : internalViewMode;

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const updateTheme = (): void => {
      const theme = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
      setCurrentTheme(theme);
    };
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const { selectedText, selectionPosition, clearSelection } = useTextSelection(containerRef);

  const handleDownload = (): void => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diff-${Date.now()}.diff`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleViewModeChange = (mode: 'source' | 'preview'): void => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    } else {
      setInternalViewMode(mode);
    }
  };

  // Resolve the file path for click-to-open. Prefer the metadata's
  // file_path (set when the preview was launched from a workspace file)
  // and fall back to the diff header parsing done inside DiffView.
  const resolvedFilePath = metadata?.file_path;

  // Touch the ipcBridge import so it isn't tree-shaken on builds that
  // don't render a line click. The actual line jump is dispatched from
  // DiffView itself; we keep the import for the file-download action and
  // future actions that may live here.
  void ipcBridge;

  return (
    <div className='flex flex-col w-full h-full overflow-hidden'>
      {!hideToolbar && (
        <div className='flex items-center justify-between h-40px px-12px bg-bg-2 flex-shrink-0'>
          <div className='flex items-center gap-4px'>
            <div
              className={`px-12px py-4px rd-4px cursor-pointer transition-colors text-12px ${viewMode === 'source' ? 'bg-primary text-white' : 'text-t-secondary hover:bg-bg-3'}`}
              onClick={() => handleViewModeChange('source')}
            >
              {t('preview.source')}
            </div>
            <div
              className={`px-12px py-4px rd-4px cursor-pointer transition-colors text-12px ${viewMode === 'preview' ? 'bg-primary text-white' : 'text-t-secondary hover:bg-bg-3'}`}
              onClick={() => handleViewModeChange('preview')}
            >
              {t('preview.preview')}
            </div>
          </div>

          <div className='flex items-center gap-8px'>
            {viewMode === 'preview' && (
              <Checkbox
                className='whitespace-nowrap text-12px'
                checked={sideBySide}
                onChange={(value) => setSideBySide(Boolean(value))}
              >
                <span className='text-12px text-t-secondary'>side-by-side</span>
              </Checkbox>
            )}
            <div
              className='flex items-center gap-4px px-8px py-4px rd-4px cursor-pointer hover:bg-bg-3 transition-colors'
              onClick={handleDownload}
              title={t('preview.downloadDiff')}
            >
              <svg
                width='14'
                height='14'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                className='text-t-secondary'
              >
                <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
                <polyline points='7 10 12 15 17 10' />
                <line x1='12' y1='15' x2='12' y2='3' />
              </svg>
              <span className='text-12px text-t-secondary'>{t('common.download')}</span>
            </div>
          </div>
        </div>
      )}

      <div ref={containerRef} className='flex-1 overflow-auto p-16px'>
        {viewMode === 'source' ? (
          <SyntaxHighlighter
            style={currentTheme === 'dark' ? forgeDark : forgeLight}
            language='diff'
            PreTag='div'
            showLineNumbers
            wrapLongLines
          >
            {content}
          </SyntaxHighlighter>
        ) : (
          <DiffView
            diff={content}
            file_path={resolvedFilePath}
            initialSplit={sideBySide}
            onSplitChange={setSideBySide}
            hideToolbar
            className='w-full h-full'
          />
        )}
      </div>

      {selectedText && (
        <SelectionToolbar selectedText={selectedText} position={selectionPosition} onClear={clearSelection} />
      )}
    </div>
  );
};

export default DiffPreview;
