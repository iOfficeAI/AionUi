/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpToolCall } from '@/common/chatLib';
import FileChangesPanel from '@/renderer/components/base/FileChangesPanel';
import { useDiffPreviewHandlers } from '@/renderer/hooks/useDiffPreviewHandlers';
import { parseDiff } from '@/renderer/utils/diffUtils';
import { Card, Tag } from '@arco-design/web-react';
import { createTwoFilesPatch } from 'diff';
import React, { useMemo } from 'react';
import MarkdownView from '../../components/Markdown';

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
const DiffContentView: React.FC<{ oldText: string; newText: string; path: string }> = ({ oldText, newText, path }) => {
  const displayName = path.split(/[/\\]/).pop() || path || 'Unknown file';
  const formattedDiff = useMemo(() => createTwoFilesPatch(displayName, displayName, oldText, newText, '', '', { context: 3 }), [displayName, oldText, newText]);
  const fileInfo = useMemo(() => parseDiff(formattedDiff, displayName), [formattedDiff, displayName]);
  const { handleFileClick, handleDiffClick } = useDiffPreviewHandlers({ diffText: formattedDiff, displayName, filePath: path || displayName });

  return <FileChangesPanel title={displayName} files={[fileInfo]} onFileClick={handleFileClick} onDiffClick={handleDiffClick} defaultExpanded={true} />;
};

const ContentView: React.FC<{ content: IMessageAcpToolCall['content']['update']['content'][0] }> = ({ content }) => {
  if (content.type === 'diff') {
    return <DiffContentView oldText={content.oldText || ''} newText={content.newText || ''} path={content.path || ''} />;
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

const MessageAcpToolCall: React.FC<{ message: IMessageAcpToolCall }> = ({ message }) => {
  const { content } = message;
  if (!content?.update) {
    return null;
  }
  const { update } = content;
  const { toolCallId, kind, title, status, rawInput, content: diffContent } = update;

  const getKindDisplayName = (kind: string) => {
    switch (kind) {
      case 'edit':
        return 'File Edit';
      case 'read':
        return 'File Read';
      case 'execute':
        return 'Shell Command';
      default:
        return kind;
    }
  };

  return (
    <Card className='w-full mb-2' size='small' bordered>
      <div className='flex items-start gap-3'>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 mb-2'>
            <span className='font-medium text-t-primary'>{title || getKindDisplayName(kind)}</span>
            <StatusTag status={status} />
          </div>
          {rawInput && <div className='text-sm'>{typeof rawInput === 'string' ? <MarkdownView>{`\`\`\`\n${rawInput}\n\`\`\``}</MarkdownView> : <pre className='bg-1 p-2 rounded text-xs overflow-x-auto'>{JSON.stringify(rawInput, null, 2)}</pre>}</div>}
          {diffContent && diffContent.length > 0 && (
            <div>
              {diffContent.map((content, index) => (
                <ContentView key={index} content={content} />
              ))}
            </div>
          )}
          <div className='text-xs text-t-secondary mt-2'>Tool Call ID: {toolCallId}</div>
        </div>
      </div>
    </Card>
  );
};

export default MessageAcpToolCall;
