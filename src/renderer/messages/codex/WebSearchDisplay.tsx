/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexToolCallUpdate } from '@/common/chatLib';
import { Card, Tag } from '@arco-design/web-react';
import React from 'react';

type WebSearchUpdate = Extract<CodexToolCallUpdate, { subtype: 'web_search_begin' | 'web_search_end' }>;

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

const WebSearchDisplay: React.FC<{ content: WebSearchUpdate }> = ({ content }) => {
  const { toolCallId, title, status, description, subtype, data } = content;

  const getDisplayTitle = () => {
    if (title) return title;

    switch (subtype) {
      case 'web_search_begin':
        return 'Web Search Started';
      case 'web_search_end':
        return 'query' in data && data.query ? `Web Search: ${data.query}` : 'Web Search Completed';
      default:
        return 'Web Search';
    }
  };

  return (
    <Card className='w-full mb-2' size='small' bordered>
      <div className='flex items-start gap-3'>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 mb-2'>
            <span className='text-lg'>🔍</span>
            <span className='font-medium text-gray-900'>{getDisplayTitle()}</span>
            <StatusTag status={status} />
          </div>

          {description && <div className='text-sm text-gray-600 mb-2'>{description}</div>}

          {/* Display query if available */}
          {subtype === 'web_search_end' && 'query' in data && data.query && (
            <div className='text-sm mb-2'>
              <div className='text-xs text-gray-500 mb-1'>Search Query:</div>
              <div className='bg-blue-50 text-blue-800 p-2 rounded text-sm'>{data.query}</div>
            </div>
          )}

          <div className='text-xs text-gray-400 mt-2'>Tool Call ID: {toolCallId}</div>
        </div>
      </div>
    </Card>
  );
};

export default WebSearchDisplay;
