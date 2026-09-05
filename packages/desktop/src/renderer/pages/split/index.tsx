/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useConversationHistoryContext } from '@/renderer/hooks/context/ConversationHistoryContext';
import { useSplitGroupMutations } from '@/renderer/pages/conversation/GroupedHistory/hooks/useSplitGroupMutations';
import { readSplitGroupTag } from '@/renderer/pages/conversation/GroupedHistory/utils/splitGroupHelpers';
import { Button, Empty, Spin } from '@arco-design/web-react';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import SplitGroupView from './SplitGroupView';

/**
 * `/split/:groupId` — the columns of one split group. The group is derived
 * from the loaded conversation list (its members carry the tags), so this
 * route needs no fetch of its own and re-renders as members come and go.
 * Renderable without the sidebar: a pop-out window can mount it as is.
 */
const SplitGroupIndex: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const {
    conversations,
    listLoaded,
    groupedHistory: { splitGroups },
  } = useConversationHistoryContext();
  const { dissolveIfAlone } = useSplitGroupMutations();

  const group = splitGroups.find((candidate) => candidate.id === groupId);
  const state = location.state as { focus?: string; nonce?: number } | null;
  const requestedFocus = state?.focus;
  // A fresh request for the same member (a second click on its pill row) is a
  // new key, so the view acts on it again.
  const requestKey = state?.focus ? `${state.focus}:${state.nonce ?? 0}` : undefined;

  // The list shows only one member of this group right now: the other was
  // archived, deleted, or is not in this snapshot. Absence from a list is not
  // deletion, so this route writes nothing on its own; it asks the write path
  // to count the group against the backend (archived rows included) and clear
  // the tag only if nobody else carries it — which is also how a survivor of a
  // delete this window never saw stops refusing to join another group. Either
  // way the user lands on the survivor, as a plain conversation, which is
  // where a dissolve would have taken them.
  const survivorId =
    !group && listLoaded && groupId
      ? conversations.find((conversation) => readSplitGroupTag(conversation)?.id === groupId)?.id
      : undefined;
  const reconciledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!survivorId || !groupId) return;
    console.warn(`[SplitGroup] Group ${groupId} shows a single member (${survivorId}); opening it on its own.`);
    if (reconciledRef.current !== groupId) {
      reconciledRef.current = groupId;
      void dissolveIfAlone(groupId);
    }
    // Navigated straight away, with no await in front of it: a navigation that
    // waited on the write would yank the user out of wherever they moved on to.
    void navigate(`/conversation/${survivorId}`, { replace: true });
  }, [dissolveIfAlone, groupId, navigate, survivorId]);

  if (!group) {
    if (!listLoaded || survivorId) return <Spin loading />;
    return (
      <div className='flex flex-col items-center justify-center gap-16px size-full' data-testid='split-group-missing'>
        <Empty description={t('conversation.splitGroup.notFound')} />
        <Button type='secondary' onClick={() => void navigate('/guid')}>
          {t('common.back')}
        </Button>
      </div>
    );
  }

  return <SplitGroupView key={group.id} group={group} requestedFocus={requestedFocus} requestKey={requestKey} />;
};

export default SplitGroupIndex;
