/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/config/storage';
import { getSpeechInputErrorMessageKey, useSpeechInput } from '@/renderer/hooks/system/useSpeechInput';
import { Button, Message, Tooltip } from '@arco-design/web-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VoiceCallSetting } from './config';
import { voiceCallController, type VoiceCallSnapshot } from './VoiceCallController';

type VoiceCallButtonProps = {
  conversationId: string;
  setting: VoiceCallSetting;
  currentModel?: Pick<TProviderWithModel, 'id' | 'use_model'>;
  onApplyModel?: (providerId: string, model: string) => Promise<boolean>;
};

const ACTIVE_STATUSES = new Set<VoiceCallSnapshot['status']>([
  'starting',
  'listening',
  'transcribing',
  'waiting',
  'speaking',
  'error',
]);

const playListeningCue = (): void => {
  try {
    const AudioContextCtor = window.AudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.13);
    oscillator.addEventListener('ended', () => void context.close());
  } catch {
    // A cue is helpful but never required for the call loop.
  }
};

const statusLabel = (status: VoiceCallSnapshot['status'], t: ReturnType<typeof useTranslation>['t']): string => {
  switch (status) {
    case 'starting':
      return t('voiceCall.starting', { defaultValue: '正在启动' });
    case 'listening':
      return t('voiceCall.listening', { defaultValue: '正在听，请说话' });
    case 'transcribing':
      return t('voiceCall.transcribing', { defaultValue: '正在识别' });
    case 'waiting':
      return t('voiceCall.waiting', { defaultValue: '等待回复' });
    case 'speaking':
      return t('voiceCall.speaking', { defaultValue: '正在朗读' });
    case 'error':
      return t('voiceCall.error', { defaultValue: '通话出错' });
    default:
      return t('voiceCall.title', { defaultValue: '电话模式' });
  }
};

