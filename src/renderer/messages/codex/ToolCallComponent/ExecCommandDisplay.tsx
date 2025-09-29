/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexToolCallUpdate } from '@/common/chatLib';
import { Tag } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import BaseToolCallDisplay from './BaseToolCallDisplay';

type ExecCommandUpdate = Extract<CodexToolCallUpdate, { subtype: 'exec_command_begin' | 'exec_command_output_delta' | 'exec_command_end' }>;

const ExecCommandDisplay: React.FC<{ content: ExecCommandUpdate }> = ({ content }) => {
  const { toolCallId, title, status, description, content: contentArray, subtype, data } = content;
  const { t } = useTranslation();

  const getDisplayTitle = () => {
    if (title) return title;

    switch (subtype) {
      case 'exec_command_begin':
        if (data.command && Array.isArray(data.command) && data.command.length > 0) {
          return t('tools.titles.execute_command', { command: data.command.join(' ') });
        }
        return 'Execute Command';
      case 'exec_command_output_delta':
        return t('tools.titles.command_output');
      case 'exec_command_end':
        return t('tools.titles.command_completed');
      default:
        return t('tools.titles.shell_command');
    }
  };

  const getAdditionalTags = () => {
    const tags = [];
    if (subtype === 'exec_command_end' && 'exit_code' in data && data.exit_code !== undefined) {
      tags.push(
        <Tag key='exit-code' color={data.exit_code === 0 ? 'green' : 'red'}>
          {t('tools.labels.exit_code', { code: data.exit_code })}
        </Tag>
      );
    }
    if (subtype === 'exec_command_end' && 'duration' in data && data.duration) {
      tags.push(
        <Tag key='duration' color='blue'>
          {t('tools.labels.duration', { seconds: data.duration.secs })}
        </Tag>
      );
    }
    return tags.length > 0 ? <>{tags}</> : null;
  };

  return (
    <BaseToolCallDisplay toolCallId={toolCallId} title={getDisplayTitle()} status={status} description={description} icon='🔧' additionalTags={getAdditionalTags()}>
      {/* Display command if available */}
      {subtype === 'exec_command_begin' && 'command' in data && data.command && Array.isArray(data.command) && data.command.length > 0 && (
        <div className='text-sm mb-2'>
          <div className='text-xs text-gray-500 mb-1'>{t('tools.labels.command')}</div>
          <div className='bg-gray-900 text-green-400 p-2 rounded font-mono text-xs overflow-x-auto'>
            <span className='text-gray-500'>$ </span>
            {data.command.join(' ')}
            {'cwd' in data && data.cwd && (
              <div className='text-gray-500 text-xs mt-1'>
                {t('tools.labels.working_directory')}: {data.cwd}
              </div>
            )}
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
    </BaseToolCallDisplay>
  );
};

export default ExecCommandDisplay;
