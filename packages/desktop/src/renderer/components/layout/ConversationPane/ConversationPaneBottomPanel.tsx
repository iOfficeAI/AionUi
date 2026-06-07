/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tabs } from '@arco-design/web-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import ApprovalsList from '@/renderer/pages/conversation/Workspace/components/ApprovalsList';
import { useWorkspaceApprovals } from '@/renderer/pages/conversation/Workspace/hooks/useWorkspaceApprovals';
import { useWorkspaceElicitations } from '@/renderer/pages/conversation/Workspace/hooks/useWorkspaceElicitations';

type BottomTab = 'approvals' | 'questions' | 'history';

interface ConversationPaneBottomPanelProps {
  conversationId: string;
}

/**
 * Bottom slice of the right-hand conversation pane. Hosts a 3-tab strip:
 *   - Approvals: live `useWorkspaceApprovals` data via the existing
 *     `ApprovalsList` chrome.
 *   - Questions: live `useWorkspaceElicitations` data, reusing the same
 *     `ApprovalsList` chrome.
 *   - History: visual scaffold only.
 */
const ConversationPaneBottomPanel: React.FC<ConversationPaneBottomPanelProps> = ({ conversationId }) => {
  const [activeTab, setActiveTab] = useState<BottomTab>('approvals');
  const { t } = useTranslation();
  const approvalsHook = useWorkspaceApprovals(conversationId || undefined);
  const elicitationsHook = useWorkspaceElicitations(conversationId || undefined);

  return (
    <div className='flex flex-col size-full min-h-0' data-testid='conversation-pane-bottom-panel'>
      <Tabs
        activeTab={activeTab}
        onChange={(key) => setActiveTab(key as BottomTab)}
        type='line'
        size='small'
        className='px-12px [&_.arco-tabs-nav]:border-b-0 [&_.arco-tabs-header-title]:!mr-8px flex flex-col flex-1 min-h-0'
      >
        <Tabs.TabPane key='approvals' title='Approvals'>
          {approvalsHook.hasApprovals ? (
            <ApprovalsList t={t} approvals={approvalsHook.approvals} respond={approvalsHook.respond} />
          ) : (
            <div className='flex items-center justify-center h-full text-xs text-[var(--color-text-3)]'>
              No pending approvals
            </div>
          )}
        </Tabs.TabPane>
        <Tabs.TabPane key='questions' title='Questions'>
          {elicitationsHook.hasElicitations ? (
            <ApprovalsList t={t} approvals={elicitationsHook.elicitations} respond={elicitationsHook.respond} />
          ) : (
            <div className='flex items-center justify-center h-full text-xs text-[var(--color-text-3)]'>
              No pending questions
            </div>
          )}
        </Tabs.TabPane>
        <Tabs.TabPane key='history' title='History'>
          <div className='flex items-center justify-center h-full text-xs text-[var(--color-text-3)]'>
            History coming soon
          </div>
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default ConversationPaneBottomPanel;
