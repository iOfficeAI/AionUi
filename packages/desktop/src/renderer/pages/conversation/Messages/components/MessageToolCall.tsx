/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageToolCall } from '@/common/chat/chatLib';
import { normalizeToolCall } from '@/common/chat/normalizeToolCall';
import type { NormalizedToolStatus } from '@/common/chat/normalizeToolCall';
import FileChangesPanel from '@/renderer/components/base/FileChangesPanel';
import { useDiffPreviewHandlers } from '@/renderer/hooks/file/useDiffPreviewHandlers';
import { parseDiff } from '@/renderer/utils/file/diffUtils';
import LocalImageView from '@/renderer/components/media/LocalImageView';
import { usePreviewLauncher } from '@/renderer/hooks/file/usePreviewLauncher';
import { getFileTypeInfo } from '@/renderer/utils/file/fileType';
import { Badge } from '@arco-design/web-react';
import { IconDown, IconRight } from '@arco-design/web-react/icon';
import { createTwoFilesPatch } from 'diff';
import React, { useCallback, useMemo, useState } from 'react';
import type { BadgeProps } from '@arco-design/web-react';
import './MessageToolGroupSummary.css';

const IMAGE_GEN_TOOL_NAMES = new Set(['pounding_image_generation', 'image_generation', 'generate_image']);

/** Parse image path from image generation tool result text */
function parseImagePathFromText(text: string): string | null {
  const markerMatch = text.match(/<!--\s*POUNDING_IMG:(.+?)\s*-->/);
  if (markerMatch) return markerMatch[1].trim();
  const savedMatch = text.match(/Generated image saved to:\s*(.+)$/m);
  if (savedMatch) return savedMatch[1].trim();
  return null;
}

const statusToBadge = (status: NormalizedToolStatus): BadgeProps['status'] => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'error':
      return 'error';
    case 'running':
      return 'processing';
    default:
      return 'default';
  }
};

const ReplacePreview: React.FC<{ message: IMessageToolCall }> = ({ message }) => {
  const file_path = message.content.args?.file_path || message.content.input?.file_path || '';
  const old_string = message.content.args?.old_string ?? message.content.input?.old_string ?? '';
  const new_string = message.content.args?.new_string ?? message.content.input?.new_string ?? '';

  const diffText = useMemo(() => {
    return createTwoFilesPatch(file_path, file_path, old_string, new_string, '', '', { context: 3 });
  }, [file_path, old_string, new_string]);

  const fileInfo = useMemo(() => parseDiff(diffText, file_path), [diffText, file_path]);
  const display_name = file_path.split(/[/\\]/).pop() || file_path;
  const { handleFileClick, handleDiffClick } = useDiffPreviewHandlers({ diffText, display_name, file_path });

  return (
    <FileChangesPanel
      title={fileInfo.file_name}
      files={[fileInfo]}
      onFileClick={handleFileClick}
      onDiffClick={handleDiffClick}
      defaultExpanded={true}
    />
  );
};

const MessageToolCall: React.FC<{ message: IMessageToolCall }> = ({ message }) => {
  const { name } = message.content;
  const [expanded, setExpanded] = useState(false);

  if (name === 'replace' || name === 'Edit') {
    return <ReplacePreview message={message} />;
  }

  const normalized = normalizeToolCall(message);
  const { launchPreview } = usePreviewLauncher();

  const handlePreviewClick = useCallback(
    (e: React.MouseEvent, filePath: string) => {
      e.stopPropagation();
      const fileName = filePath.split(/[\\/]/).pop() || filePath;
      const { contentType, editable, language } = getFileTypeInfo(fileName);
      void launchPreview({
        originalPath: filePath,
        file_name: fileName,
        contentType,
        editable,
        language,
      });
    },
    [launchPreview]
  );

  if (!normalized) {
    return <div className='text-t-primary'>{name}</div>;
  }

  // Check for image generation tool output and show inline image
  const isImageGenTool = IMAGE_GEN_TOOL_NAMES.has(normalized.name);
  const imagePath = isImageGenTool && normalized.output ? parseImagePathFromText(normalized.output) : null;

  const hasDetail = normalized.input || normalized.output;

  return (
    <div className='flex flex-col'>
      <div className='flex flex-row color-#86909C gap-12px items-center'>
        <Badge
          status={statusToBadge(normalized.status)}
          className={normalized.status === 'running' ? 'badge-breathing' : ''}
        />
        <span
          className={
            'flex-1 min-w-0' +
            (expanded ? ' break-all' : ' truncate') +
            (hasDetail ? ' cursor-pointer hover:color-#4E5969' : '')
          }
          onClick={hasDetail ? () => setExpanded(!expanded) : undefined}
        >
          <span className='font-medium text-13px'>{normalized.name}</span>
          {normalized.description && <span className='m-l-4px opacity-80 text-13px'>{normalized.description}</span>}
        </span>
        {hasDetail && (
          <span
            className='flex-shrink-0 cursor-pointer hover:color-#4E5969 transition-colors'
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <IconDown style={{ fontSize: 12 }} /> : <IconRight style={{ fontSize: 12 }} />}
          </span>
        )}
      </div>
      {imagePath && expanded && (
        <div className='flex flex-col gap-4px m-l-20px m-t-8px'>
          <LocalImageView src={imagePath} alt={imagePath} className='max-w-100% max-h-300px object-contain' />
          <span
            className='text-12px text-t-secondary cursor-pointer hover:text-[rgb(var(--arcoblue-6))] hover:underline self-start'
            onClick={(e) => handlePreviewClick(e, imagePath)}
          >
            {imagePath.split(/[\\/]/).pop() || imagePath}
          </span>
        </div>
      )}
      {expanded && hasDetail && (
        <div className='tool-detail-panel m-l-20px m-t-4px'>
          {normalized.input && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>Input</div>
              <pre className='tool-detail-content'>{normalized.input}</pre>
            </div>
          )}
          {normalized.output && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>Output</div>
              <pre className='tool-detail-content'>{normalized.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MessageToolCall;
