/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexToolCallUpdate } from '@/common/chatLib';
import { Card, Tag } from '@arco-design/web-react';
import React from 'react';

type PatchUpdate = Extract<CodexToolCallUpdate, { subtype: 'patch_apply_begin' | 'patch_apply_end' }>;

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
    <Card className='w-full mb-2' size='small' bordered>
      <div className='flex items-start gap-3'>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 mb-2'>
            <span className='text-lg'>📝</span>
            <span className='font-medium text-gray-900'>{getDisplayTitle()}</span>
            <StatusTag status={status} />
            {subtype === 'patch_apply_begin' && 'auto_approved' in data && data.auto_approved !== undefined && <Tag color={data.auto_approved ? 'green' : 'orange'}>{data.auto_approved ? 'Auto-approved' : 'Manual approval'}</Tag>}
          </div>

          {description && <div className='text-sm text-gray-600 mb-2'>{description}</div>}

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

          <div className='text-xs text-gray-400 mt-2'>Tool Call ID: {toolCallId}</div>
        </div>
      </div>
    </Card>
  );
};

export default PatchDisplay;
