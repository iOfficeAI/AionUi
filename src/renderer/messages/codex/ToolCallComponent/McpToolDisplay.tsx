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

type McpToolUpdate = Extract<CodexToolCallUpdate, { subtype: 'mcp_tool_call_begin' | 'mcp_tool_call_end' }>;

const McpToolDisplay: React.FC<{ content: McpToolUpdate }> = ({ content }) => {
  const { toolCallId, title, status, description, subtype, data } = content;
  const { t } = useTranslation();

  const getDisplayTitle = () => {
    if (title) return title;

    const inv = data?.invocation || {};
    const toolName = inv.tool || inv.name || inv.method || 'unknown';

    switch (subtype) {
      case 'mcp_tool_call_begin':
        return t('tools.titles.mcp_tool_starting', { toolName });
      case 'mcp_tool_call_end':
        return t('tools.titles.mcp_tool', { toolName });
      default:
        return 'MCP Tool';
    }
  };

  const getToolDetails = () => {
    if (!data?.invocation) return null;

    const inv = data.invocation;
    return {
      toolName: inv.tool || inv.name || inv.method || 'unknown',
      arguments: inv.arguments,
    };
  };

  const toolDetails = getToolDetails();

  return (
    <BaseToolCallDisplay toolCallId={toolCallId} title={getDisplayTitle()} status={status} description={description} icon='🔌'>
      {/* Display tool details if available 显示工具详情 */}
      {toolDetails && (
        <div className='text-sm mb-2'>
          <div className='text-xs text-t-secondary mb-1'>{t('tools.labels.tool_details')}</div>
          <div className='bg-1 p-2 rounded text-sm border border-b-base'>
            <div className='flex items-center gap-2'>
              <Tag size='small' color='purple'>
                {t('tools.labels.tool')}
              </Tag>
              <span className='font-mono text-xs text-t-primary'>{toolDetails.toolName}</span>
            </div>
            {toolDetails.arguments && (
              <div className='mt-2'>
                <div className='text-xs text-t-secondary mb-1'>{t('tools.labels.arguments')}</div>
                <pre className='text-xs bg-2 p-2 rounded border border-b-base overflow-x-auto text-t-primary'>{JSON.stringify(toolDetails.arguments, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Display result if available for end events 显示结果 */}
      {subtype === 'mcp_tool_call_end' && data?.result && (
        <div className='text-sm mb-2'>
          <div className='text-xs text-t-secondary mb-1'>{t('tools.labels.result')}</div>
          <div className='bg-1 p-2 rounded text-sm max-h-40 overflow-y-auto border border-b-base'>
            <pre className='text-xs whitespace-pre-wrap text-t-primary'>{typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2)}</pre>
          </div>
        </div>
      )}
    </BaseToolCallDisplay>
  );
};

export default McpToolDisplay;
