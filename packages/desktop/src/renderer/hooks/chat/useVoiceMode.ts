/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';

import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import { normalizeTextToSpeechConfig } from '@/renderer/services/tts';
import type { TextToSpeechConfig } from '@/common/types/provider/speech';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';

export type VoiceModeEffective = {
  /** Per-conversation override (if any). */
  perConversation: boolean | undefined;
  /** TTS config from settings (may not be loaded yet). */
  config: TextToSpeechConfig | null;
  /** Effective value: per-conversation ?? config.voiceModeDefault ?? false. */
  effective: boolean;
  /** True only when TTS itself is enabled. */
  ttsEnabled: boolean;
};

const readTextToSpeechConfig = (): TextToSpeechConfig | null => {
  const stored = configService.get('tools.textToSpeech');
  if (!stored) return null;
  return normalizeTextToSpeechConfig(stored);
};

const readPerConversationVoiceMode = (extra: Record<string, unknown> | undefined): boolean | undefined => {
  if (!extra) return undefined;
  const value = extra.voice_mode;
  return typeof value === 'boolean' ? value : undefined;
};

/**
 * Read the per-conversation `voice_mode` override + the global TTS config.
 * Subscribes to config changes so the effective flag updates as the user
 * flips the TTS toggle in settings.
 */
export const useVoiceModeState = (): VoiceModeEffective => {
  const conversation = useConversationContextSafe();
  const [config, setConfig] = useState<TextToSpeechConfig | null>(() => readTextToSpeechConfig());

  useEffect(() => {
    // Re-read on mount in case configService was populated after the
    // initial state read. Also subscribe to live changes.
    setConfig(readTextToSpeechConfig());
    try {
      return configService.subscribe('tools.textToSpeech', (value) => {
        if (!value) {
          setConfig(null);
          return;
        }
        setConfig(normalizeTextToSpeechConfig(value as TextToSpeechConfig));
      });
    } catch {
      return undefined;
    }
  }, []);

  const perConversation = useMemo(
    () => readPerConversationVoiceMode(conversation?.extra as Record<string, unknown> | undefined),
    [conversation?.extra]
  );

  const ttsEnabled = Boolean(config?.enabled);
  const effective = perConversation ?? config?.voiceModeDefault ?? false;

  return {
    perConversation,
    config,
    effective: ttsEnabled && effective,
    ttsEnabled,
  };
};

export type UseVoiceModeToggleOptions = {
  /** The remote agent config ID (FK to remote_agents). Required to push to the plugin. */
  remoteAgentId?: string;
  /** The OpenCode session key (optional — when absent, push is agent-global). */
  sessionKey?: string;
};

export type UseVoiceModeToggleResult = {
  /** Effective voice-mode state for the current conversation. */
  effective: boolean;
  /** Per-conversation override, if explicitly set. */
  perConversation: boolean | undefined;
  /** TTS enabled in settings. */
  ttsEnabled: boolean;
  /** True while a toggle is in flight (UI debounce). */
  isToggling: boolean;
  /** Toggle voice mode. Persists the new value and pushes to the plugin. */
  toggle: () => Promise<void>;
  /** Set voice mode to a specific value. */
  setEnabled: (next: boolean) => Promise<void>;
};

/**
 * Hook for the per-conversation voice-mode toggle. Persists the new value
 * in `extra.voice_mode` and pushes the state to the OpenCode plugin
 * (fire-and-forget — the call is a best-effort signal, not a hard
 * requirement for local UI state).
 */
export const useVoiceModeToggle = (options: UseVoiceModeToggleOptions): UseVoiceModeToggleResult => {
  const { remoteAgentId, sessionKey } = options;
  const conversation = useConversationContextSafe();
  const { t } = useTranslation();
  const state = useVoiceModeState();
  const [isToggling, setIsToggling] = useState(false);
  // Debounce one push per conversation mount: we only push on mount when
  // the conversation explicitly has `voice_mode` set, not on every render.
  const mountPushedRef = useRef<string | null>(null);

  // Push the current state to the OpenCode plugin when the conversation
  // mounts with an explicit voice_mode override. The plugin may have
  // restarted (AionCore reload) and lost its in-memory voice-mode state.
  useEffect(() => {
    const conversationId = conversation?.conversation_id;
    if (!conversationId || !remoteAgentId) return;
    if (state.perConversation === undefined) return;
    if (mountPushedRef.current === conversationId) return;
    mountPushedRef.current = conversationId;
    void pushVoiceModeToPlugin({ remoteAgentId, sessionKey, enabled: state.effective }).catch(() => {
      // Silent on mount: the user hasn't actively requested anything,
      // so a toast would be noisy. The toggle action will surface errors.
    });
    // We intentionally do NOT include `state.effective` / `sessionKey` in
    // the deps — we want the push to happen exactly once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.conversation_id, remoteAgentId, state.perConversation]);

  const persist = useCallback(
    async (next: boolean) => {
      const conversationId = conversation?.conversation_id;
      if (!conversationId) return;
      try {
        await ipcBridge.conversation.update.invoke({
          id: conversationId,
          updates: { extra: { voice_mode: next } as Record<string, unknown> },
          merge_extra: true,
        });
      } catch (err) {
        console.error('[voiceMode] failed to persist:', err);
        Message.error(
          t('conversation.chat.voiceMode.persistFailed', { defaultValue: 'Failed to save voice mode preference' })
        );
        throw err;
      }
    },
    [conversation?.conversation_id, t]
  );

  const push = useCallback(
    async (next: boolean) => {
      if (!remoteAgentId) return;
      try {
        await pushVoiceModeToPlugin({ remoteAgentId, sessionKey, enabled: next });
      } catch (err) {
        console.error('[voiceMode] failed to push to plugin:', err);
        Message.error(
          t('conversation.chat.voiceMode.pushFailed', { defaultValue: 'Failed to notify the agent about voice mode' })
        );
        throw err;
      }
    },
    [remoteAgentId, sessionKey, t]
  );

  const setEnabled = useCallback(
    async (next: boolean) => {
      if (!state.ttsEnabled) return;
      if (isToggling) return;
      setIsToggling(true);
      try {
        await persist(next);
        await push(next);
      } finally {
        setIsToggling(false);
      }
    },
    [state.ttsEnabled, isToggling, persist, push]
  );

  const toggle = useCallback(async () => {
    await setEnabled(!state.effective);
  }, [setEnabled, state.effective]);

  return {
    effective: state.effective,
    perConversation: state.perConversation,
    ttsEnabled: state.ttsEnabled,
    isToggling,
    toggle,
    setEnabled,
  };
};

/**
 * Fire-and-forget push to the OpenCode plugin. The promise rejects on
 * HTTP failure; callers decide whether to surface the error.
 */
export const pushVoiceModeToPlugin = async (params: {
  remoteAgentId: string;
  sessionKey?: string;
  enabled: boolean;
}): Promise<void> => {
  if (!params.remoteAgentId) return;
  const payload: { id: string; enabled: boolean; session_id?: string } = {
    id: params.remoteAgentId,
    enabled: params.enabled,
  };
  if (params.sessionKey) payload.session_id = params.sessionKey;
  await ipcBridge.remoteAgent.setVoiceMode.invoke(payload);
};
