/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useConversationHistoryContext } from '@/renderer/hooks/context/ConversationHistoryContext';
import { Button, Empty, Spin } from '@arco-design/web-react';
import React from 'react';
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
    listLoaded,
    groupedHistory: { splitGroups },
  } = useConversationHistoryContext();

  const group = splitGroups.find((candidate) => candidate.id === groupId);
  const requestedFocus = (location.state as { focus?: string } | null)?.focus;

  if (!group) {
    if (!listLoaded) return <Spin loading />;
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
