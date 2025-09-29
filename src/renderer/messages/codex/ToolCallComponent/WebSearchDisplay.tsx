/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexToolCallUpdate } from '@/common/chatLib';
import React from 'react';
import BaseToolCallDisplay from './BaseToolCallDisplay';

type WebSearchUpdate = Extract<CodexToolCallUpdate, { subtype: 'web_search_begin' | 'web_search_end' }>;

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
    <BaseToolCallDisplay toolCallId={toolCallId} title={getDisplayTitle()} status={status} description={description} icon='🔍'>
      {/* Display query if available */}
      {subtype === 'web_search_end' && 'query' in data && data.query && (
        <div className='text-sm mb-2'>
          <div className='text-xs text-gray-500 mb-1'>Search Query:</div>
          <div className='bg-blue-50 text-blue-800 p-2 rounded text-sm'>{data.query}</div>
        </div>
      )}
    </BaseToolCallDisplay>
  );
};

export default WebSearchDisplay;
