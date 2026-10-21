/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import ThemedLogo from '@/renderer/components/agent/ThemedLogo';
import { usePresetAssistantInfo } from '@/renderer/hooks/agent/usePresetAssistantInfo';
import { CronJobIndicator } from '@/renderer/pages/cron';
import { resolveConversationLeadingMark } from '@/renderer/pages/conversation/utils/conversationAssistantIdentity';
import { useAgentLogos } from '@/renderer/utils/model/agentLogo';
import { Spin } from '@arco-design/web-react';
import { Attention, MessageOne, Robot } from '@icon-park/react';
import classNames from 'classnames';
import React from 'react';

export type CronJobStatus = 'none' | 'active' | 'paused' | 'error' | 'unread';

/**
 * The mark that leads a conversation everywhere the sidebar shows one: its
 * row, a split-group pill member, the ghost that follows a drag. Live state
 * wins over identity — a paused turn shows the "needs you" icon, a running
 * one the spinner, a scheduled one its job indicator — then the assistant or
 * backend identity, then a generic fallback.
 */
const ConversationLeadingIcon: React.FC<{
  conversation: TChatConversation;
  cronStatus?: CronJobStatus;
  isGenerating?: boolean;
  isWaitingConfirmation?: boolean;
  /** Applied to the resting identity icon only (not to the live-state icons). */
  className?: string;
  size?: number;
}> = ({
  conversation,
  cronStatus = 'none',
  isGenerating = false,
  isWaitingConfirmation = false,
  className,
  size = 16,
}) => {
  const logos = useAgentLogos();
  const { info: assistantInfo } = usePresetAssistantInfo(conversation);

  // Waiting on the user takes visual precedence over the generating spinner: a
  // paused turn still streams frames that mark it "generating", so without this
  // the distinct icon would never win.
  if (isWaitingConfirmation) {
    return (
      <Attention
        theme='filled'
        size={String(size)}
        className='line-height-0 flex-shrink-0 text-warning animate-wiggle'
        data-testid={`conversation-waiting-confirmation-${conversation.id}`}
      />
    );
  }
  if (isGenerating) {
    return <Spin size={size} />;
  }
  if (cronStatus !== 'none') {
    return <CronJobIndicator status={cronStatus} size={size} className='flex-shrink-0' />;
  }

  const leadingMark = resolveConversationLeadingMark(conversation, assistantInfo, logos);
  if (leadingMark.kind === 'emoji') {
    return (
      <span className={classNames('leading-none flex-shrink-0', className)} style={{ fontSize: size }}>
        {leadingMark.value}
      </span>
    );
  }
  if (leadingMark.kind === 'image') {
    return (
      <ThemedLogo
        src={leadingMark.value}
        alt={leadingMark.label}
        className={classNames('rounded-50% flex-shrink-0', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  if (leadingMark.kind === 'assistant_fallback') {
    return (
      <Robot
        theme='outline'
        size={String(size)}
        className={classNames('line-height-0 flex-shrink-0 text-t-secondary', className)}
      />
    );
  }
  return (
    <MessageOne
      theme='outline'
      size={String(size)}
      className={classNames('line-height-0 flex-shrink-0 text-t-secondary', className)}
    />
  );
};

export default ConversationLeadingIcon;
