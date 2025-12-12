/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexToolCallUpdate } from '@/common/chatLib';
import { Tag } from '@arco-design/web-react';
import React from 'react';
import Diff2Html from '../../../components/Diff2Html';
import BaseToolCallDisplay from './BaseToolCallDisplay';

type TurnDiffContent = Extract<CodexToolCallUpdate, { subtype: 'turn_diff' }>;

const TurnDiffDisplay: React.FC<{ content: TurnDiffContent }> = ({ content }) => {
  const { toolCallId, data } = content;
  const { unified_diff } = data;

  // 解析统一diff格式，提取文件信息
  const extractFileInfo = (diff: string) => {
    const lines = diff.split('\n');
    const gitLine = lines.find((line) => line.startsWith('diff --git'));
    if (gitLine) {
      const match = gitLine.match(/diff --git a\/(.+) b\/(.+)/);
      if (match) {
        const fullPath = match[1];
        const fileName = fullPath.split('/').pop() || fullPath; // 只取文件名
        return {
          fileName,
          fullPath,
          isNewFile: diff.includes('new file mode'),
          isDeletedFile: diff.includes('deleted file mode'),
        };
      }
    }
    return {
      fileName: 'Unknown file',
      fullPath: 'Unknown file',
      isNewFile: false,
      isDeletedFile: false,
    };
  };

  const fileInfo = extractFileInfo(unified_diff);
  const { fileName, fullPath, isNewFile, isDeletedFile } = fileInfo;

  // 截断长路径的函数
  const truncatePath = (path: string, maxLength: number = 60) => {
    if (path.length <= maxLength) return path;
    const parts = path.split('/');
    if (parts.length <= 2) return path;

    // 保留开头和结尾，中间用 ... 代替
    const start = parts.slice(0, 2).join('/');
    const end = parts.slice(-2).join('/');
    return `${start}/.../${end}`;
  };

  // 生成额外的标签来显示文件状态
  const additionalTags = (
    <>
      {isNewFile && <Tag color='green'>New File</Tag>}
      {isDeletedFile && <Tag color='red'>Deleted File</Tag>}
      {!isNewFile && !isDeletedFile && <Tag color='blue'>Modified</Tag>}
    </>
  );

  return (
    <BaseToolCallDisplay
      toolCallId={toolCallId}
      title='File Changes'
      status='success'
      description={
        <div className='max-w-full overflow-hidden'>
          <div className='text-sm text-t-secondary truncate' title={fullPath}>
            {truncatePath(fullPath)}
          </div>
        </div>
      }
      icon='📝'
      additionalTags={additionalTags}
    >
      <div className='mt-3 max-w-full overflow-hidden'>
        <Diff2Html diff={unified_diff} title={fileName} filePath={fullPath} className='border rounded w-full' />
      </div>
    </BaseToolCallDisplay>
  );
};

export default TurnDiffDisplay;
