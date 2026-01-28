/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode } from 'react';

export type ChannelStatus = 'active' | 'coming_soon';

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
  content: ReactNode;
}
