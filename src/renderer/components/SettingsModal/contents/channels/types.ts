/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode } from 'react';

export type ChannelStatus = 'active' | 'coming_soon';

export interface ChannelInstanceConfig {
  id: string;
  title: string;
  status: ChannelStatus;
  enabled: boolean;
  disabled?: boolean;
  isConnected?: boolean;
  botUsername?: string;
  defaultModel?: string;
  actions?: ReactNode;
  onToggleEnabled?: (enabled: boolean) => void;
  onRename?: (name: string) => Promise<boolean> | boolean;
  content: ReactNode;
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
  /** Actions rendered in channel header, before switch */
  headerActions?: ReactNode;
  /** Active instance id for multi-instance channels */
  activeInstanceId?: string;
  /** Instance tabs rendered under a channel group */
  instances?: ChannelInstanceConfig[];
  /** Fallback content for single-instance or coming-soon channels */
  content?: ReactNode;
}
