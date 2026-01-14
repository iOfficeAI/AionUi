/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageToolCall } from '@/common/chatLib';
import { Alert, Checkbox } from '@arco-design/web-react';
import { MessageSearch } from '@icon-park/react';
import { createTwoFilesPatch } from 'diff';
import { html } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import React, { useMemo, useState } from 'react';
import MarkdownView from '../components/Markdown';
import { iconColors } from '@/renderer/theme/colors';

const Diff2Html = ({ message }: { message: IMessageToolCall }) => {
  const [sideBySide, setSideBySide] = useState(false);
  const diffHtmlContent = useMemo(() => {
    const file = message.content.args.file_path;
    const diffText = createTwoFilesPatch(file, file, message.content.args.old_string ?? '', message.content.args.new_string ?? '', '', '', { context: 3 });
    return html(diffText, {
      outputFormat: sideBySide ? 'side-by-side' : 'line-by-line',
      drawFileList: false,
      matching: 'lines',
      matchWordsThreshold: 0,
      maxLineLengthHighlight: 20,
      matchingMaxComparisons: 3,
      diffStyle: 'word',
      renderNothingWhenEmpty: false,
    });
  }, [message.content.args, sideBySide]);
  return (
    <div className='relative'>
      <div
        dangerouslySetInnerHTML={{
          __html: diffHtmlContent,
        }}
      ></div>
      <div className='absolute top-12px right-10px flex items-center justify-center'>
        <Checkbox className={'!flex items-center justify-center'} checked={sideBySide} onChange={(value) => setSideBySide(value)}>
          <span className='whitespace-nowrap text-t-primary'>side-by-side</span>
        </Checkbox>
      </div>
    </div>
  );
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
    return <Diff2Html message={message}></Diff2Html>;
  }
  return <div className='text-t-primary'>{message.content.name}</div>;
};

export default MessageToolCall;
