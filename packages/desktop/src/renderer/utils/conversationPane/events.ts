/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MoE Runbook — Conversation Pane event bus.
 *
 * Decouples global toggle triggers (Titlebar, keyboard shortcuts, tray
 * commands) from the layout-owned state in `Layout.tsx`. Listeners that
 * only need to react to a toggle request (e.g. focus the search input,
 * navigate to a fresh conversation) should subscribe to the toggle event;
 * listeners that need to mirror the collapsed/expanded state (e.g. icon
 * glyphs in the Titlebar) should subscribe to the state event.
 *
 * Kept separate from `utils/workspace/workspaceEvents.ts` because the
 * two surfaces (workspace pane and conversation pane) are independent
 * products in the same layout and may be re-introduced / re-hidden
 * independently via their own flags.
 */

export const CONVERSATION_PANE_TOGGLE_EVENT = 'aionui-conversation-pane-toggle';
export const CONVERSATION_PANE_STATE_EVENT = 'aionui-conversation-pane-state';

export interface ConversationPaneStateDetail {
  collapsed: boolean;
}

export function dispatchConversationPaneToggleEvent(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CONVERSATION_PANE_TOGGLE_EVENT));
}

export function dispatchConversationPaneStateEvent(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ConversationPaneStateDetail>(CONVERSATION_PANE_STATE_EVENT, { detail: { collapsed } })
  );
}
