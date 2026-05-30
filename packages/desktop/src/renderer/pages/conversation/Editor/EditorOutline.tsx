/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Outline / structure panel — left rail of the editor body. Lists the
 * symbols extracted from the active buffer (functions, classes, types).
 * Click a symbol → reveals that line in Monaco and centers it.
 *
 * The single biggest "this looks like a real IDE" signal we can ship
 * without LSP. Empty state collapses gracefully for plain-text buffers.
 */

import { Tooltip } from '@arco-design/web-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { extractOutline, glyphFor, type OutlineSymbol } from './outlineParser';
import type { OpenBuffer } from './types';

type Props = {
  activeBuffer: OpenBuffer | null;
  onSelectSymbol: (symbol: OutlineSymbol) => void;
};

const EditorOutline: React.FC<Props> = ({ activeBuffer, onSelectSymbol }) => {
  const { t } = useTranslation();

  const symbols = useMemo<OutlineSymbol[]>(() => {
    if (!activeBuffer) return [];
    return extractOutline(activeBuffer.language, activeBuffer.content);
  }, [activeBuffer]);

  const lineCount = useMemo(() => {
    if (!activeBuffer) return 0;
    return activeBuffer.content === '' ? 0 : activeBuffer.content.split(/\r?\n/).length;
  }, [activeBuffer]);

  return (
    <aside className='editor-outline' aria-label={t('conversation.editor.outlineLabel')}>
      <header className='editor-outline__header'>
        <span className='editor-outline__title'>{t('conversation.editor.outlineTitle')}</span>
        <span className='editor-outline__count'>
          {t('conversation.editor.outlineCount', { count: symbols.length })}
        </span>
      </header>

      {activeBuffer && (
        <div className='editor-outline__file'>
          <div className='editor-outline__file-name'>{activeBuffer.fileName}</div>
          <div className='editor-outline__file-meta'>
            {t('conversation.editor.lineCount', { count: lineCount })} ·{' '}
            {t('conversation.editor.totalChars', { count: activeBuffer.content.length })}
          </div>
        </div>
      )}

      <div className='editor-outline__scroll'>
        {symbols.length === 0 ? (
          <div className='editor-outline__empty'>{t('conversation.editor.outlineEmpty')}</div>
        ) : (
          <ul className='editor-outline__list' role='listbox'>
            {symbols.map((s, i) => (
              <li key={`${s.name}-${s.line}-${i}`} role='option' aria-selected={false}>
                <Tooltip content={`${s.kind} · line ${s.line}`} position='right' mini>
                  <button
                    type='button'
                    className='editor-outline__row'
                    onClick={() => onSelectSymbol(s)}
                    title={`${s.name} — line ${s.line}`}
                  >
                    <span className={`editor-outline__glyph editor-outline__glyph--${s.kind}`} aria-hidden>
                      {glyphFor(s.kind)}
                    </span>
                    <span className='editor-outline__name'>{s.name}</span>
                    <span className='editor-outline__line'>{s.line}</span>
                  </button>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
};

export default EditorOutline;
