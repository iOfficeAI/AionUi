/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { globalNavigate } from '@/renderer/utils/navigation';
import { Message } from '@arco-design/web-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { mutate as swrMutate } from 'swr';

/** Backend manifest id of the built-in AionUi Butler assistant. */
const BUTLER_ASSISTANT_ID = 'aionui-assistant';

export type TalkToButlerArgs = {
  /** Prompt pre-filled into the home chat input. */
  prompt: string;
  /** Optional file paths pre-attached to the input (e.g. report screenshots). */
  files?: string[];
};

/**
 * Resolve the Butler assistant from the catalog, tolerating the `builtin-`
 * prefix the frontend sometimes carries on built-in ids.
 */
const findButler = (assistants: Assistant[]): Assistant | undefined => {
  const candidates = new Set([BUTLER_ASSISTANT_ID, `builtin-${BUTLER_ASSISTANT_ID}`]);
  return assistants.find(
    (assistant) => candidates.has(assistant.id) || assistant.id.replace(/^builtin-/, '') === BUTLER_ASSISTANT_ID
  );
};

/**
 * Shared entry point behind every "via chat" action: jump to the home page,
 * select the AionUi Butler, and pre-fill the chat input with a ready-made
 * prompt (and optional attachments). Auto-enables the Butler if the user has
 * disabled it, since clicking the action is an explicit intent to use it.
 *
 * Reuses the home page's `prefillPrompt` navigation contract (added with the
 * scheduled-tasks "create via chat" entry) and extends it with `prefillFiles`.
 * Uses `globalNavigate` rather than `useNavigate` so it is safe to call from
 * components mounted outside the Router (e.g. the global FeedbackReportModal).
 */
export const useTalkToButler = (): ((args: TalkToButlerArgs) => Promise<void>) => {
  const { t } = useTranslation();

  return useCallback(
    async ({ prompt, files }: TalkToButlerArgs) => {
      let selectedAssistantId: string | undefined;

      try {
        const assistants = await ipcBridge.assistants.list.invoke();
        const butler = findButler(assistants);
        if (butler) {
          selectedAssistantId = butler.id;
          if (butler.enabled === false) {
            await ipcBridge.assistants.setState.invoke({ id: butler.id, enabled: true });
            await swrMutate('assistants.list');
            Message.success(
              t('settings.talkToButler.enabledToast', { defaultValue: 'Enabled the AionUi Butler for you' })
            );
          }
        }
      } catch (error) {
        // Non-fatal: fall through to the home page with the prompt pre-filled
        // but no assistant pinned, rather than blocking the user.
        console.error('[talkToButler] failed to resolve/enable butler:', error);
      }

      globalNavigate('/guid', {
        state: {
          selectedAssistantId,
          prefillPrompt: prompt,
          prefillFiles: files,
        },
      });
    },
    [t]
  );
};

export default useTalkToButler;
