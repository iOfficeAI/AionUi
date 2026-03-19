/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexToolCallUpdate } from '@/common/chatLib';
import { Card, Tag } from '@arco-design/web-react';
import React from 'react';

type GenericUpdate = Extract<CodexToolCallUpdate, { subtype: 'generic' }>;

const StatusTag: React.FC<{ status: string }> = ({ status }) => {
  const getTagProps = () => {
    switch (status) {
      case 'pending':
        return { color: 'blue', text: 'Pending' };
      case 'executing':
        return { color: 'orange', text: 'Executing' };
      case 'success':
        return { color: 'green', text: 'Success' };
      case 'error':
        return { color: 'red', text: 'Error' };
      case 'canceled':
        return { color: 'gray', text: 'Canceled' };
      default:
        return { color: 'gray', text: status };
    }
  };

  const { color, text } = getTagProps();
  return <Tag color={color}>{text}</Tag>;
};

const getKindIcon = (kind: string) => {
  switch (kind) {
    case 'execute':
      return '🔧';
    case 'patch':
      return '📝';
    case 'mcp':
      return '🔌';
    case 'web_search':
      return '🔍';
    default:
      return '⚙️';
  }
};

const GenericDisplay: React.FC<{ content: GenericUpdate }> = ({ content }) => {
  const { toolCallId, kind, title, status, description, content: contentArray, data } = content;

  const getDisplayTitle = () => {
    if (title) return title;

    switch (kind) {
      case 'execute':
        return 'Shell Command';
      case 'patch':
        return 'File Patch';
      case 'mcp':
        return 'MCP Tool';
      case 'web_search':
        return 'Web Search';
      default:
        return 'Tool Call';
    }
  };

  return (
    <Card className='w-full mb-2' size='small' bordered>
      <div className='flex items-start gap-3'>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 mb-2'>
            <span className='text-lg'>{getKindIcon(kind)}</span>
            <span className='font-medium text-t-primary'>{getDisplayTitle()}</span>
            <StatusTag status={status} />
          </div>

          {description && <div className='text-sm text-t-secondary mb-2'>{description}</div>}

          {/* Display data if available */}
          {data && (
            <div className='text-sm mb-2'>
              <div className='text-xs text-t-secondary mb-1'>Data:</div>
              <div className='bg-1 p-2 rounded text-sm max-h-40 overflow-y-auto'>
                <pre className='text-xs whitespace-pre-wrap'>{JSON.stringify(data, null, 2)}</pre>
              </div>
            </div>
          )}

          {/* Display content if available 显示内容 */}
          {contentArray && contentArray.length > 0 && (
            <div>
              {contentArray.map((content, index) => (
                <div key={index}>
                  {content.type === 'output' && content.output && (
                    <div className='mt-3'>
                      <div className='bg-2 p-3 rounded border border-b-base font-mono text-sm overflow-x-auto max-h-60 overflow-y-auto'>
                        <pre className='whitespace-pre-wrap break-words text-t-primary'>{content.output}</pre>
                      </div>
                    </div>
                  )}
                  {content.type === 'text' && content.text && (
                    <div className='mt-3'>
                      <div className='bg-1 p-3 rounded border border-b-base text-sm text-t-primary'>{content.text}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className='text-xs text-t-secondary mt-2'>Tool Call ID: {toolCallId}</div>
        </div>
      </div>
    </Card>
  );
};

export default GenericDisplay;
