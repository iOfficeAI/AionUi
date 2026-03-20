/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Pure utility functions for the conversation minimap panel.

import type { IMessageText, TMessage } from '@/common/chat/chatLib';
import React from 'react';
import {
  defaultVisualStyle,
  MAX_LINE_LEN,
  PANEL_MARGIN,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  PANEL_WIDTH_RATIO,
} from './minimapTypes';
import type { MinimapVisualStyle, TurnPreviewItem } from './minimapTypes';

export const isTransparentColor = (value: string) => {
  const normalized = value.replace(/\s+/g, '').toLowerCase();
  return normalized === 'transparent' || normalized === 'rgba(0,0,0,0)';
};

export const readChatSurfaceBackground = () => {
  if (typeof document === 'undefined') return defaultVisualStyle.background;
  const selectors = ['.chat-layout-header', '.layout-content.bg-1', '.arco-layout-content.bg-1', '.bg-1'];
  for (const selector of selectors) {
    const node = document.querySelector<HTMLElement>(selector);
    if (!node) continue;
    const computed = window.getComputedStyle(node);
    if (computed.backgroundImage && computed.backgroundImage !== 'none') {
      return computed.background;
    }
    if (!isTransparentColor(computed.backgroundColor)) {
      return computed.backgroundColor;
    }
  }
  return defaultVisualStyle.background;
};

export const readPopoverVisualStyle = (): MinimapVisualStyle => {
  if (typeof document === 'undefined') return defaultVisualStyle;
  const probe = document.createElement('div');
  probe.className = 'arco-popover-content';
  probe.style.position = 'fixed';
  probe.style.left = '-10000px';
  probe.style.top = '-10000px';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.textContent = 'probe';
  document.body.appendChild(probe);
  const computed = window.getComputedStyle(probe);
  const borderWidth = computed.borderTopWidth;
  const borderStyle = computed.borderTopStyle;
  const borderColor = computed.borderTopColor;
  const borderRadius = computed.borderTopLeftRadius;
  const boxShadow = computed.boxShadow;
  document.body.removeChild(probe);

  const safeBorderColor = isTransparentColor(borderColor) ? defaultVisualStyle.borderColor : borderColor;
  const safeBorderStyle = borderStyle && borderStyle !== 'none' ? borderStyle : 'solid';
  const safeBorderWidth = borderWidth && borderWidth !== '0px' ? borderWidth : '1px';

  return {
    background: readChatSurfaceBackground(),
    border: `${safeBorderWidth} ${safeBorderStyle} ${safeBorderColor}`,
    borderColor: safeBorderColor,
    borderRadius: borderRadius || defaultVisualStyle.borderRadius,
    boxShadow: boxShadow && boxShadow !== 'none' ? boxShadow : defaultVisualStyle.boxShadow,
  };
};

export const getPanelWidth = () => {
  if (typeof window === 'undefined') return PANEL_MAX_WIDTH;
  const viewportCap = Math.max(280, window.innerWidth - PANEL_MARGIN * 2);
  const ratioWidth = Math.floor(window.innerWidth * PANEL_WIDTH_RATIO);
  const target = Math.min(PANEL_MAX_WIDTH, ratioWidth, viewportCap);
  return Math.max(Math.min(PANEL_MIN_WIDTH, viewportCap), target);
};

export const isTextMessage = (message: TMessage): message is IMessageText => {
  return message.type === 'text' && typeof message.content?.content === 'string';
};

export const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

export const truncate = (value: string, maxLen = MAX_LINE_LEN) => {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen - 1)}…`;
};

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const buildSearchSnippet = (text: string, keyword: string, maxLen = MAX_LINE_LEN) => {
  if (!keyword) return truncate(text, maxLen);
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerKeyword);
  if (matchIndex === -1) return truncate(text, maxLen);

  const keywordLen = lowerKeyword.length;
  const halfWindow = Math.max(8, Math.floor((maxLen - keywordLen) / 2));
  let start = Math.max(0, matchIndex - halfWindow);
  const end = Math.min(text.length, start + maxLen);
  if (end === text.length) {
    start = Math.max(0, end - maxLen);
  }

  const snippet = text.slice(start, end);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${snippet}${suffix}`;
};

export const renderHighlightedText = (text: string, keyword: string, maxLen = MAX_LINE_LEN) => {
  const snippet = buildSearchSnippet(text, keyword, maxLen);
  if (!keyword) return snippet;
  const escaped = escapeRegExp(keyword);
  const re = new RegExp(`(${escaped})`, 'ig');
  const parts = snippet.split(re);
  if (parts.length <= 1) return snippet;
  const lowerKeyword = keyword.toLowerCase();
  return parts.map((part, idx) =>
    part.toLowerCase() === lowerKeyword
      ? React.createElement('strong', { key: `${part}-${idx}`, style: { fontWeight: 800 } }, part)
      : React.createElement(React.Fragment, { key: `${part}-${idx}` }, part)
  );
};

export const toChineseNumeral = (num: number): string => {
  if (!Number.isFinite(num) || num <= 0) return '';
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (num < 10) return digits[num];
  if (num < 20) return num === 10 ? '十' : `十${digits[num % 10]}`;
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return `${digits[tens]}十${ones === 0 ? '' : digits[ones]}`;
  }
  return String(num);
};

export const buildIndexSearchTokens = (index: number) => {
  const arabic = String(index);
  const chinese = toChineseNumeral(index);
  return [arabic, `#${arabic}`, `第${arabic}`, chinese, chinese ? `第${chinese}` : ''].filter(Boolean);
};

export const isIndexMatch = (index: number, keyword: string) => {
  if (!keyword) return false;
  const normalized = keyword.toLowerCase();
  return buildIndexSearchTokens(index).some((token) => token.toLowerCase().includes(normalized));
};

export const buildTurnPreview = (messages: TMessage[]): TurnPreviewItem[] => {
  const turns: TurnPreviewItem[] = [];
  let turnIndex = 0;
  let currentTurn: TurnPreviewItem | null = null;

  for (const message of messages) {
    if (!isTextMessage(message)) continue;

    const text = normalizeText(message.content.content || '');
    if (!text) continue;

    if (message.position === 'right') {
      if (currentTurn) {
        turns.push(currentTurn);
      }
      turnIndex += 1;
      currentTurn = {
        index: turnIndex,
        question: truncate(text),
        answer: '',
        questionRaw: text,
        answerRaw: '',
        messageId: message.id,
        msgId: message.msg_id,
      };
      continue;
    }

    if (message.position === 'left' && currentTurn) {
      if (!currentTurn.answer) {
        currentTurn.answer = truncate(text);
        currentTurn.answerRaw = text;
      }
      continue;
    }
  }

  if (currentTurn) {
    turns.push(currentTurn);
  }

  return turns;
};
