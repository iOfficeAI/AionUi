/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import FileChangesPanel from '@/renderer/components/base/FileChangesPanel';
import { useDiffPreviewHandlers } from '@/renderer/hooks/file/useDiffPreviewHandlers';
import { parseDiff } from '@/renderer/utils/file/diffUtils';
import { createTwoFilesPatch } from 'diff';
import type { UnifiedToolBlock } from '@/common/chat/unifiedToolBlock';
import { diffCountLabel } from '@/common/chat/toolBlockPresentation';
import ToolBlockShell from './ToolBlockShell';

/** Edit block: header with file name + diff-count chips; body reuses the
 * existing FileChangesPanel diff view (visual consistency with file summaries). */
const EditToolBlock: React.FC<{ block: UnifiedToolBlock }> = ({ block }) => {
  const counts = diffCountLabel(block.diff);
  const args = useMemo(() => {
    try {
      return block.input ? (JSON.parse(block.input) as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }, [block.input]);
  const oldString = typeof args.old_string === 'string' ? args.old_string : '';
  const newString = typeof args.new_string === 'string' ? args.new_string : '';
  const diffText = useMemo(
    () => createTwoFilesPatch(block.fileName ?? '', block.fileName ?? '', oldString, newString, '', '', { context: 3 }),
    [block.fileName, oldString, newString]
  );
  const fileInfo = useMemo(() => parseDiff(diffText, block.fileName ?? ''), [diffText, block.fileName]);
  const { handleFileClick, handleDiffClick } = useDiffPreviewHandlers({
    diffText,
    display_name: block.fileName ?? '',
    file_path: block.filePath ?? block.fileName ?? '',
  });

  return (
    <ToolBlockShell
      category='edit'
      status={block.status}
      title={block.title}
      summary={block.fileName}
      chips={
        counts ? (
          <>
            <span className='tool-block__count tool-block__count--add tool-block__mono'>{counts.added}</span>
            <span className='tool-block__count tool-block__count--del tool-block__mono'>{counts.removed}</span>
          </>
        ) : undefined
      }
    >
      {oldString || newString ? (
        <FileChangesPanel
          title={block.fileName ?? ''}
          files={[fileInfo]}
          onFileClick={handleFileClick}
          onDiffClick={handleDiffClick}
          defaultExpanded={true}
        />
      ) : (
        <pre className='tool-detail-content tool-block__mono'>{block.output}</pre>
      )}
    </ToolBlockShell>
  );
};

export default EditToolBlock;
