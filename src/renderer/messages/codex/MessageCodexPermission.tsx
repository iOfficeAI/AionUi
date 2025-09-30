/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageCodexPermission } from '@/common/chatLib';
import React from 'react';
import ExecApprovalDisplay from './PermissionComponent/ExecApprovalDisplay';
import ApplyPatchApprovalDisplay from './PermissionComponent/ApplyPatchApprovalDisplay';
import type { CodexPermissionRequest } from '@/common/codex/types';

// Type extractions for different permission subtypes
type ExecApprovalContent = Extract<CodexPermissionRequest, { subtype: 'exec_approval_request' }>;
type ApplyPatchApprovalContent = Extract<CodexPermissionRequest, { subtype: 'apply_patch_approval_request' }>;

interface MessageCodexPermissionProps {
  message: IMessageCodexPermission;
}

const MessageCodexPermission: React.FC<MessageCodexPermissionProps> = ({ message }) => {
  const { content } = message;

  // Factory function: render different components based on subtype
  switch (content.subtype) {
    case 'exec_approval_request':
      return <ExecApprovalDisplay content={content as ExecApprovalContent} messageId={message.id} conversationId={message.conversation_id} />;

    case 'apply_patch_approval_request':
      return <ApplyPatchApprovalDisplay content={content as ApplyPatchApprovalContent} messageId={message.id} conversationId={message.conversation_id} />;

    default:
      // This should never happen with proper typing
      return <div>Unknown permission type</div>;
  }
};

export default MessageCodexPermission;
