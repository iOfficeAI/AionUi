/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { emitter } from '@/renderer/utils/emitter';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

/**
 * Number of times we retry emitting `sendbox.fill` after navigating to a
 * different conversation. The target SendBox mounts asynchronously after the
 * route change, so a single emit fired immediately after `navigate()` can be
 * lost. A few animation frames cover the mount latency without needing an ack
 * channel (the scoped/handled events only exist on feature branches).
 */
const FILL_RETRY_LIMIT = 5;

/**
 * Pre-fills the conversation SendBox with the cron default prompt so the user
 * can create an AionUi scheduled task via the /cron skill.
 *
 * Used by the conversation history row context menu ("Create scheduled task").
 * Reuses the existing unscoped `sendbox.fill` event that every platform
 * SendBox already listens to (same path as the cron "Create Now" button).
 */
export const useCronTaskCreation = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: activeConversationId } = useParams();

  return useCallback(
    (conversation: TChatConversation) => {
      const text = t('cron.status.defaultPrompt');
      // Fill the input, then focus the textarea so the user can review and send.
      const fill = () => {
        emitter.emit('sendbox.fill', text);
        emitter.emit('sendbox.focus');
      };

      // Same conversation: the SendBox is already mounted, fill immediately.
      if (conversation.id === activeConversationId) {
        fill();
        return;
      }

      // Different conversation: navigate first, then retry the fill across a
      // few frames so it lands once the target SendBox has mounted.
      void navigate(`/conversation/${conversation.id}`);
      let attempt = 0;
      const retry = () => {
        if (attempt >= FILL_RETRY_LIMIT) return;
        attempt += 1;
        fill();
        if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
          requestAnimationFrame(retry);
        } else {
          setTimeout(retry, 60);
        }
      };
      // Kick off after a frame so the route transition has started.
      if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
        requestAnimationFrame(retry);
      } else {
        setTimeout(retry, 60);
      }
    },
    [t, navigate, activeConversationId]
  );
};
