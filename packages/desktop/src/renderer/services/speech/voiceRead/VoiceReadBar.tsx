/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * VoiceReadBar — conversation-level voice-read control bar.
 *
 * Mounted by MessageList (additive, behind the feature.voiceRead flag).
 * Provides: auto-read toggle (从最新回复自动连读，流式逐句即读), paragraph
 * navigation (上一段/下一段), pause/resume, stop, repeat, and rate cycling.
 */

import type { IMessageText, TMessage } from '@/common/chat/chatLib';
import { Tooltip } from '@arco-design/web-react';
import { Left, Pause, PlayOne, Refresh, Right, SpeedOne, SquareSmall, VolumeMute, VolumeNotice } from '@icon-park/react';
import classNames from 'classnames';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isVoiceReadEnabled } from './featureFlag';
import { useVoiceRead } from './useVoiceRead';

const RATE_STEPS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4] as const;

const findLatestReadableMessage = (messages: TMessage[]): { msgKey: string; text: string } | null => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.hidden || message.type !== 'text' || message.position !== 'left') continue;
    const content = (message as IMessageText).content?.content;
    if (typeof content === 'string' && content.trim()) {
      return { msgKey: message.msg_id ?? message.id, text: content };
    }
  }
  return null;
};

const BarButton: React.FC<{
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}> = ({ tooltip, onClick, disabled, active, children }) => (
  <Tooltip content={tooltip}>
    <div
      className={classNames('p-4px rd-4px transition-colors', {
        'opacity-40 cursor-not-allowed': disabled,
        'cursor-pointer hover:bg-3': !disabled,
        'bg-3': active,
      })}
      onClick={disabled ? undefined : onClick}
      style={{ lineHeight: 0 }}
    >
      {children}
    </div>
  </Tooltip>
);

