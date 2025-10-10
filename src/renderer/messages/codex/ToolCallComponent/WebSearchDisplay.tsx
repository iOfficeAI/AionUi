/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexToolCallUpdate } from '@/common/chatLib';
import React from 'react';
import { useTranslation } from 'react-i18next';
import BaseToolCallDisplay from './BaseToolCallDisplay';

type WebSearchUpdate = Extract<CodexToolCallUpdate, { subtype: 'web_search_begin' | 'web_search_end' }>;

const WebSearchDisplay: React.FC<{ content: WebSearchUpdate }> = ({ content }) => {
  const { toolCallId, title, status, description, subtype, data } = content;
  const { t } = useTranslation();

  const getDisplayTitle = () => {
    if (title) return title;

    switch (subtype) {
      case 'web_search_begin':
        return t('tools.titles.web_search_started');
      case 'web_search_end':
        return 'query' in data && data.query ? `${t('tools.titles.web_search')}: ${data.query}` : t('tools.titles.web_search_completed');
      default:
        return t('tools.titles.web_search');
    }
  };

  return (
    <BaseToolCallDisplay toolCallId={toolCallId} title={getDisplayTitle()} status={status} description={description} icon='🔍'>
      {/* Display query if available */}
      {subtype === 'web_search_end' && 'query' in data && data.query && (
        <div className='text-sm mb-2'>
          <div className='text-xs text-gray-500 mb-1'>{t('tools.labels.search_query')}</div>
          <div className='bg-blue-50 text-blue-800 p-2 rounded text-sm'>{data.query}</div>
        </div>
      )}
    </BaseToolCallDisplay>
  );
};

export default WebSearchDisplay;
