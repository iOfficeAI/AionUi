/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { resolveLocaleKey } from '@/common/utils';
import { ProcessConfig } from '@process/utils/initStorage';

/**
 * Resolve a human-readable label for the preset assistant (if any) backing
 * the current conversation, so getTeamGuidePrompt can render the Leader row
 * as e.g. "Word Creator (gemini)" instead of just "gemini".
 *
 * Lookup order (all from the backend-merged catalog, so builtin + user +
 * extension are handled uniformly):
 *   1. Exact id match, or the legacy `builtin-<id>` form (back-compat for
 *      conversations created before the migration).
 *   2. Localized nameI18n using the user's current UI language.
 *   3. Returns undefined when no match is found (caller keeps backend-only cell).
 */
export async function resolveLeaderAssistantLabel(
  preset_assistant_id: string | undefined | null
): Promise<string | undefined> {
  if (!preset_assistant_id) return undefined;

  let assistants;
  try {
    assistants = await ipcBridge.assistants.list.invoke();
  } catch {
    return undefined;
  }

  const bareId = preset_assistant_id.startsWith('builtin-')
    ? preset_assistant_id.slice('builtin-'.length)
    : preset_assistant_id;

  const match =
    assistants.find((a) => a.id === preset_assistant_id) ?? assistants.find((a) => a.id === `builtin-${bareId}`);
  if (!match) return undefined;

  const userLanguage = (await ProcessConfig.get('language').catch((): null => null)) as string | null;
  const localeKey = resolveLocaleKey(userLanguage || 'en-US');

  const localized = match.nameI18n?.[localeKey] || match.nameI18n?.['en-US'];
  return localized || match.name || undefined;
}
