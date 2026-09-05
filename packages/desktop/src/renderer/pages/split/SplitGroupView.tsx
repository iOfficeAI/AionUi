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
import { useCronJobsMap } from '@/renderer/pages/cron';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { previewScopeKey } from '@/renderer/pages/conversation/Preview/context/previewScope';
import { Tabs } from '@arco-design/web-react';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { SplitGroupColumn } from './SplitGroupColumn';
import { SplitGroupColumnFrame } from './SplitGroupColumnFrame';
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
  const { markAsRead } = useCronJobsMap();

  const memberIds = group.members.map((member) => member.id);
  const memberKey = memberIds.join('|');
  const requested = requestedFocus && memberIds.includes(requestedFocus) ? requestedFocus : undefined;
  const startingId = requested ?? memberIds[0];

  // Mobile shows one column at a time, so the tab strip owns which one; the
  // focus store follows the mounted column rather than the other way round.
  // A pill icon can ask for another member while the route is already open.
  const [activeTab, setActiveTab] = useState(startingId);
  useEffect(() => {
    const ids = memberKey.split('|');
    setActiveTab((current) => (ids.includes(current) ? current : ids[0]));
  }, [memberKey]);
  useEffect(() => {
    if (requested) setActiveTab(requested);
  }, [requested]);

  // Name the focused column only when the user asks: on opening the group
  // (the first member, or the one a pill icon named) and on a later pill
  // request. Membership changes never re-run this — the focus store keeps the
  // column the user last clicked while it is on screen and falls back on its
  // own when that column leaves — so removing a member before the focused one
  // cannot steal the focus (plan decision 2).
  const startingIdRef = useRef(startingId);
  startingIdRef.current = startingId;
  useLayoutEffect(() => {
    if (!isMobile) setFocusedConversation(startingIdRef.current);
  }, [group.id, isMobile]);
  useLayoutEffect(() => {
    if (!isMobile && requested) setFocusedConversation(requested);
  }, [requested, isMobile]);
  useLayoutEffect(() => {
    if (isMobile) setFocusedConversation(activeTab);
  }, [activeTab, isMobile]);

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
          onChange={(member_id) => {
            // Only a shown member is read; the others wait for their tab.
            markAsRead(member_id);
            setActiveTab(member_id);
          }}
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

/**
 * The row's own width, measured before its children first paint (a column's
 * default width is a share of it) and tracked as the row resizes (the Explorer
 * column appearing beside it, the window changing). `null` until measured.
 */
const useMeasuredWidth = (): { ref: React.RefObject<HTMLDivElement | null>; width: number | null } => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.offsetWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (typeof next === 'number' && next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
};

const SplitGroupColumns: React.FC<{ group: SplitGroup; focusedId: string }> = ({ group, focusedId }) => {
  const { ref, width: containerWidth } = useMeasuredWidth();
  const count = group.members.length;

  return (
    <div
      ref={ref}
      className='flex h-full w-full min-h-0 overflow-x-auto overflow-y-hidden'
      data-testid={`split-group-view-${group.id}`}
      data-layout='columns'
    >
      {containerWidth !== null &&
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
