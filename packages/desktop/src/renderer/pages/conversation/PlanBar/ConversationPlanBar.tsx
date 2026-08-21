/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Badge } from '@arco-design/web-react';
import { CheckOne, Down, Right } from '@icon-park/react';
import { getChatSurfaceWidthClass } from '@renderer/pages/conversation/utils/chatSurfaceWidth';
import { useConversationRuntimeView } from '@renderer/pages/conversation/runtime/useConversationRuntimeView';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLatestPlan } from './useLatestPlan';

/**
 * Live plan / to-do progress for the running turn, pinned above the send box.
 *
 * Deliberately NOT a message row: a plan is a snapshot that gets replaced, so
 * streaming it into the conversation both duplicated cards and buried the
 * current state under later messages.
 *
 * Renders nothing — and reserves no space — unless a plan belongs to the turn
 * running right now.
 */
const ConversationPlanBar: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const plan = useLatestPlan();
  const { isProcessing, activeTurnId } = useConversationRuntimeView(conversation_id);

  const entries = useMemo(() => plan?.content.entries ?? [], [plan]);
  const completed = useMemo(() => entries.filter((entry) => entry.status === 'completed').length, [entries]);

  if (!plan || !entries.length || !isProcessing) return null;
  // A plan whose turn already ended must not hang over the next turn. Rows
  // written before turn_id existed degrade to the isProcessing check alone.
  if (plan.content.turn_id && plan.content.turn_id !== activeTurnId) return null;

  const toggle = () => setExpanded((value) => !value);

  return (
    // Same width class the send box and message rows use: the bar sits directly
    // above the send box, so a full-bleed bar would visibly overhang it once the
    // container is wide enough for `.chat-surface-fluid` to reserve gutters.
    <div
      data-testid='conversation-plan-bar'
      // No horizontal padding on the root: `.chat-surface-fluid` sets a computed
      // `width`, and with content-box that padding is ADDED on top — measured
      // 663px against the send box group's 647px, i.e. the bar overhung it by
      // exactly 2x8px. The inset lives on the children instead, which is also
      // how CommandQueuePanel and ThoughtDisplay do it in this same stack.
      className={`${getChatSurfaceWidthClass()} shrink-0 border-t border-solid border-3 border-s-0 border-e-0 border-b-0 py-6px`}
    >
      <div
        className='flex items-center gap-8px px-8px cursor-pointer text-t-secondary select-none'
        role='button'
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={expanded ? t('conversation.planBar.collapse') : t('conversation.planBar.expand')}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
          }
        }}
      >
        {expanded ? <Down size={14} /> : <Right size={14} />}
        <Badge status='default' text={t('conversation.planBar.title')} />
        <span className='text-12px'>{t('conversation.planBar.progress', { completed, total: entries.length })}</span>
      </div>
      {expanded && (
        <div
          className='flex flex-col gap-6px pt-6px pl-30px pr-8px overflow-y-auto overscroll-contain'
          // Viewport-relative, matching CommandQueuePanel's cap in this same
          // stack. The zone above the send box can hold the queue, the thought
          // bar and a multi-line input at once; a FIXED cap here eats a large
          // share of a short window and squeezes the message list.
          style={{ maxHeight: 'min(22vh, 180px)' }}
        >
          {entries.map((entry, index) => (
            <div key={`${index}-${entry.content}`} className='flex items-center gap-8px text-t-secondary text-13px'>
              {entry.status === 'completed' ? (
                <CheckOne size={16} theme='filled' className='flex text-success shrink-0' />
              ) : (
                <div className='size-14px rd-full b-2px b-solid border-3 shrink-0' />
              )}
              <span className={entry.status === 'in_progress' ? 'text-t-primary' : undefined}>{entry.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ConversationPlanBar;
