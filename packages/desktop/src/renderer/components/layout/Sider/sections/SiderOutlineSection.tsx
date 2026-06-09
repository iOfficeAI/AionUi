/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Outline (a.k.a. structure) view for the active editor buffer. Rendered
 * inside the Sider's accordion section as a third panel below Explorer
 * and Diff.
 *
 * Reuses the .editor-outline* classes defined in editor.css so this
 * stays visually consistent with the in-editor outline rail that lived
 * there before. Symbols are extracted by `extractOutline` (the same
 * parser EditorOutline used) and clicking a row dispatches
 * `requestEditorRevealLine` — a window CustomEvent the editor listens
 * for, which keeps the Sider decoupled from the editor's component tree.
 *
 * React.memo + the useMemo guard isolate this component from
 * typing-induced re-renders. `activeBuffer.content` changes on every
 * keystroke, so without the memoization the outline would re-parse the
 * whole file on every keypress. The memo is keyed on content and
 * language only — switching files triggers a fresh parse exactly once.
 */

import React, { useMemo } from 'react';
import { Tooltip } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useEditorContext } from '@renderer/pages/conversation/Editor/EditorContext';
import { extractOutline, glyphFor } from '@renderer/pages/conversation/Editor/outlineParser';
import { requestEditorRevealLine } from '@renderer/pages/conversation/Editor/editorReveal';
import { getEditorFileName } from '@renderer/pages/conversation/Editor/editorLanguage';
import '@/renderer/pages/conversation/Editor/editor.css';

const SiderOutlineSection: React.FC = () => {
  const { t } = useTranslation();
  const { activeBuffer } = useEditorContext();

  const symbols = useMemo(
    () => (activeBuffer ? extractOutline(activeBuffer.language, activeBuffer.content) : []),
    [activeBuffer?.language, activeBuffer?.content]
  );

  if (!activeBuffer) {
    return <div className='editor-outline__empty'>{t('conversation.sider.outlineNoFile')}</div>;
  }

  const fileName = getEditorFileName(activeBuffer.filePath ?? activeBuffer.fileName);

  const handleClick = (line: number): void => {
    requestEditorRevealLine({ line });
  };

  return (
    <>
      {fileName ? (
        <div className='editor-outline__file'>
          <div className='editor-outline__file-name' title={fileName}>
            {fileName}
          </div>
          <div className='editor-outline__file-meta'>{activeBuffer.language}</div>
        </div>
      ) : null}
      <div className='editor-outline__scroll'>
        {symbols.length === 0 ? (
          <div className='editor-outline__empty'>{t('conversation.editor.outlineEmpty')}</div>
        ) : (
          <ul className='editor-outline__list' role='listbox' aria-label={t('conversation.editor.outlineTitle')}>
            {symbols.map((s) => (
              <li key={`${s.kind}-${s.name}-${s.line}`}>
                <Tooltip content={`${s.name} · Ln ${s.line}`} position='right' mini>
                  <button type='button' className='editor-outline__row' onClick={() => handleClick(s.line)}>
                    <span className={`editor-outline__glyph editor-outline__glyph--${s.kind}`}>{glyphFor(s.kind)}</span>
                    <span className='editor-outline__name'>{s.name}</span>
                    <span className='editor-outline__line'>{s.line}</span>
                  </button>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
};

export default React.memo(SiderOutlineSection);
