/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isBackendHttpError } from '@/common/adapter/httpBridge';

export type ConversationBusyKind = 'active_turn' | 'runtime_unavailable';

export type ConversationBusyErrorClassification = {
  kind: ConversationBusyKind;
  status: number;
  code: string;
  backendMessage: string;
};

const ACTIVE_TURN_BUSY_PATTERNS = ['already running', 'already processing'] as const;
const RUNTIME_UNAVAILABLE_BUSY_PATTERNS = ['runtime is shutting down', 'is being deleted'] as const;

const includesAny = (message: string, patterns: readonly string[]): boolean =>
  patterns.some((pattern) => message.includes(pattern));

export const classifyConversationBusyError = (error: unknown): ConversationBusyErrorClassification | null => {
  if (!isBackendHttpError(error)) return null;
  if (error.status !== 409 || error.code !== 'CONFLICT') return null;

  const backendMessage = error.backendMessage;
  const normalizedMessage = backendMessage.toLowerCase();
  if (includesAny(normalizedMessage, ACTIVE_TURN_BUSY_PATTERNS)) {
    return { kind: 'active_turn', status: error.status, code: error.code, backendMessage };
  }
  if (includesAny(normalizedMessage, RUNTIME_UNAVAILABLE_BUSY_PATTERNS)) {
    return { kind: 'runtime_unavailable', status: error.status, code: error.code, backendMessage };
  }
  return null;
};

export const isConversationBusyError = (error: unknown): boolean => classifyConversationBusyError(error) !== null;
