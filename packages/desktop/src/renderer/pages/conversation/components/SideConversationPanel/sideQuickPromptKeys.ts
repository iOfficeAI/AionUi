/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** i18n keys under `conversation.sideConversation.quickPrompts.*` (≥12 for rotation). */
export const SIDE_QUICK_PROMPT_KEYS = [
  // 📊 Just came back
  'currentStatus',
  'catchMeUp',
  'changedFiles',
  // 💡 Don't understand
  'inPlainTerms',
  'explainSelection',
  'explainError',
  // 🛡️ Hesitant to approve
  'safeToContinue',
  'beforeApproving',
  'confidenceLevel',
  // 😰 Uneasy
  'didIForget',
  'stillWorks',
  'rippleEffect',
  // 🤔 Doubting the approach
  'isOffTrack',
  'worthDoing',
  'existingSolution',
  // ⚖️ Facing a choice
  'whichIsBetter',
  'whyThisApproach',
  // 🧠 Diverge
  'moreIdeas',
  'yourWay',
  // 📋 Make it clear
  'listRisks',
  'useTable',
  'stepByStep',
  // 🎯 Verify
  'howToVerify',
  'worstCase',
  // 🗣️ Communicate
  'explainToOthers',
  'othersPerspective',
] as const;

export type SideQuickPromptKey = (typeof SIDE_QUICK_PROMPT_KEYS)[number];

export const SIDE_QUICK_PROMPT_VISIBLE_COUNT = 4;
export const SIDE_QUICK_PROMPT_ROTATE_MS = 30000;
