/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import ConversationLeadingIcon from '@/renderer/pages/conversation/GroupedHistory/ConversationLeadingIcon';
import type { SplitGroup } from '@/renderer/pages/conversation/GroupedHistory/utils/splitGroupHelpers';
import {
  setFocusedConversation,
  setFocusedProject,
  useFocusedConversationId,
} from '@/renderer/pages/conversation/hooks/focusedConversationStore';
import { useContainerWidth } from '@/renderer/pages/conversation/hooks/useContainerWidth';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { previewScopeKey } from '@/renderer/pages/conversation/Preview/context/previewScope';
import { Tabs } from '@arco-design/web-react';
import React, { useEffect, useLayoutEffect, useState } from 'react';

import { SplitGroupColumn, SplitGroupColumnFrame } from './SplitGroupColumn';
import styles from './SplitGroupView.module.css';

const conversationWorkspace = (conversation: TChatConversation): string | null =>
  (conversation.extra as { workspace?: string } | undefined)?.workspace ?? null;

/**
 * An open split group: one live conversation per member. Desktop shows them
 * as resizable columns; a narrow viewport shows one at a time behind tabs.
 *
 * Focus: the column the user last clicked, derived by the focus store from
 * the mounted set (each column's ChatConversation registers itself and claims
 * focus on pointer-down). This view only names a starting column — the one a
 * pill icon asked for, else the first — and publishes the focused column's
 * project so the Explorer, the shared preview panel and "add to chat" follow
 * the focus across projects.
 */
export const SplitGroupView: React.FC<{
  group: SplitGroup;
  /** A member the sidebar asked to focus (a click on its icon in the pill). */
  requestedFocus?: string;
}> = ({ group, requestedFocus }) => {
  const layout = useLayoutContext();
  const isMobile = Boolean(layout?.isMobile);
  const focusedId = useFocusedConversationId();
  const { closePreviewIfScopeChanged } = usePreviewContext();

  const memberIds = group.members.map((member) => member.id);
  const memberKey = memberIds.join('|');
  const startingId = requestedFocus && memberIds.includes(requestedFocus) ? requestedFocus : memberIds[0];

  // Mobile shows one column at a time, so the tab strip owns which one; the
  // focus store follows the mounted column rather than the other way round.
  const [activeTab, setActiveTab] = useState(startingId);
  useEffect(() => {
    const ids = memberKey.split('|');
    setActiveTab((current) => (ids.includes(current) ? current : ids[0]));
  }, [memberKey]);

  // Name the starting column. Derived on read: it wins as soon as its view is
  // on screen, and a later click on another column replaces it.
  useLayoutEffect(() => {
    setFocusedConversation(isMobile ? activeTab : startingId);
  }, [group.id, startingId, isMobile, activeTab]);

  const focusedMember =
    group.members.find((member) => member.id === focusedId) ??
    group.members.find((member) => member.id === (isMobile ? activeTab : startingId)) ??
    group.members[0];

  // The focused column's project is the focused project: Explorer, preview
  // scope and add-to-chat all key off it, and groups may span projects.
  const focusedProjectId = focusedMember.project_id ?? null;
  useLayoutEffect(() => {
    setFocusedProject(focusedProjectId);
  }, [focusedProjectId]);

  useEffect(() => {
    closePreviewIfScopeChanged(previewScopeKey(focusedMember.project_id ?? null, conversationWorkspace(focusedMember)));
  }, [closePreviewIfScopeChanged, focusedMember]);

  if (isMobile) {
    const activeMember = group.members.find((member) => member.id === activeTab) ?? group.members[0];
    return (
      <div className='flex flex-col h-full min-h-0' data-testid={`split-group-view-${group.id}`} data-layout='tabs'>
        <Tabs
          activeTab={activeMember.id}
          onChange={setActiveTab}
          size='small'
          type='line'
          className={`shrink-0 px-8px ${styles.tabs}`}
        >
          {group.members.map((member) => (
            <Tabs.TabPane
              key={member.id}
              title={
                <span className='flex items-center gap-6px max-w-140px'>
                  <ConversationLeadingIcon conversation={member} size={14} />
                  <span className='truncate'>{member.name}</span>
                </span>
              }
            />
          ))}
        </Tabs>
        <div className='flex-1 min-h-0 flex flex-col'>
          <SplitGroupColumn key={activeMember.id} group={group} member={activeMember} focused />
        </div>
      </div>
    );
  }

  return <SplitGroupColumns group={group} focusedId={focusedMember.id} />;
};

const SplitGroupColumns: React.FC<{ group: SplitGroup; focusedId: string }> = ({ group, focusedId }) => {
  const { containerRef, containerWidth } = useContainerWidth();
  const count = group.members.length;

  return (
    <div
      ref={containerRef}
      className='flex h-full w-full min-h-0 overflow-x-auto overflow-y-hidden'
      data-testid={`split-group-view-${group.id}`}
      data-layout='columns'
    >
      {containerWidth > 0 &&
        group.members.map((member, index) => (
          <SplitGroupColumnFrame
            key={member.id}
            group={group}
            member={member}
            focused={member.id === focusedId}
            isLast={index === count - 1}
            containerWidth={containerWidth}
            columnCount={count}
            trailingCount={count - 1 - index}
          />
        ))}
    </div>
  );
};

export default SplitGroupView;
