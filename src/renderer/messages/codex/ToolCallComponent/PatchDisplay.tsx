/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexToolCallUpdate } from '@/common/chatLib';
import { Tag } from '@arco-design/web-react';
import React from 'react';
import BaseToolCallDisplay from './BaseToolCallDisplay';

type PatchUpdate = Extract<CodexToolCallUpdate, { subtype: 'patch_apply_begin' | 'patch_apply_end' }>;

const PatchDisplay: React.FC<{ content: PatchUpdate }> = ({ content }) => {
  const { toolCallId, title, status, description, subtype, data } = content;

  const getDisplayTitle = () => {
    if (title) return title;

    switch (subtype) {
      case 'patch_apply_begin':
        return 'Applying Patch';
      case 'patch_apply_end':
        return 'Patch Applied';
      default:
        return 'File Patch';
    }
  };

  const getAdditionalTags = () => {
    if (subtype === 'patch_apply_begin' && 'auto_approved' in data && data.auto_approved !== undefined) {
      return <Tag color={data.auto_approved ? 'green' : 'orange'}>{data.auto_approved ? 'Auto-approved' : 'Manual approval'}</Tag>;
    }
    return null;
  };

  const getChangeSummary = () => {
    // Only show changes for patch_apply_begin
    if (subtype !== 'patch_apply_begin' || !('changes' in data) || !data.changes || typeof data.changes !== 'object') return null;

    const entries = Object.entries(data.changes);
    if (entries.length === 0) return null;

    return entries.map(([file, change]) => {
      let action = 'modify';
      if (typeof change === 'object' && change !== null) {
        if ('type' in change && typeof change.type === 'string') {
          action = change.type;
        } else if ('action' in change && typeof change.action === 'string') {
          action = change.action;
        }
      }
      return { file, action };
    });
  };

  const changeSummary = getChangeSummary();

  return (
    <BaseToolCallDisplay toolCallId={toolCallId} title={getDisplayTitle()} status={status} description={description} icon='📝' additionalTags={getAdditionalTags()}>
      {/* Display file changes if available */}
      {changeSummary && changeSummary.length > 0 && (
        <div className='text-sm mb-2'>
          <div className='text-xs text-gray-500 mb-1'>File Changes:</div>
          <div className='bg-gray-50 p-2 rounded text-sm'>
            {changeSummary.map(({ file, action }, index) => (
              <div key={index} className='flex items-center gap-2'>
                <Tag size='small' color={action === 'create' ? 'green' : action === 'delete' ? 'red' : 'blue'}>
                  {action}
                </Tag>
                <span className='font-mono text-xs'>{file}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </BaseToolCallDisplay>
  );
};

export default PatchDisplay;
