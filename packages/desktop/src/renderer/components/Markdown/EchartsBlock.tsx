/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs, vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import * as echarts from 'echarts';

import { Message } from '@arco-design/web-react';
import { Copy, PreviewOpen } from '@icon-park/react';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { copyText } from '@/renderer/utils/ui/clipboard';
import { parseEChartsOption } from './echartsUtils';

type EchartsBlockProps = {
  code: string;
  isDark?: boolean;
  style?: React.CSSProperties;
  diagramPanZoom?: boolean;
};

const DEFAULT_CHART_HEIGHT = 360;

function EchartsBlock({ code, isDark = false, style, diagramPanZoom: _diagramPanZoom }: EchartsBlockProps) {
  const { t } = useTranslation();
  const { openPreview } = usePreviewContext();
  const showOpenInPanelButton = typeof openPreview === 'function';

  const preferredViewModeRef = useRef<'preview' | 'source'>('preview');
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview');
  const [renderError, setRenderError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  const parsedOption = useMemo(() => parseEChartsOption(code), [code]);

  const previewTitle = useMemo(() => {
    const summary = code
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return summary && summary.length > 0
      ? `${t('preview.echartsTitle')}: ${summary.slice(0, 48)}${summary.length > 48 ? '...' : ''}`
      : t('preview.echartsTitle');
  }, [code, t]);

  const initOrUpdateChart = useCallback(() => {
    if (!containerRef.current || !parsedOption) {
      return;
    }

    try {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }

      const theme = isDark ? 'dark' : undefined;
      const instance = echarts.init(containerRef.current, theme, {
        renderer: 'canvas',
      });

      const optionToSet = {
        backgroundColor: 'transparent',
        ...parsedOption,
      };

      instance.setOption(optionToSet, true);
      chartInstanceRef.current = instance;
      setRenderError(null);
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : String(err));
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    }
  }, [parsedOption, isDark]);

  useEffect(() => {
    if (viewMode !== 'preview' || !parsedOption) {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
      return;
    }

    initOrUpdateChart();

    const handleResize = () => {
      chartInstanceRef.current?.resize();
    };

    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, [viewMode, parsedOption, initOrUpdateChart]);

  const isValidChart = parsedOption !== null;
  const isDarkTheme = isDark;
  const codeTheme = isDarkTheme ? vs2015 : vs;

  return (
    <div style={{ width: '100%', minWidth: 0, maxWidth: '100%', ...style }}>
      <div
        style={{
          border: '1px solid var(--bg-3)',
          borderRadius: '0.3rem',
          overflow: 'hidden',
          overflowX: 'auto',
        }}
      >
        <div
          data-testid='echarts-header'
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--bg-2)',
            padding: '6px 10px',
            borderBottom: '1px solid var(--bg-3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                textDecoration: 'none',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                lineHeight: '20px',
              }}
            >
              {'<echarts>'}
            </span>
            {isValidChart && !renderError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div
                  data-testid='echarts-toggle-preview'
                  style={{
                    cursor: 'pointer',
                    color: viewMode === 'preview' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: '12px',
                    lineHeight: '20px',
                  }}
                  onMouseDown={(event: React.MouseEvent) => {
                    if (event.button === 0) {
                      event.preventDefault();
                      preferredViewModeRef.current = 'preview';
                      setViewMode('preview');
                    }
                  }}
                >
                  {t('preview.preview')}
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: '20px' }}>/</span>
                <div
                  data-testid='echarts-toggle-source'
                  style={{
                    cursor: 'pointer',
                    color: viewMode === 'source' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: '12px',
                    lineHeight: '20px',
                  }}
                  onMouseDown={(event: React.MouseEvent) => {
                    if (event.button === 0) {
                      event.preventDefault();
                      preferredViewModeRef.current = 'source';
                      setViewMode('source');
                    }
                  }}
                >
                  {t('preview.source')}
                </div>
              </div>
            )}
            {renderError && (
              <span style={{ color: 'var(--color-danger-6, #f53f3f)', fontSize: '11px' }}>
                ({t('preview.renderError')})
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {showOpenInPanelButton && (
              <PreviewOpen
                data-testid='echarts-open-in-panel'
                theme='outline'
                size='18'
                style={{ cursor: 'pointer', flexShrink: 0 }}
                fill='var(--text-secondary)'
                title={t('preview.openInPanelTooltip')}
                onClick={() => {
                  openPreview(`\`\`\`echarts\n${code}\n\`\`\``, 'markdown', {
                    title: previewTitle,
                    editable: false,
                  });
                }}
              />
            )}
            <Copy
              data-testid='echarts-copy'
              theme='outline'
              size='18'
              style={{ cursor: 'pointer', flexShrink: 0 }}
              fill='var(--text-secondary)'
              onClick={() => {
                void copyText(code)
                  .then(() => {
                    Message.success(t('common.copySuccess'));
                  })
                  .catch(() => {
                    Message.error(t('common.copyFailed'));
                  });
              }}
            />
          </div>
        </div>

        {isValidChart && viewMode === 'preview' && !renderError ? (
          <div
            data-testid='echarts-diagram'
            ref={containerRef}
            style={{
              width: '100%',
              height: `${DEFAULT_CHART_HEIGHT}px`,
              backgroundColor: 'var(--bg-1)',
              padding: '12px',
              boxSizing: 'border-box',
            }}
          />
        ) : (
          <SyntaxHighlighter
            children={code}
            language='json'
            style={codeTheme}
            PreTag='div'
            customStyle={{
              margin: 0,
              borderRadius: 0,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-primary)',
              overflowX: 'auto',
              maxWidth: '100%',
            }}
            codeTagProps={{ style: { color: 'var(--text-primary)' } }}
          />
        )}
      </div>
    </div>
  );
}

export default React.memo(EchartsBlock);
