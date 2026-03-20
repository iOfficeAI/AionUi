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
  getChannelPlugins(): IChannelPluginConfig[];
  getPendingPairingRequests(): IChannelPairingRequest[];
  getChannelUsers(): IChannelUser[];
  deleteChannelUser(userId: string): void;
  getChannelSessions(): IChannelSession[];
}
