/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ASSISTANT_PRESETS } from '@/common/config/presets/assistantPresets';
import { resolveLocaleKey } from '@/common/utils';
import { ProcessConfig } from '@process/utils/initStorage';

type AssistantRecord = { id?: string; name?: string };

/**
 * Resolve a human-readable label for the preset assistant (if any) backing
 * the current conversation, so getTeamGuidePrompt can render the Leader row
 * as e.g. "Word Creator (gemini)" instead of just "gemini".
 *
 * Lookup order:
 *   1. Stored assistant record (`assistants` config) with matching id — uses
 *      whatever name the user set in settings.
 *   2. Builtin preset catalog (`ASSISTANT_PRESETS`) — picks the localized
 *      name using the user's current UI language, with English fallback.
 *   3. Returns undefined when neither is found (caller keeps backend-only cell).
 */
export async function resolveLeaderAssistantLabel(
  presetAssistantId: string | undefined | null
): Promise<string | undefined> {
  if (!presetAssistantId) return undefined;

  try {
    const assistants = (await ProcessConfig.get('assistants')) as AssistantRecord[] | null;
    const stored = Array.isArray(assistants) ? assistants.find((a) => a?.id === presetAssistantId) : undefined;
    if (stored?.name) return stored.name;
  } catch {
    // Assistant config may not yet be initialized — fall through to preset catalog.
  }

  const builtinId = presetAssistantId.startsWith('builtin-')
    ? presetAssistantId.slice('builtin-'.length)
    : presetAssistantId;
  const preset = ASSISTANT_PRESETS.find((p) => p.id === builtinId);
  if (!preset?.nameI18n) return undefined;

  const userLanguage = (await ProcessConfig.get('language').catch((): null => null)) as string | null;
  const localeKey = resolveLocaleKey(userLanguage || 'en-US');
  return preset.nameI18n[localeKey] || preset.nameI18n['en-US'] || Object.values(preset.nameI18n)[0];
}
