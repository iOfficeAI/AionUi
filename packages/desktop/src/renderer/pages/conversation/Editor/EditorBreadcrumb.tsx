/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Breadcrumb path bar — between the menubar and the tab strip. Splits the
 * active file's path into clickable segments. Pure visual richness; the
 * segments aren't navigable yet (Chisl doesn't have a file-tree view bound to
 * this), but they make the editor feel like a real IDE the moment you open a
 * file. Falls back gracefully to a single label for untitled buffers.
 */

import { Right } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { getLanguageDisplayName } from './editorLanguage';
import type { OpenBuffer } from './types';

type Props = {
  activeBuffer: OpenBuffer | null;
};

const EditorBreadcrumb: React.FC<Props> = ({ activeBuffer }) => {
  const { t } = useTranslation();

  if (!activeBuffer) return null;

  // Split the path on both `/` and `\` (Windows). Filter out empty segments
  // from leading slashes. Cap the visible segments so deep paths don't blow
  // out the row; if truncated, prepend an ellipsis segment.
  const segments = (() => {
    if (!activeBuffer.filePath) return [activeBuffer.fileName];
    const raw = activeBuffer.filePath.replace(/\\/g, '/').split('/').filter(Boolean);
    if (raw.length <= 6) return raw;
    return ['…', ...raw.slice(raw.length - 5)];
  })();

  const languageLabel = getLanguageDisplayName(activeBuffer.language);

  return (
    <div className='editor-breadcrumb' role='navigation' aria-label={t('conversation.editor.breadcrumbLabel')}>
      <div className='editor-breadcrumb__segments'>
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          return (
            <React.Fragment key={`${seg}-${i}`}>
              <span className={`editor-breadcrumb__seg ${isLast ? 'editor-breadcrumb__seg--leaf' : ''}`}>
                {seg}
              </span>
              {!isLast && (
                <span className='editor-breadcrumb__sep' aria-hidden>
                  <Right size={10} />
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div className='editor-breadcrumb__meta'>{languageLabel}</div>
    </div>
  );
};

export default EditorBreadcrumb;
