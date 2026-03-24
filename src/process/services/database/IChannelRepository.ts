/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  IChannelPluginConfig,
  IChannelPairingRequest,
  IChannelUser,
  IChannelSession,
} from '@process/channels/types';

export interface IChannelRepository {
  getChannelPlugins(): Promise<IChannelPluginConfig[]>;
  getPendingPairingRequests(): Promise<IChannelPairingRequest[]>;
  getChannelUsers(): Promise<IChannelUser[]>;
  deleteChannelUser(userId: string): Promise<void>;
  getChannelSessions(): Promise<IChannelSession[]>;
}
