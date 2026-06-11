/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tooltip } from '@arco-design/web-react';
import { PauseOne, PlayOne, RightOne, VoiceOne } from '@icon-park/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getTtsQueue, type TtsQueueState, type TtsQueueStatus } from '@/renderer/services/tts';
import { iconColors } from '@/renderer/styles/colors';

export type SpokenRowProps = {
  /** Stable message id — used for queue dedupe. */
  messageId: string;
  /** Plain text to be spoken. */
  text: string;
  /**
   * When false, controls are still rendered but interactions are disabled
   * (e.g. TTS was disabled in settings after the row was created). The
   * caller has already filtered out the raw spoken fence from the
   * rendered markdown; this row is the only place the spoken text lives.
   */
  enabled: boolean;
  /**
   * When true, auto-enqueue the spoken text the first time the row
   * mounts. Defaults to `enabled` so the row always enqueues when TTS
   * is on, but callers can pass `false` to suppress auto-enqueue while
   * still showing the manual play button.
   */
  autoEnqueue?: boolean;
};

/**
 * Compact playback row rendered under an assistant message when a
 * `spoken` block is present. Subscribes to the global TTS queue so the
 * play/pause/skip state stays in sync with other messages in the
 * conversation.
 */
export const SpokenRow: React.FC<SpokenRowProps> = ({ messageId, text, enabled, autoEnqueue }) => {
  const { t } = useTranslation();
  const queue = useMemo(() => getTtsQueue(), []);
  const [state, setState] = useState<TtsQueueState>(() => queue.getState());
  useEffect(() => queue.subscribe(setState), [queue]);

  const isCurrent = state.currentId === messageId;
  const status: TtsQueueStatus = isCurrent ? state.status : 'idle';

  // Don't re-enqueue on every streaming re-render. We track "did we
  // already enqueue this message" with a ref so the auto-enqueue path
  // fires exactly once per complete block.
  const enqueuedRef = useRef<string | null>(null);
  const shouldAutoEnqueue = autoEnqueue ?? enabled;
  useEffect(() => {
    if (!shouldAutoEnqueue) return;
    if (enqueuedRef.current === messageId) return;
    enqueuedRef.current = messageId;
    queue.enqueue({ id: messageId, text });
  }, [shouldAutoEnqueue, messageId, text, queue]);

  const handlePlay = () => {
    if (!enabled) return;
    if (isCurrent && status === 'paused') {
      queue.resume();
      return;
    }
    queue.playNow({ id: messageId, text });
  };
  const handlePause = () => queue.pause();
  const handleResume = () => queue.resume();
  const handleSkip = () => queue.skip();

  // Show play when the row is idle, pause when actively playing, and
  // resume when paused.
  const primaryAction = (() => {
    if (!isCurrent) {
      return (
        <Tooltip content={t('conversation.chat.voiceMode.playAria', { defaultValue: 'Play spoken summary' })}>
          <button
            type='button'
            onClick={handlePlay}
            disabled={!enabled}
            aria-label={t('conversation.chat.voiceMode.playAria', { defaultValue: 'Play spoken summary' })}
            data-testid='spoken-row-play'
            className='inline-flex items-center justify-center w-24px h-24px rd-12px bg-transparent b-0 cursor-pointer hover:bg-3 transition-colors'
          >
            <PlayOne theme='outline' size='14' fill={iconColors.brand} />
          </button>
        </Tooltip>
      );
    }
    if (status === 'paused') {
      return (
        <Tooltip content={t('conversation.chat.voiceMode.resumeAria', { defaultValue: 'Resume spoken summary' })}>
          <button
            type='button'
            onClick={handleResume}
            disabled={!enabled}
            aria-label={t('conversation.chat.voiceMode.resumeAria', { defaultValue: 'Resume spoken summary' })}
            data-testid='spoken-row-resume'
            className='inline-flex items-center justify-center w-24px h-24px rd-12px bg-transparent b-0 cursor-pointer hover:bg-3 transition-colors'
          >
            <PlayOne theme='outline' size='14' fill={iconColors.brand} />
          </button>
        </Tooltip>
      );
    }
    return (
      <Tooltip content={t('conversation.chat.voiceMode.pauseAria', { defaultValue: 'Pause spoken summary' })}>
        <button
          type='button'
          onClick={handlePause}
          disabled={!enabled}
          aria-label={t('conversation.chat.voiceMode.pauseAria', { defaultValue: 'Pause spoken summary' })}
          data-testid='spoken-row-pause'
          className='inline-flex items-center justify-center w-24px h-24px rd-12px bg-transparent b-0 cursor-pointer hover:bg-3 transition-colors'
        >
          <PauseOne theme='outline' size='14' fill={iconColors.brand} />
        </button>
      </Tooltip>
    );
  })();

  const skipButton = isCurrent ? (
    <Tooltip content={t('conversation.chat.voiceMode.skipAria', { defaultValue: 'Skip spoken summary' })}>
      <button
        type='button'
        onClick={handleSkip}
        disabled={!enabled}
        aria-label={t('conversation.chat.voiceMode.skipAria', { defaultValue: 'Skip spoken summary' })}
        data-testid='spoken-row-skip'
        className='inline-flex items-center justify-center w-24px h-24px rd-12px bg-transparent b-0 cursor-pointer hover:bg-3 transition-colors'
      >
        <RightOne theme='outline' size='14' fill={iconColors.secondary} />
      </button>
    </Tooltip>
  ) : null;

  return (
    <div
      className='mt-6px flex items-center gap-6px max-w-full rd-6px py-4px px-8px text-12px text-t-secondary'
      data-testid='spoken-row'
      data-voice-status={isCurrent ? status : 'idle'}
    >
      <VoiceOne theme='outline' size='14' fill={iconColors.brand} />
      <span className='flex-1 min-w-0 truncate' title={text}>
        {text}
      </span>
      <span className='sr-only'>
        {t('conversation.chat.voiceMode.spokenLabel', { defaultValue: 'Spoken summary' })}
      </span>
      {primaryAction}
      {skipButton}
    </div>
  );
};

export default SpokenRow;
