/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ICommandEveKanbanMarketingCardCreateResult,
  ICommandEveKanbanMarketingDispatchPlanResult,
  ICommandEveKanbanMarketingLaneKey,
} from '@/common/adapter/ipcBridge';

const MARKETING_COMMANDS = ['/marketing', '/marketing-card', '/eve marketing'];
const MARKETING_LOOP_COMMANDS = ['/marketing-loop', '/eve marketing-loop'];
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2000;

export type CommandEveLocalMarketingIntent = {
  kind: 'marketing-card';
  title: string;
  description?: string;
  laneKey: ICommandEveKanbanMarketingLaneKey;
  shouldPlanDispatch: boolean;
  shouldRunSafeLocalLoop: boolean;
};

export type CommandEveLocalMarketingIntentResult = {
  card: ICommandEveKanbanMarketingCardCreateResult;
  dispatchPlan?: ICommandEveKanbanMarketingDispatchPlanResult;
};

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const splitCommandPayload = (input: string, command: string): string | null => {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  if (lower === command) return '';
  if (!lower.startsWith(`${command} `)) return null;
  return trimmed.slice(command.length).trim();
};

const parseTitleDescription = (
  payload: string
): Pick<CommandEveLocalMarketingIntent, 'title' | 'description'> | null => {
  const cleanPayload = payload.trim();
  if (!cleanPayload) return null;

  const [rawTitle, ...descriptionParts] = cleanPayload.includes('::')
    ? cleanPayload.split('::')
    : cleanPayload.split(/\n+/);
  const title = normalizeWhitespace(rawTitle).slice(0, MAX_TITLE_LENGTH);
  if (!title) return null;

  const description = normalizeWhitespace(descriptionParts.join('\n')).slice(0, MAX_DESCRIPTION_LENGTH);
  return description ? { title, description } : { title };
};

export const parseCommandEveLocalMarketingIntent = (input: string): CommandEveLocalMarketingIntent | null => {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  for (const command of MARKETING_LOOP_COMMANDS) {
    const payload = splitCommandPayload(trimmed, command);
    if (payload === null) continue;
    const parsed = parseTitleDescription(payload);
    if (!parsed) return null;
    return {
      kind: 'marketing-card',
      ...parsed,
      laneKey: 'research',
      shouldPlanDispatch: true,
      shouldRunSafeLocalLoop: true,
    };
  }

  for (const command of MARKETING_COMMANDS) {
    const payload = splitCommandPayload(trimmed, command);
    if (payload === null) continue;
    const parsed = parseTitleDescription(payload);
    if (!parsed) return null;
    return {
      kind: 'marketing-card',
      ...parsed,
      laneKey: 'research',
      shouldPlanDispatch: true,
      shouldRunSafeLocalLoop: false,
    };
  }

  return null;
};

export const createCommandEveLocalIntentClientToken = (): string => {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `cmd-eve-chat-marketing-${cryptoApi.randomUUID()}`;
  }
  return `cmd-eve-chat-marketing-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};
