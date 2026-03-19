/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Type definitions and constants for the conversation minimap panel.

export type TurnPreviewItem = {
  index: number;
  question: string;
  answer: string;
  questionRaw: string;
  answerRaw: string;
  messageId?: string;
  msgId?: string;
};

export type MinimapVisualStyle = {
  background: string;
  border: string;
  borderColor: string;
  borderRadius: string;
  boxShadow: string;
};

export const MAX_LINE_LEN = 92;
export const PANEL_MIN_WIDTH = 420;
export const PANEL_MAX_WIDTH = 980;
export const PANEL_WIDTH_RATIO = 0.72;
export const PANEL_HEIGHT = 420;
export const PANEL_MIN_HEIGHT = 200;
export const PANEL_MARGIN = 12;
export const PANEL_OFFSET = 8;
export const HEADER_HEIGHT = 52;
export const ITEM_ROW_ESTIMATED_HEIGHT = 80;
export const PANEL_VISIBLE_ITEM_CAP = 5;

export const defaultVisualStyle: MinimapVisualStyle = {
  background: 'var(--color-bg-5)',
  border: '1px solid var(--color-border-2)',
  borderColor: 'var(--color-border-2)',
  borderRadius: '12px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16)',
};

export type ConversationTitleMinimapProps = {
  conversationId?: string;
};
