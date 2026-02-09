/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageToolCall } from '@/common/chatLib';
import FileChangesPanel, { type FileChangeItem } from '@/renderer/components/base/FileChangesPanel';
import { usePreviewLauncher } from '@/renderer/hooks/usePreviewLauncher';
import { parseDiff } from './codex/MessageFileChanges';
import { Alert } from '@arco-design/web-react';
import { MessageSearch } from '@icon-park/react';
import { createTwoFilesPatch } from 'diff';
import React, { useCallback, useMemo } from 'react';
import MarkdownView from '../components/Markdown';
import { iconColors } from '@/renderer/theme/colors';

const ReplacePreview: React.FC<{ message: IMessageToolCall }> = ({ message }) => {
  const { launchPreview } = usePreviewLauncher();
  const filePath = message.content.args.file_path;

  const diffText = useMemo(() => {
    return createTwoFilesPatch(filePath, filePath, message.content.args.old_string ?? '', message.content.args.new_string ?? '', '', '', { context: 3 });
  }, [filePath, message.content.args.old_string, message.content.args.new_string]);

  const fileInfo = useMemo(() => parseDiff(diffText, filePath), [diffText, filePath]);

  const handleFileClick = useCallback(
    (_file: FileChangeItem) => {
      void launchPreview({
        relativePath: filePath,
        fileName: filePath.split(/[/\\]/).pop() || filePath,
        contentType: 'diff',
        editable: false,
        language: 'diff',
        diffContent: diffText,
      });
    },
    [diffText, filePath, launchPreview]
  );

  return <FileChangesPanel title={fileInfo.fileName} files={[fileInfo]} onFileClick={handleFileClick} defaultExpanded={true} />;
};

const MessageToolCall: React.FC<{ message: IMessageToolCall }> = ({ message }) => {
  if (['list_directory', 'read_file', 'write_file'].includes(message.content.name)) {
    const { absolute_path, path, file_path = absolute_path || path, status } = message.content.args;
    const OpName = message.content.name === 'read_file' ? 'ReadFile' : 'WriteFile';
    return <Alert content={OpName + ':' + file_path} type={status === 'error' ? 'error' : status === 'success' ? 'success' : 'info'}></Alert>;
  }
  if (message.content.name === 'google_web_search') {
    return <Alert icon={<MessageSearch theme='outline' fill={iconColors.primary} className='lh-[1]' />} content={message.content.args.query}></Alert>;
  }
  if (message.content.name === 'run_shell_command') {
    const shellSnippet = `\`\`\`shell\n${message.content.args.command}\n#${message.content.args.description}`;
    return <MarkdownView>{shellSnippet}</MarkdownView>;
  }
  if (message.content.name === 'replace') {
    return <ReplacePreview message={message} />;
  }
  return <div className='text-t-primary'>{message.content.name}</div>;
};

export default MessageToolCall;
