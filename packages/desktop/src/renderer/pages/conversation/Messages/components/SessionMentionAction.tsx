/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMentionSessionFromMessage } from '@/renderer/hooks/chat/useMentionSessionFromMessage';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * A conversation reference on a message, clickable to mention that conversation
 * again in the send box.
 *
 * The point is that a target which took effort to find once should not have to be
 * found again — and because the reference carries the conversation ID, clicking it
 * is exact, unlike searching a name that twenty conversations may share.
 *
 * A left click rather than a context menu: the intent here has exactly one
 * meaning, a one-item menu costs an extra step, and right-click is not something
 * users go looking for in a desktop chat view. Navigating to the conversation is
 * already a click away in the sidebar, so nothing competes for the plain click.
 *
 * Renders as plain, non-interactive text when the feature is switched off, so the
 * affordance never invites a click that could only fail.
 */
const SessionMentionAction: React.FC<{
  id: string;
  name: string;
  label: string;
  title?: string;
  /** Chip styling (sender side); the delivery badge is inline text. */
  chip?: boolean;
}> = ({ id, name, label, title, chip = false }) => {
  const { t } = useTranslation();
  const { available, pending, mention } = useMentionSessionFromMessage();

  const chipClass = chip ? 'px-6px py-2px rounded-6px text-12px text-t-secondary' : undefined;
  const chipStyle = chip ? { background: 'var(--color-fill-2)' } : undefined;

  if (!available) {
    return (
      <span className={chipClass} style={chipStyle} title={title}>
        {label}
      </span>
    );
  }

  return (
    <span
      role='button'
      tabIndex={0}
      aria-label={t('conversation.crossSession.mentionAgain', {
        name,
        defaultValue: 'Mention conversation {{name}} in the message box',
      })}
      title={t('conversation.crossSession.mentionAgainHint', {
        defaultValue: 'Click to mention this conversation in the message box',
      })}
      className={classNames(chipClass, 'cursor-pointer transition-opacity hover:opacity-70', {
        'opacity-60': pending,
      })}
      style={chipStyle}
      onClick={() => mention({ id, name })}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          mention({ id, name });
        }
      }}
    >
      {label}
    </span>
  );
};

export default SessionMentionAction;