const VoiceCallButton: React.FC<VoiceCallButtonProps> = ({ conversationId, setting, currentModel, onApplyModel }) => {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<VoiceCallSnapshot>(() => voiceCallController.getSnapshot());
  const startInFlightRef = useRef(false);
  const speechHeardRef = useRef(false);
  const silenceSinceRef = useRef<number | null>(null);
  const restoreModelRef = useRef<Pick<TProviderWithModel, 'id' | 'use_model'> | null>(null);

  const handleTranscript = useCallback((transcript: string) => {
    voiceCallController.submitTranscript(transcript);
  }, []);
  const handleLiveTranscript = useCallback((transcript: string | null) => {
    voiceCallController.setLiveTranscript(transcript);
  }, []);

  const {
    clearError,
    errorCode,
    errorMessage,
    recordingDurationMs,
    recordingLevels,
    startRecording,
    status: speechStatus,
    stopRecording,
  } = useSpeechInput({
    // [voiceCall] The regular composer owns the global hotkey. The call loop
    // starts/stops this recorder explicitly so one key press cannot toggle two instances.
    enableGlobalHotkey: false,
    onLiveTranscript: handleLiveTranscript,
    onTranscript: handleTranscript,
  });

  useEffect(() => voiceCallController.subscribe(setSnapshot), []);

  useEffect(() => {
    if (snapshot.sessionId && snapshot.conversationId !== conversationId) {
      voiceCallController.stop();
    }
  }, [conversationId, snapshot.conversationId, snapshot.sessionId]);

  useEffect(() => {
    if (snapshot.status !== 'listening' || speechStatus !== 'idle' || startInFlightRef.current) return;
    startInFlightRef.current = true;
    speechHeardRef.current = false;
    silenceSinceRef.current = null;
    playListeningCue();
    void startRecording().finally(() => {
      startInFlightRef.current = false;
    });
  }, [snapshot.status, speechStatus, startRecording]);

  useEffect(() => {
    if (!snapshot.sessionId) return;
    if (speechStatus === 'recording') {
      voiceCallController.markRecording();
    } else if (speechStatus === 'transcribing') {
      voiceCallController.markTranscribing();
    }
  }, [snapshot.sessionId, speechStatus]);

  useEffect(() => {
    if (!errorCode || !snapshot.sessionId) return;
    const base = t(getSpeechInputErrorMessageKey(errorCode));
    const detail = errorMessage?.trim();
    const message = detail ? `${base}: ${detail}` : base;
    Message.error(message);
    voiceCallController.fail(message);
    clearError();
  }, [clearError, errorCode, errorMessage, snapshot.sessionId, t]);

  // [voiceCall] Conservative client-side VAD: after actual speech is observed,
  // finish the turn after 1.2 s of quiet. A 45 s cap prevents a stuck capture.
  useEffect(() => {
    if (speechStatus !== 'recording') return;
    const peak = recordingLevels.reduce((max, level) => Math.max(max, level), 0);
    const now = Date.now();
    if (peak >= 0.055) {
      speechHeardRef.current = true;
      silenceSinceRef.current = null;
    } else if (speechHeardRef.current && peak <= 0.035) {
      silenceSinceRef.current ??= now;
      if (now - silenceSinceRef.current >= 1200) {
        stopRecording();
        return;
      }
    } else {
      silenceSinceRef.current = null;
    }
    if (recordingDurationMs >= 45_000) {
      stopRecording();
    }
  }, [recordingDurationMs, recordingLevels, speechStatus, stopRecording]);

  const restorePreviousModel = useCallback(async () => {
    const previous = restoreModelRef.current;
    restoreModelRef.current = null;
    if (!previous || !onApplyModel) return;
    try {
      await onApplyModel(previous.id, previous.use_model);
    } catch (error) {
      console.warn('[voiceCall] Failed to restore the pre-call model:', error);
    }
  }, [onApplyModel]);

  const startCall = useCallback(async () => {
    if (setting.providerId && setting.model && onApplyModel) {
      const changed = currentModel?.id !== setting.providerId || currentModel?.use_model !== setting.model;
      if (changed) {
        restoreModelRef.current = currentModel ?? null;
        try {
          const applied = await onApplyModel(setting.providerId, setting.model);
          if (!applied) {
            restoreModelRef.current = null;
            Message.warning(t('voiceCall.modelFallback', { defaultValue: '通话模型不可用，已沿用当前模型' }));
          }
        } catch {
          restoreModelRef.current = null;
          Message.warning(t('voiceCall.modelFallback', { defaultValue: '通话模型不可用，已沿用当前模型' }));
        }
      }
    }
    voiceCallController.start(conversationId);
  }, [conversationId, currentModel, onApplyModel, setting.model, setting.providerId, t]);

  const exitCall = useCallback(() => {
    if (speechStatus === 'recording') {
      stopRecording();
    }
    voiceCallController.stop();
    void restorePreviousModel();
  }, [restorePreviousModel, speechStatus, stopRecording]);

  useEffect(() => {
    return () => {
      if (voiceCallController.getSnapshot().conversationId === conversationId) {
        voiceCallController.stop();
        void restorePreviousModel();
      }
    };
  }, [conversationId, restorePreviousModel]);

  const isThisCall = snapshot.conversationId === conversationId && ACTIVE_STATUSES.has(snapshot.status);
  if (!isThisCall) {
    return (
      <Tooltip content={t('voiceCall.startHint', { defaultValue: '进入电话模式，语音与当前会话连续对话' })}>
        <Button
          size='small'
          shape='round'
          onClick={() => void startCall()}
          aria-label={t('voiceCall.title', { defaultValue: '电话模式' })}
        >
          {t('voiceCall.title', { defaultValue: '电话模式' })}
        </Button>
      </Tooltip>
    );
  }

  const handlePrimary = () => {
    if (snapshot.status === 'listening' && speechStatus === 'recording') {
      stopRecording();
      return;
    }
    if (snapshot.status === 'speaking' || snapshot.status === 'waiting') {
      voiceCallController.interrupt();
      return;
    }
    if (snapshot.status === 'error') {
      voiceCallController.retryListening();
    }
  };
  const primaryDisabled = snapshot.status === 'starting' || snapshot.status === 'transcribing';
  const primaryLabel =
    snapshot.status === 'listening'
      ? t('voiceCall.finishTurn', { defaultValue: '结束本轮' })
      : snapshot.status === 'speaking' || snapshot.status === 'waiting'
        ? t('voiceCall.interrupt', { defaultValue: '打断并说话' })
        : snapshot.status === 'error'
          ? t('voiceCall.retry', { defaultValue: '重新监听' })
          : statusLabel(snapshot.status, t);

  return (
    <div
      className='flex items-center gap-4px'
      role='group'
      aria-label={t('voiceCall.title', { defaultValue: '电话模式' })}
    >
      <Tooltip content={snapshot.liveTranscript || snapshot.error || statusLabel(snapshot.status, t)}>
        <Button
          size='small'
          shape='round'
          status={snapshot.status === 'error' ? 'danger' : undefined}
          disabled={primaryDisabled}
          onClick={handlePrimary}
        >
          {primaryLabel}
        </Button>
      </Tooltip>
      <Button size='small' shape='round' type='secondary' onClick={exitCall}>
        {t('voiceCall.exit', { defaultValue: '退出' })}
      </Button>
    </div>
  );
};

export default VoiceCallButton;
