/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexToolCallUpdate } from '@/common/chatLib';
import { Card, Tag } from '@arco-design/web-react';
import React from 'react';

type ExecCommandUpdate = Extract<CodexToolCallUpdate, { subtype: 'exec_command_begin' | 'exec_command_output_delta' | 'exec_command_end' }>;

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

const ExecCommandDisplay: React.FC<{ content: ExecCommandUpdate }> = ({ content }) => {
  const { toolCallId, title, status, description, content: contentArray, subtype, data } = content;

  const getDisplayTitle = () => {
    if (title) return title;

    switch (subtype) {
      case 'exec_command_begin':
        if (data.command && Array.isArray(data.command) && data.command.length > 0) {
          return `Execute: ${data.command.join(' ')}`;
        }
        return 'Execute Command';
      case 'exec_command_output_delta':
        return 'Command Output';
      case 'exec_command_end':
        return 'Command Completed';
      default:
        return 'Shell Command';
    }
  };

  return (
    <Card className='w-full mb-2' size='small' bordered>
      <div className='flex items-start gap-3'>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 mb-2'>
            <span className='text-lg'>🔧</span>
            <span className='font-medium text-gray-900'>{getDisplayTitle()}</span>
            <StatusTag status={status} />
            {subtype === 'exec_command_end' && 'exit_code' in data && data.exit_code !== undefined && <Tag color={data.exit_code === 0 ? 'green' : 'red'}>Exit: {data.exit_code}</Tag>}
            {subtype === 'exec_command_end' && 'duration' in data && data.duration && <Tag color='blue'>Duration: {data.duration.secs}s</Tag>}
          </div>

          {description && <div className='text-sm text-gray-600 mb-2'>{description}</div>}

          {/* Display command if available */}
          {subtype === 'exec_command_begin' && 'command' in data && data.command && Array.isArray(data.command) && data.command.length > 0 && (
            <div className='text-sm mb-2'>
              <div className='text-xs text-gray-500 mb-1'>Command:</div>
              <div className='bg-gray-900 text-green-400 p-2 rounded font-mono text-xs overflow-x-auto'>
                <span className='text-gray-500'>$ </span>
                {data.command.join(' ')}
                {'cwd' in data && data.cwd && <div className='text-gray-500 text-xs mt-1'>Working directory: {data.cwd}</div>}
              </div>
            </div>
          )}

          {/* Display output content */}
          {contentArray && contentArray.length > 0 && (
            <div>
              {contentArray.map((content, index) => (
                <div key={index}>
                  {content.type === 'output' && content.output && (
                    <div className='mt-3'>
                      <div className='bg-black text-green-400 p-3 rounded border font-mono text-sm overflow-x-auto max-h-60 overflow-y-auto'>
                        <pre className='whitespace-pre-wrap break-words'>{content.output}</pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className='text-xs text-gray-400 mt-2'>Tool Call ID: {toolCallId}</div>
        </div>
      </div>
    </Card>
  );
};

export default ExecCommandDisplay;
