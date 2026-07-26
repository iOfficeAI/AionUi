/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import { copyText } from '@/renderer/utils/ui/clipboard';

/**
 * Decide whether an outgoing prompt should be mirrored to the system clipboard.
 *
 * Blank drafts are skipped even when the preference is on: an attachment-only
 * send would otherwise wipe whatever the user had copied earlier, which is the
 * opposite of the safety net this feature is meant to provide.
 */
export const shouldBackupPrompt = (enabled: boolean | undefined, prompt: string): boolean => {
  return enabled === true && prompt.trim().length > 0;
};

/**
 * Mirror a prompt to the system clipboard when the user enabled the backup
 * preference, so a crash or a forced re-login cannot destroy a long draft.
 *
 * Fire-and-forget by design: a clipboard permission failure must never block
 * or delay the send itself.
 */
export const backupPromptToClipboard = (prompt: string): void => {
  if (!shouldBackupPrompt(configService.get('input.copyPromptOnSend'), prompt)) {
    return;
  }
  void copyText(prompt).catch(() => {});
};
