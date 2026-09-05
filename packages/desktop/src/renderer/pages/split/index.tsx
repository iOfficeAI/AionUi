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
  const { clearLeftoverTag } = useSplitGroupMutations();

  const group = splitGroups.find((candidate) => candidate.id === groupId);
  const requestedFocus = (location.state as { focus?: string } | null)?.focus;

  // The group fell under two members without going through x — a member was
  // deleted or archived, here or on another device. The survivor still wears
  // the tag: clear it (a group of one is a plain conversation) and land the
  // user on it, the same place a x-dissolve would have taken them.
  const survivor =
    !group && listLoaded && groupId
      ? conversations.find((conversation) => readSplitGroupTag(conversation)?.id === groupId)
      : undefined;
  const survivorId = survivor?.id;
  const recoveredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!survivorId || !groupId || recoveredRef.current === groupId) return;
    recoveredRef.current = groupId;
    console.warn(
      `[SplitGroup] Group ${groupId} lost its other members; leaving ${survivorId} as a plain conversation.`
    );
    void clearLeftoverTag(survivorId).then(() => {
      void navigate(`/conversation/${survivorId}`, { replace: true });
    });
  }, [clearLeftoverTag, groupId, navigate, survivorId]);

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

  return <SplitGroupView key={group.id} group={group} requestedFocus={requestedFocus} />;
};

export default SplitGroupIndex;
