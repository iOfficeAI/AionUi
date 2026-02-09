/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PreviewMetadata } from '../../context/PreviewContext';
import { useTextSelection } from '@/renderer/hooks/useTextSelection';
import { Checkbox } from '@arco-design/web-react';
import classNames from 'classnames';
import { html } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs, vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import SelectionToolbar from '../renderers/SelectionToolbar';
import { useTranslation } from 'react-i18next';

interface DiffPreviewProps {
  content: string; // Diff content
  metadata?: PreviewMetadata;
  onClose?: () => void;
  hideToolbar?: boolean;
  viewMode?: 'source' | 'preview';
  onViewModeChange?: (mode: 'source' | 'preview') => void;
  sideBySide?: boolean;
  onSideBySideChange?: (value: boolean) => void;
}

/**
 * Diff preview component with rich diff2html rendering
 */
const DiffPreview: React.FC<DiffPreviewProps> = ({ content, hideToolbar = false, viewMode: externalViewMode, onViewModeChange, sideBySide: externalSideBySide, onSideBySideChange }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });
  const [internalViewMode, setInternalViewMode] = useState<'source' | 'preview'>('preview');
  const [internalSideBySide, setInternalSideBySide] = useState(false);

  const sideBySide = externalSideBySide !== undefined ? externalSideBySide : internalSideBySide;
  const setSideBySide = onSideBySideChange || setInternalSideBySide;

  const viewMode = externalViewMode !== undefined ? externalViewMode : internalViewMode;

  useEffect(() => {
    const updateTheme = () => {
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

  const diffHtmlContent = useMemo(() => {
    return html(content, {
      outputFormat: sideBySide ? 'side-by-side' : 'line-by-line',
      drawFileList: false,
      matching: 'lines',
      matchWordsThreshold: 0,
      maxLineLengthHighlight: 20,
      matchingMaxComparisons: 3,
      diffStyle: 'word',
      renderNothingWhenEmpty: false,
    });
  }, [content, sideBySide]);

  const handleDownload = () => {
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

  const handleViewModeChange = (mode: 'source' | 'preview') => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    } else {
      setInternalViewMode(mode);
    }
  };

  return (
    <div className='flex flex-col w-full h-full overflow-hidden'>
      {!hideToolbar && (
        <div className='flex items-center justify-between h-40px px-12px bg-bg-2 flex-shrink-0'>
          <div className='flex items-center gap-4px'>
            <div className={`px-12px py-4px rd-4px cursor-pointer transition-colors text-12px ${viewMode === 'source' ? 'bg-primary text-white' : 'text-t-secondary hover:bg-bg-3'}`} onClick={() => handleViewModeChange('source')}>
              {t('preview.source')}
            </div>
            <div className={`px-12px py-4px rd-4px cursor-pointer transition-colors text-12px ${viewMode === 'preview' ? 'bg-primary text-white' : 'text-t-secondary hover:bg-bg-3'}`} onClick={() => handleViewModeChange('preview')}>
              {t('preview.preview')}
            </div>
          </div>

          <div className='flex items-center gap-8px'>
            {viewMode === 'preview' && (
              <Checkbox className='whitespace-nowrap text-12px' checked={sideBySide} onChange={(value) => setSideBySide(value)}>
                <span className='text-12px text-t-secondary'>side-by-side</span>
              </Checkbox>
            )}
            <div className='flex items-center gap-4px px-8px py-4px rd-4px cursor-pointer hover:bg-bg-3 transition-colors' onClick={handleDownload} title={t('preview.downloadDiff')}>
              <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' className='text-t-secondary'>
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
          <SyntaxHighlighter style={currentTheme === 'dark' ? vs2015 : vs} language='diff' PreTag='div' showLineNumbers wrapLongLines customStyle={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {content}
          </SyntaxHighlighter>
        ) : (
          <div
            className={classNames('w-full max-w-full min-w-0', '![&_.line-num1]:hidden ![&_.line-num2]:w-30px', '[&_td:first-child]:w-40px ![&_td:nth-child(2)>div]:pl-45px', '[&_div.d2h-file-wrapper]:rd-[0.3rem_0.3rem_0px_0px]', '[&_div.d2h-file-header]:items-center [&_div.d2h-file-header]:bg-bg-3', {
              'd2h-dark-color-scheme': currentTheme === 'dark',
            })}
            dangerouslySetInnerHTML={{ __html: diffHtmlContent }}
          />
        )}
      </div>

      {selectedText && <SelectionToolbar selectedText={selectedText} position={selectionPosition} onClear={clearSelection} />}
    </div>
  );
};

export default DiffPreview;
