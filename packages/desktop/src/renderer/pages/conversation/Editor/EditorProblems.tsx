/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as monaco from '@aionui/editor-monaco';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { OpenBuffer } from './types';
import { uriForBuffer } from './editorMonacoUri';

type ProblemRow = {
  id: string;
  line: number;
  message: string;
  severity: monaco.MarkerSeverity;
};

type Props = {
  activeBuffer: OpenBuffer | null;
  onSelectProblem: (line: number) => void;
};

const severityLabelKey = (severity: monaco.MarkerSeverity): string => {
  if (severity === monaco.MarkerSeverity.Error) return 'conversation.editor.problemError';
  if (severity === monaco.MarkerSeverity.Warning) return 'conversation.editor.problemWarning';
  return 'conversation.editor.problemInfo';
};

const EditorProblems: React.FC<Props> = ({ activeBuffer, onSelectProblem }) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ProblemRow[]>([]);

  const refresh = useCallback(() => {
    if (!activeBuffer) {
      setRows([]);
      return;
    }
    const uri = uriForBuffer(activeBuffer);
    const markers = monaco.editor.getModelMarkers({ resource: uri });
    const next: ProblemRow[] = markers
      .filter((m) => m.severity !== monaco.MarkerSeverity.Hint)
      .map((m, i) => ({
        id: `${m.startLineNumber}:${m.startColumn}:${i}`,
        line: m.startLineNumber,
        message: m.message,
        severity: m.severity,
      }))
      .toSorted((a, b) => a.line - b.line);
    setRows(next);
  }, [activeBuffer]);

  useEffect(() => {
    refresh();
    const sub = monaco.editor.onDidChangeMarkers((uris) => {
      if (!activeBuffer) return;
      const target = uriForBuffer(activeBuffer).toString();
      if (uris.some((u) => u.toString() === target)) refresh();
    });
    return () => sub.dispose();
  }, [activeBuffer, refresh]);

  if (!activeBuffer || rows.length === 0) return null;

  return (
    <div className='editor-problems' role='region' aria-label={t('conversation.editor.problemsTitle')}>
      <div className='editor-problems__header'>{t('conversation.editor.problemsTitle')}</div>
      <ul className='editor-problems__list'>
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type='button'
              className='editor-problems__item'
              onClick={() => onSelectProblem(row.line)}
              title={row.message}
            >
              <span
                className={`editor-problems__sev editor-problems__sev--${
                  row.severity === monaco.MarkerSeverity.Error
                    ? 'error'
                    : row.severity === monaco.MarkerSeverity.Warning
                      ? 'warning'
                      : 'info'
                }`}
              >
                {t(severityLabelKey(row.severity))}
              </span>
              <span className='editor-problems__line'>L{row.line}</span>
              <span className='editor-problems__msg'>{row.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default EditorProblems;
