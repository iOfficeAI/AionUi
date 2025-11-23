/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BaseCodexPermissionRequest, ApplyPatchApprovalRequestData } from '@/common/codex/types';
import { Typography } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import BasePermissionDisplay from './BasePermissionDisplay';

const { Text } = Typography;

interface ApplyPatchApprovalDisplayProps {
  content: BaseCodexPermissionRequest & { subtype: 'apply_patch_approval_request'; data: ApplyPatchApprovalRequestData };
  messageId: string;
  conversationId: string;
}

const ApplyPatchApprovalDisplay: React.FC<ApplyPatchApprovalDisplayProps> = React.memo(({ content, messageId, conversationId }) => {
  const { title, data } = content;
  const { t } = useTranslation();

  // 基于 apply_patch_approval 类型生成权限信息
  const getPatchInfo = () => {
    const changes = data.changes || data.codex_changes || {};
    const fileCount = Object.keys(changes).length;
    const fileNames = Object.keys(changes).slice(0, 3); // Show first 3 files
    const hasMoreFiles = Object.keys(changes).length > 3;

    return {
      title: title ? t(title) : t('codex.permissions.titles.apply_patch_approval_request'),
      icon: '📝',
      changes,
      fileCount,
      fileNames,
      hasMoreFiles,
      reason: data.reason,
      summary: data.summary,
    };
  };

  const patchInfo = getPatchInfo();

  return (
    <BasePermissionDisplay content={content} messageId={messageId} conversationId={conversationId} icon={patchInfo.icon} title={patchInfo.title}>
      {/* Files to be changed */}
      <div>
        <Text className='text-xs text-t-secondary mb-1'>
          {t('codex.permissions.labels.files_to_modify')} ({patchInfo.fileCount}):
        </Text>
        <div className='text-xs bg-1 p-2 rounded text-t-primary'>
          {patchInfo.fileNames.map((fileName, index) => (
            <div key={index} className='break-all'>
              📄 {fileName}
            </div>
          ))}
          {patchInfo.hasMoreFiles && <div className='text-t-secondary'>... and {patchInfo.fileCount - 3} more files</div>}
        </div>
      </div>

      {/* Summary */}
      {patchInfo.summary && (
        <div>
          <Text className='text-xs text-t-secondary mb-1'>{t('codex.permissions.labels.summary')}</Text>
          <Text className='text-sm text-t-primary'>{patchInfo.summary}</Text>
        </div>
      )}

      {/* Reason */}
      {patchInfo.reason && (
        <div>
          <Text className='text-xs text-t-secondary mb-1'>{t('codex.permissions.labels.reason')}</Text>
          <Text className='text-sm text-t-primary'>{patchInfo.reason}</Text>
        </div>
      )}
    </BasePermissionDisplay>
  );
});

export default ApplyPatchApprovalDisplay;
