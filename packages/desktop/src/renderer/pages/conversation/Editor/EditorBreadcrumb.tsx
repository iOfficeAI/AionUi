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
 *
 * Non-leaf segments (directory pieces) are clickable and fire
 * `onRevealSegment`. The active buffer's full `filePath` is always passed
 * along — the parent decides whether to dispatch a reveal request to the
 * file tree or open the file in the editor.
 */

import { Right } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { getLanguageDisplayName } from './editorLanguage';
import type { OpenBuffer } from './types';

type Props = {
  activeBuffer: OpenBuffer | null;
  /**
   * Called when a non-leaf breadcrumb segment is clicked. The argument is
   * the workspace-relative path of that segment (POSIX). The parent
   * typically uses this to dispatch a reveal-in-tree request.
   */
  onRevealSegment?: (relativePath: string) => void;
};

const EditorBreadcrumb: React.FC<Props> = ({ activeBuffer, onRevealSegment }) => {
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

  // Pre-compute the relative path corresponding to each segment, so a
  // click on "src/components" yields "src/components" and not the raw
  // "components" string.
  const segmentRelativePaths = (() => {
    if (!activeBuffer.filePath) return segments.map(() => '');
    return segments.map((_seg, i) => {
      // If we truncated, the first segment is the "…" placeholder and
      // has no meaningful path.
      if (segments[0] === '…') {
        if (i === 0) return '';
        // Re-derive from the actual file path, skipping the first
        // placeholder slot.
        const tailStart = activeBuffer.filePath.split('/').filter(Boolean).length - (segments.length - 1);
        const allParts = activeBuffer.filePath.replace(/\\/g, '/').split('/').filter(Boolean);
        return allParts.slice(tailStart, tailStart + i).join('/');
      }
      const allParts = activeBuffer.filePath.replace(/\\/g, '/').split('/').filter(Boolean);
      return allParts.slice(0, i + 1).join('/');
    });
  })();

  const languageLabel = getLanguageDisplayName(activeBuffer.language);

  const handleSegmentClick = (relativePath: string, isLast: boolean): void => {
    if (isLast || !onRevealSegment) return;
    onRevealSegment(relativePath);
  };

  return (
    <div className='editor-breadcrumb' role='navigation' aria-label={t('conversation.editor.breadcrumbLabel')}>
      <div className='editor-breadcrumb__segments'>
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          const rel = segmentRelativePaths[i] ?? '';
          const clickable = !isLast && onRevealSegment && rel.length > 0;
          return (
            <React.Fragment key={`${seg}-${i}`}>
              {clickable ? (
                <button
                  type='button'
                  className='editor-breadcrumb__seg editor-breadcrumb__seg--clickable'
                  onClick={() => handleSegmentClick(rel, isLast)}
                  title={t('conversation.editor.revealInTree', { defaultValue: 'Reveal in tree' })}
                >
                  {seg}
                </button>
              ) : (
                <span className={`editor-breadcrumb__seg ${isLast ? 'editor-breadcrumb__seg--leaf' : ''}`}>{seg}</span>
              )}
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
