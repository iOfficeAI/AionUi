/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * File-tree region in the Sider workspace panel.
 *
 * Resolves the active conversation from the route param, fetches it via
 * `ipcBridge.conversation.get`, and renders the shared `ChatWorkspace`
 * panel when the conversation has a `extra.workspace` path. Falls back
 * to a localized "No active workspace" empty state otherwise.
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import ChatWorkspace from '@/renderer/pages/conversation/Workspace';
import { Empty } from '@arco-design/web-react';
import { FolderOpen, Code } from '@icon-park/react';
import React from 'react';
import { useParams } from 'react-router-dom';
import useSWR from 'swr';

const SiderFileTree: React.FC = () => {
  const { id: conversationId } = useParams<{ id: string }>();
  const { data: conversation } = useSWR<TChatConversation | undefined>(
    conversationId ? `sider-file-tree.conversation.${conversationId}` : null,
    () => ipcBridge.conversation.get.invoke({ id: conversationId as string }),
    { revalidateOnFocus: false }
  );

  const workspace = conversation?.extra?.workspace;
  const isTemporaryWorkspace = (conversation?.extra as { is_temporary_workspace?: boolean } | undefined)
    ?.is_temporary_workspace;
  const eventPrefix = conversation?.type;

  // Real workspace available — mount the shared file-tree/tabs panel.
  if (workspace && conversationId && eventPrefix) {
    return (
      <ChatWorkspace
        conversation_id={conversationId}
        workspace={workspace}
        isTemporaryWorkspace={isTemporaryWorkspace}
        eventPrefix={eventPrefix}
      />
    );
  }

  return (
    <div className='size-full flex flex-col min-h-0' role='region' aria-label='File tree' data-testid='sider-file-tree'>
      <div className='flex items-center gap-8px px-12px py-6px border-b border-[var(--border-base)] text-t-primary text-13px font-medium'>
        <FolderOpen theme='outline' size={16} fill='currentColor' />
        <span>Files</span>
      </div>
      <div className='flex-1 min-h-0 flex-center'>
        <Empty
          icon={<Code theme='outline' size={48} fill='var(--text-tertiary)' />}
          description={
            <div className='flex flex-col items-center gap-4px'>
              <span className='text-t-primary text-13px font-medium'>No active workspace</span>
              <span className='text-t-tertiary text-12px'>Open a conversation with a workspace to see its files.</span>
            </div>
          }
        />
      </div>
    </div>
  );
};

export default SiderFileTree;
