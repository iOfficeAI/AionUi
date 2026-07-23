/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MessageVoiceReadButton — per-message read/stop button.
 *
 * Rendered inside MessageText's hover action row (additive, behind the
 * feature.voiceRead flag). Clicking reads the whole message aloud; while the
 * message is being read the button stays visible and acts as a stop button.
 */

import { Tooltip } from '@arco-design/web-react';
import { SquareSmall, VolumeNotice } from '@icon-park/react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { isVoiceReadEnabled } from './featureFlag';
import { useVoiceRead } from './useVoiceRead';

const MessageVoiceReadButton: React.FC<{ conversationId?: string; messageId: string; text: string }> = ({
  conversationId,
  messageId,
  text,
}) => {
  const { t } = useTranslation();
  const { snapshot, controller } = useVoiceRead();

  if (!isVoiceReadEnabled()) return null;

  const isActive = snapshot.activeMessageId === messageId;
  const disabled = !snapshot.voiceAvailable && !isActive;

  const handleClick = () => {
    if (isActive) {
      controller.stop();
    } else {
      controller.readMessage(conversationId ?? null, messageId, text);
    }
  };

  return (
    <Tooltip
      content={
        isActive
          ? t('voiceRead.stopThis', { defaultValue: '停止朗读' })
          : t('voiceRead.readThis', { defaultValue: '朗读本条' })
      }
    >
      <div
        className={classNames('p-4px rd-4px transition-colors', {
          'cursor-pointer hover:bg-3': !disabled,
          'opacity-40 cursor-not-allowed': disabled,
          // Match the hover-reveal behaviour of the neighbouring copy button,
          // but stay visible while this message is being read.
          'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto':
            !isActive,
        })}
        onClick={disabled ? undefined : handleClick}
        style={{ lineHeight: 0 }}
      >
        {isActive ? (
          <SquareSmall theme='outline' size='16' fill='var(--brand)' />
        ) : (
          <VolumeNotice theme='outline' size='16' fill='var(--text-secondary, #86909c)' />
        )}
      </div>
    </Tooltip>
  );
};

export default MessageVoiceReadButton;
