/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Singleton ConversationServiceImpl wired with a SqliteConversationRepository.
 * Extracted to a separate module to avoid circular dependencies.
 */

import { SqliteConversationRepository } from '@process/services/database/SqliteConversationRepository';
import { ConversationServiceImpl } from './ConversationServiceImpl';
import type { IConversationService } from './IConversationService';

export const conversationServiceSingleton: IConversationService = new ConversationServiceImpl(
  new SqliteConversationRepository()
);
