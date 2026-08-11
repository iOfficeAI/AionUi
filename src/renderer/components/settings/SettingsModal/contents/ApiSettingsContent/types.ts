/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider } from '@/common/config/storage';
import type { AcpBackend } from '@/common/types/acpTypes';

export type ApiTabKey = 'auth' | 'callback' | 'generator' | 'diagnostics';

export type HeaderItem = {
  key: string;
  value: string;
};

export type ConversationType = 'gemini' | 'acp' | 'codex' | 'openclaw-gateway' | 'nanobot';

export type CliOption = {
  value: string;
  label: string;
  conversationType: ConversationType;
  backend?: AcpBackend;
  cliPath?: string;
  customAgentId?: string;
};

export type ProviderModelOption = {
  value: string;
  label: string;
  provider: IProvider;
  modelId: string;
};

export type CliModelOption = {
  value: string;
  label: string;
};
