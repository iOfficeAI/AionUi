/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from '@arco-design/web-react';
import { Copy } from '@icon-park/react';
import katex from 'katex';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { copyText } from '@/renderer/utils/ui/clipboard';

type InlineMathProps = {
  math: string;
  style?: React.CSSProperties;
  className?: string;
};

const InlineMath: React.FC<InlineMathProps> = ({ math, style, className }) => {
  const { t } = useTranslation();
  const rawMath = (math || '').trim();

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!rawMath) return;
      try {
        await copyText(rawMath);
        try {
          Message.success({
            content: t('common.copySuccess', { defaultValue: 'Copied to clipboard' }),
            duration: 1500,
          });
        } catch {
          /* ignore portal error in tests */
        }
      } catch {
        try {
          Message.error(t('common.copyFailed', { defaultValue: 'Failed to copy' }));
        } catch {
          /* ignore */
        }
      }
    },
    [rawMath, t]
  );

  let html = '';
  try {
    html = katex.renderToString(rawMath, { displayMode: false, throwOnError: false });
  } catch {
    html = rawMath;
  }

  return (
    <span
      onClick={handleCopy}
      style={style}
      className={`group relative inline-flex items-center gap-2px max-w-full px-4px py-1px my-1px text-0.95em rd-3px cursor-pointer hover:bg-bg-3 transition-colors align-baseline select-text ${className || ''}`}
      title={t('common.clickToCopyMath', { defaultValue: 'Click to copy LaTeX math' })}
    >
      <span className='katex-inline' dangerouslySetInnerHTML={{ __html: html }} />
      <button
        type='button'
        onClick={handleCopy}
        className='opacity-0 group-hover:opacity-100 transition-opacity p-2px border-0 bg-transparent text-t-secondary hover:text-t-primary cursor-pointer inline-flex items-center justify-center flex-shrink-0'
        aria-label={t('common.copy', { defaultValue: 'Copy' })}
      >
        <Copy size='12' />
      </button>
    </span>
  );
};

export default InlineMath;
