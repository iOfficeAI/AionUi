/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexToolCallUpdate } from '@/common/chatLib';
import { Card, Tag } from '@arco-design/web-react';
import React from 'react';

type McpToolUpdate = Extract<CodexToolCallUpdate, { subtype: 'mcp_tool_call_begin' | 'mcp_tool_call_end' }>;

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

const McpToolDisplay: React.FC<{ content: McpToolUpdate }> = ({ content }) => {
  const { toolCallId, title, status, description, subtype, data } = content;

  const getDisplayTitle = () => {
    if (title) return title;

    const inv = data?.invocation || {};
    const toolName = inv.tool || inv.name || inv.method || 'unknown';

    switch (subtype) {
      case 'mcp_tool_call_begin':
        return `MCP Tool: ${toolName} (starting)`;
      case 'mcp_tool_call_end':
        return `MCP Tool: ${toolName}`;
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
    <Card className='w-full mb-2' size='small' bordered>
      <div className='flex items-start gap-3'>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 mb-2'>
            <span className='text-lg'>🔌</span>
            <span className='font-medium text-gray-900'>{getDisplayTitle()}</span>
            <StatusTag status={status} />
          </div>

          {description && <div className='text-sm text-gray-600 mb-2'>{description}</div>}

          {/* Display tool details if available */}
          {toolDetails && (
            <div className='text-sm mb-2'>
              <div className='text-xs text-gray-500 mb-1'>Tool Details:</div>
              <div className='bg-purple-50 p-2 rounded text-sm'>
                <div className='flex items-center gap-2'>
                  <Tag size='small' color='purple'>
                    Tool
                  </Tag>
                  <span className='font-mono text-xs'>{toolDetails.toolName}</span>
                </div>
                {toolDetails.arguments && (
                  <div className='mt-2'>
                    <div className='text-xs text-gray-500 mb-1'>Arguments:</div>
                    <pre className='text-xs bg-white p-2 rounded border overflow-x-auto'>{JSON.stringify(toolDetails.arguments, null, 2)}</pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Display result if available for end events */}
          {subtype === 'mcp_tool_call_end' && data?.result && (
            <div className='text-sm mb-2'>
              <div className='text-xs text-gray-500 mb-1'>Result:</div>
              <div className='bg-gray-50 p-2 rounded text-sm max-h-40 overflow-y-auto'>
                <pre className='text-xs whitespace-pre-wrap'>{typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2)}</pre>
              </div>
            </div>
          )}

          <div className='text-xs text-gray-400 mt-2'>Tool Call ID: {toolCallId}</div>
        </div>
      </div>
    </Card>
  );
};

export default McpToolDisplay;