const VoiceReadBar: React.FC<{ conversationId: string | null; messages: TMessage[] }> = ({
  conversationId,
  messages,
}) => {
  const { t } = useTranslation();
  const { snapshot, controller } = useVoiceRead();
  // Idle 时收缩为小喇叭按钮；展开后或朗读中显示完整控制条。
  const [expanded, setExpanded] = useState(false);

  const { status, autoEnabled, rate, currentSentence, voiceAvailable } = snapshot;
  const reading = status !== 'idle';
  const paused = status === 'paused';

  // 停止/自然结束回到空闲后自动收缩回小喇叭。
  useEffect(() => {
    if (status === 'idle') setExpanded(false);
  }, [status]);

  if (!isVoiceReadEnabled()) return null;

  const enableAutoRead = () => {
    controller.setAutoEnabled(true, conversationId);
    const latest = findLatestReadableMessage(messages);
    if (latest) {
      controller.readLatestAuto(conversationId, latest.msgKey, latest.text);
    }
  };

  const handleToggleAuto = () => {
    if (autoEnabled) {
      controller.setAutoEnabled(false);
      return;
    }
    enableAutoRead();
  };

  // 收缩态小喇叭：点击展开完整控制条并开启自动朗读。
  const handleExpand = () => {
    setExpanded(true);
    enableAutoRead();
  };

  const handleCycleRate = () => {
    const index = RATE_STEPS.indexOf(rate as (typeof RATE_STEPS)[number]);
    const next = RATE_STEPS[(index + 1) % RATE_STEPS.length] ?? 1;
    controller.setRate(next);
  };

  const noVoiceText = t('voiceRead.noVoice', {
    defaultValue: '未检测到本地语音，无法朗读',
  });

  // 空闲且未展开：收缩为小喇叭圆钮，避免长条遮挡会话内容。
  if (!reading && !expanded) {
    return (
      <div className='absolute bottom-20px right-20px z-100 select-none'>
        <Tooltip
          content={
            voiceAvailable
              ? t('voiceRead.expandBar', { defaultValue: '自动朗读 / 展开' })
              : noVoiceText
          }
        >
          <div
            role='button'
            aria-label={t('voiceRead.expandBarAria', { defaultValue: '展开朗读控制条' })}
            className={classNames(
              'relative flex items-center justify-center w-40px h-40px rd-full bg-base shadow-lg border-1 border-solid border-3 transition-all',
              voiceAvailable ? 'cursor-pointer hover:scale-110' : 'opacity-40 cursor-not-allowed'
            )}
            onClick={voiceAvailable ? handleExpand : undefined}
          >
            <VolumeNotice
              theme='outline'
              size='18'
              fill={autoEnabled ? 'var(--brand)' : 'var(--text-secondary, #86909c)'}
            />
            {autoEnabled && (
              <span
                className='absolute top-2px right-2px w-6px h-6px rd-full'
                style={{ backgroundColor: 'var(--brand)' }}
              />
            )}
          </div>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className='absolute bottom-20px right-20px z-100 flex flex-col items-end gap-6px select-none'>
      {reading && currentSentence && (
        <div
          className='max-w-280px truncate text-12px text-t-secondary px-8px py-4px rd-6px bg-base shadow-lg border-1 border-solid border-3'
          title={currentSentence}
        >
          {currentSentence}
        </div>
      )}
      <div className='flex items-center gap-4px px-8px py-6px rd-8px bg-base shadow-lg border-1 border-solid border-3'>
        {!voiceAvailable && <span className='text-12px text-t-secondary mr-4px'>{noVoiceText}</span>}
        <BarButton
          tooltip={
            autoEnabled
              ? t('voiceRead.autoOff', { defaultValue: '关闭自动朗读' })
              : t('voiceRead.autoOn', { defaultValue: '自动朗读最新回复' })
          }
          onClick={handleToggleAuto}
          disabled={!voiceAvailable}
          active={autoEnabled}
        >
          {autoEnabled ? (
            <VolumeNotice theme='outline' size='16' fill='var(--brand)' />
          ) : (
            <VolumeMute theme='outline' size='16' fill='var(--text-secondary, #86909c)' />
          )}
        </BarButton>
        <BarButton
          tooltip={t('voiceRead.prevParagraph', { defaultValue: '上一段' })}
          onClick={() => controller.skipParagraph(-1)}
          disabled={!reading}
        >
          <Left theme='outline' size='16' fill='var(--text-secondary, #86909c)' />
        </BarButton>
        <BarButton
          tooltip={
            paused
              ? t('voiceRead.resume', { defaultValue: '继续' })
              : t('voiceRead.pause', { defaultValue: '暂停' })
          }
          onClick={() => controller.togglePause()}
          disabled={!reading}
        >
          {paused ? (
            <PlayOne theme='outline' size='16' fill='var(--text-secondary, #86909c)' />
          ) : (
            <Pause theme='outline' size='16' fill='var(--text-secondary, #86909c)' />
          )}
        </BarButton>
        <BarButton
          tooltip={t('voiceRead.stop', { defaultValue: '停止' })}
          onClick={() => controller.stop()}
          disabled={!reading}
        >
          <SquareSmall theme='outline' size='16' fill='var(--text-secondary, #86909c)' />
        </BarButton>
        <BarButton
          tooltip={t('voiceRead.nextParagraph', { defaultValue: '下一段' })}
          onClick={() => controller.skipParagraph(1)}
          disabled={!reading}
        >
          <Right theme='outline' size='16' fill='var(--text-secondary, #86909c)' />
        </BarButton>
        <BarButton
          tooltip={t('voiceRead.repeat', { defaultValue: '重复本条' })}
          onClick={() => controller.repeat()}
          disabled={!reading}
        >
          <Refresh theme='outline' size='16' fill='var(--text-secondary, #86909c)' />
        </BarButton>
        <Tooltip content={t('voiceRead.rate', { defaultValue: '语速' })}>
          <div
            className='flex items-center gap-2px px-4px py-4px rd-4px cursor-pointer hover:bg-3 transition-colors'
            onClick={handleCycleRate}
            style={{ lineHeight: 0 }}
          >
            <SpeedOne theme='outline' size='16' fill='var(--text-secondary, #86909c)' />
            <span className='text-12px text-t-secondary'>×{rate}</span>
          </div>
        </Tooltip>
      </div>
    </div>
  );
};

export default VoiceReadBar;
