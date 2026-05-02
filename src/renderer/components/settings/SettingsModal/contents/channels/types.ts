/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode } from 'react';

export type ChannelStatus = 'active' | 'coming_soon';

import { ACP_BACKENDS_ALL } from '@/common/types/acpTypes';

/**
 * Check if a backend supports ACP protocol (needs working directory for cwd).
 * Uses ACP_BACKENDS_ALL as the single source of truth — new ACP backends
 * are automatically included without any code changes here.
 */
export function isAcpBackend(backend: string): boolean {
  return backend in ACP_BACKENDS_ALL;
}

export interface ChannelConfig {
  id: string;
  title: string;
  description: string;
  status: ChannelStatus;
  enabled: boolean;
  disabled?: boolean;
  isConnected?: boolean;
  botUsername?: string;
  defaultModel?: string;
  /** Icon URL for the channel (resolved for current runtime) */
  icon?: string;
  /** Whether this channel comes from an extension (shows blue 'ext' badge) */
  isExtension?: boolean;
  content: ReactNode;
}
