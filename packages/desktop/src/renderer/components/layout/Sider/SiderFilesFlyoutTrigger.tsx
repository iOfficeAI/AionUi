import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { FullScreen } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import useSWR from 'swr';
import { SiderWorkspaceActionBtn } from './SiderWorkspaceActionBtn';
import WorkspaceFilesFlyoutModal from './WorkspaceFilesFlyoutModal';

const SiderFilesFlyoutTrigger: React.FC = () => {
  const { t } = useTranslation();
  const { id: conversationId } = useParams<{ id: string }>();
  const { data: conversation } = useSWR<TChatConversation | undefined>(
    conversationId ? `sider-files-flyout.conversation.${conversationId}` : null,
    () => ipcBridge.conversation.get.invoke({ id: conversationId as string }),
    { revalidateOnFocus: false }
  );

  const [visible, setVisible] = useState(false);

  const workspace = conversation?.extra?.workspace;
  const isTemporaryWorkspace = (conversation?.extra as { is_temporary_workspace?: boolean } | undefined)
    ?.is_temporary_workspace;
  const eventPrefix = conversation?.type;

  if (!workspace || !conversationId || !eventPrefix) {
    return null;
  }

  return (
    <>
      <SiderWorkspaceActionBtn
        tooltip={t('conversation.workspace.files.expandFlyout', { defaultValue: 'Expand' })}
        icon={<FullScreen theme='outline' size={14} fill='currentColor' />}
        onClick={() => setVisible(true)}
      />
      <WorkspaceFilesFlyoutModal
        visible={visible}
        onClose={() => setVisible(false)}
        conversationId={conversationId}
        workspace={workspace}
        isTemporaryWorkspace={isTemporaryWorkspace}
        eventPrefix={eventPrefix}
      />
    </>
  );
};

export default SiderFilesFlyoutTrigger;
