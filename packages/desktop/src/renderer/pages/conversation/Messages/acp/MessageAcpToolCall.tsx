/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpToolCall } from '@/common/chat/chatLib';
import { getAcpImageFileName, getAcpImagePath } from '@/common/chat/acpToolCallOutput';
import FileChangesPanel from '@/renderer/components/base/FileChangesPanel';
import LocalImageView from '@/renderer/components/media/LocalImageView';
import { useDiffPreviewHandlers } from '@/renderer/hooks/file/useDiffPreviewHandlers';
import { parseDiff } from '@/renderer/utils/file/diffUtils';
import { downloadFileFromPath } from '@/renderer/utils/file/download';
import { Button, Card, Message, Tag, Tooltip } from '@arco-design/web-react';
import { Download } from '@icon-park/react';
import { createTwoFilesPatch } from 'diff';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import MarkdownView from '@renderer/components/Markdown';

const StatusTag: React.FC<{ status: string }> = ({ status }) => {
  const getTagProps = () => {
    switch (status) {
      case 'pending':
        return { color: 'blue', text: 'Pending' };
      case 'in_progress':
        return { color: 'orange', text: 'In Progress' };
      default:
        return { color: 'gray', text: status };
    }
  };

  const { color, text } = getTagProps();
  return <Tag color={color}>{text}</Tag>;
};

// Diff content display as a separate component to ensure hooks are called unconditionally
const DiffContentView: React.FC<{ old_text: string; new_text: string; path: string }> = ({
  old_text,
  new_text,
  path,
}) => {
  const display_name = path.split(/[/\\]/).pop() || path || 'Unknown file';
  const formattedDiff = useMemo(
    () => createTwoFilesPatch(display_name, display_name, old_text, new_text, '', '', { context: 3 }),
    [display_name, old_text, new_text]
  );
  const fileInfo = useMemo(() => parseDiff(formattedDiff, display_name), [formattedDiff, display_name]);
  const { handleFileClick, handleDiffClick } = useDiffPreviewHandlers({
    diffText: formattedDiff,
    display_name,
    file_path: path || display_name,
  });

  return (
    <FileChangesPanel
      title={display_name}
      files={[fileInfo]}
      onFileClick={handleFileClick}
      onDiffClick={handleDiffClick}
      defaultExpanded={true}
    />
  );
};

const ContentView: React.FC<{ content: IMessageAcpToolCall['content']['update']['content'][0] }> = ({ content }) => {
  if (content.type === 'diff') {
    return (
      <DiffContentView old_text={content.old_text || ''} new_text={content.new_text || ''} path={content.path || ''} />
    );
  }

  // 处理 content 类型，包含 text 内容
  if (content.type === 'content' && content.content && content.content.type === 'text' && content.content.text) {
    return (
      <div className='mt-3'>
        <div className='bg-1 p-3 rounded border overflow-hidden'>
          <div className='overflow-x-auto break-words'>
            <MarkdownView>{content.content.text}</MarkdownView>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

const getKindDisplayName = (toolKind: string) => {
  switch (toolKind) {
    case 'edit':
      return 'File Edit';
    case 'read':
      return 'File Read';
    case 'execute':
      return 'Shell Command';
    default:
      return toolKind;
  }
};

const MessageAcpToolCall: React.FC<{ message: IMessageAcpToolCall }> = ({ message }) => {
  const { t } = useTranslation();
  const { content } = message;
  if (!content?.update) {
    return null;
  }
  const { update } = content;
  const { tool_call_id, kind, title, status, rawInput, content: diffContent } = update;
  const imagePath = getAcpImagePath(update);
  const imageAlt = imagePath?.split(/[/\\]/).pop() || t('acp.image.generated_alt');
  const [messageApi, messageContext] = Message.useMessage();
  const handleDownloadImage = useCallback(
    async (path: string) => {
      try {
        await downloadFileFromPath(path, getAcpImageFileName(path));
        messageApi.success(t('acp.image.download_success'));
      } catch (error) {
        console.error('[MessageAcpToolCall] Failed to download image:', error);
        messageApi.error(t('acp.image.download_error'));
      }
    },
    [messageApi, t]
  );

  return (
    <Card className='w-full mb-2' size='small' bordered>
      {messageContext}
      <div className='flex items-start gap-3'>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 mb-2'>
            <span className='font-medium text-t-primary'>{title || getKindDisplayName(kind)}</span>
            <StatusTag status={status} />
          </div>
          {rawInput && (
            <div className='text-sm'>
              {typeof rawInput === 'string' ? (
                <MarkdownView>{`\`\`\`\n${rawInput}\n\`\`\``}</MarkdownView>
              ) : (
                <pre className='bg-1 p-2 rounded text-xs overflow-x-auto'>{JSON.stringify(rawInput, null, 2)}</pre>
              )}
            </div>
          )}
          {imagePath && (
            <div className='group relative mt-3 overflow-hidden rounded border bg-1 p-2'>
              <LocalImageView
                src={imagePath}
                alt={imageAlt}
                className='max-w-full max-h-[520px] object-contain rounded'
              />
              <Tooltip content={t('acp.image.download')}>
                <Button
                  aria-label={t('acp.image.download_aria')}
                  className='!absolute right-10px top-10px !h-28px !w-28px !p-0 opacity-0 shadow-sm transition-opacity group-hover:opacity-90 focus:opacity-100'
                  type='secondary'
                  size='mini'
                  shape='circle'
                  icon={<Download theme='outline' size='14' />}
                  onClick={() => void handleDownloadImage(imagePath)}
                />
              </Tooltip>
            </div>
          )}
          {diffContent && diffContent.length > 0 && (
            <div>
              {diffContent.map((item, index) => (
                <ContentView key={index} content={item} />
              ))}
            </div>
          )}
          <div className='text-xs text-t-secondary mt-2'>Tool Call ID: {tool_call_id}</div>
        </div>
      </div>
    </Card>
  );
};

export default MessageAcpToolCall;
