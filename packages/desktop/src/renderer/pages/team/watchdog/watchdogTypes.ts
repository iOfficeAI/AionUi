/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChatFileRef } from '@/common/types/chatFile';

export type TeamWatchdogInterval = 0 | 120_000 | 300_000 | 600_000;

export type TeamWatchdogPrompt = {
  input: string;
  files?: ChatFileRef[];
  slot_id?: string;
  timestamp: number;
};

export type TeamWatchdogStatus = 'idle' | 'monitoring' | 'recovering';
