/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Channel Module
 *
 * Provides remote interaction with AionUi through messaging platforms.
 * MVP: Telegram integration with Gemini Agent.
 */

// Export types
export * from './types';

// Core exports
export { ChannelManager, getChannelManager } from './core/ChannelManager';
export { SessionManager } from './core/SessionManager';

// Gateway exports
export { ActionExecutor } from './gateway/ActionExecutor';
export { PluginManager, registerPlugin } from './gateway/PluginManager';

// Plugin exports
export { BasePlugin } from './plugins/BasePlugin';
export type { PluginMessageHandler } from './plugins/BasePlugin';
export { TelegramPlugin } from './plugins/telegram/TelegramPlugin';

// Pairing exports
export { getPairingService, PairingService } from './pairing/PairingService';

// Action exports
export * from './actions';

// Agent exports
export { ChannelMessageService, getChannelMessageService } from './agent/ChannelMessageService';
