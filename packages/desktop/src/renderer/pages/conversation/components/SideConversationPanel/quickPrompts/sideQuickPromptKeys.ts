/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * i18n keys under `conversation.sideConversation.quickPrompts.*` (20 keys = 5
 * full rotation windows of 4; each key keeps a distinct intent, no overlaps).
 */
export const SIDE_QUICK_PROMPT_KEYS = [
  // 📊 Just came back
  'catchMeUp',
  'changedFiles',
  // 💡 Don't understand
  'inPlainTerms',
  'explainSelection',
  'explainError',
  // 🛡️ Hesitant to approve
  'safeToContinue',
  'confidenceLevel',
  // 😰 Uneasy
  'didIForget',
  'stillWorks',
  // 🤔 Doubting the approach
  'isOffTrack',
  'existingSolution',
  // ⚖️ Facing a choice
  'whichIsBetter',
  'whyThisApproach',
  // 🧠 Diverge
  'moreIdeas',
  'yourWay',
  // 📋 Make it clear
  'useTable',
  'stepByStep',
  // 🎯 Verify
  'howToVerify',
  'worstCase',
  // 🗣️ Communicate
  'explainToOthers',
] as const;

export type SideQuickPromptKey = (typeof SIDE_QUICK_PROMPT_KEYS)[number];

export const SIDE_QUICK_PROMPT_VISIBLE_COUNT = 4;
export const SIDE_QUICK_PROMPT_ROTATE_MS = 30000;
