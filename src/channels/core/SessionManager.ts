/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { uuid } from '@/common/utils';
import { getDatabase } from '@/process/database';
import type { ChannelAgentType, IChannelSession, IChannelUser, PluginType } from '../types';

/**
 * SessionManager - Manages user sessions for the Personal Assistant
 *
 * Sessions are keyed by composite key `${userId}:${chatId}` to support
 * per-chat isolation: the same user in different group chats gets separate sessions.
 * When chatId is omitted, falls back to userId-only key for backward compatibility.
 */
export class SessionManager {
  // In-memory cache of active sessions keyed by composite key (userId:chatId)
  private activeSessions: Map<string, IChannelSession> = new Map();

  constructor() {
    this.loadActiveSessions();
  }

  /**
   * Build composite key for session lookup
   */
  private buildKey(userId: string, chatId?: string): string {
    return chatId ? `${userId}:${chatId}` : userId;
  }

  /**
   * Load active sessions from database into memory
   */
  private loadActiveSessions(): void {
    const db = getDatabase();
    const result = db.getChannelSessions();

    if (result.success && result.data) {
      for (const session of result.data) {
        const key = this.buildKey(session.userId, session.chatId);
        this.activeSessions.set(key, session);
      }
    }
  }

  /**
   * Get session for a user (optionally scoped to a specific chat)
   */
  getSession(userId: string, chatId?: string): IChannelSession | null {
    return this.activeSessions.get(this.buildKey(userId, chatId)) ?? null;
  }

  /**
   * Get session by platform user (lookup user first, then get session)
   */
  getSessionByPlatformUser(platformUserId: string, platformType: PluginType, chatId?: string): IChannelSession | null {
    const db = getDatabase();
    const userResult = db.getChannelUserByPlatform(platformUserId, platformType);

    if (!userResult.success || !userResult.data) {
      return null;
    }

    return this.getSession(userResult.data.id, chatId);
  }

  /**
   * Create a new session for a user
   * This will clear any existing session for the same user+chat combo
   */
  createSession(user: IChannelUser, agentType: ChannelAgentType = 'gemini', workspace?: string, chatId?: string): IChannelSession {
    // Generate a new conversationId
    return this.createSessionWithConversation(user, uuid(), agentType, workspace, chatId);
  }

  /**
   * Create a new session with a specific conversation ID
   */
  createSessionWithConversation(user: IChannelUser, conversationId: string, agentType: ChannelAgentType = 'gemini', workspace?: string, chatId?: string): IChannelSession {
    const db = getDatabase();
    const key = this.buildKey(user.id, chatId);

    // Clear existing session if any
    const existingSession = this.activeSessions.get(key);
    if (existingSession) {
      db.deleteChannelSession(existingSession.id);
    }

    // Create new session with the provided conversation ID
    const now = Date.now();
    const session: IChannelSession = {
      id: uuid(),
      userId: user.id,
      agentType,
      workspace,
      conversationId,
      chatId,
      createdAt: now,
      lastActivity: now,
    };

    // Save to database
    db.upsertChannelSession(session);

    // Update in-memory cache
    this.activeSessions.set(key, session);

    // Update user's session reference
    db.getChannelUserByPlatform(user.platformUserId, user.platformType);

    return session;
  }

  /**
   * Update session's conversation ID (after creating a conversation)
   */
  updateSessionConversation(sessionId: string, conversationId: string): boolean {
    const db = getDatabase();

    // Find session by ID and its key
    let foundKey: string | null = null;
    let foundSession: IChannelSession | null = null;
    for (const [key, s] of this.activeSessions.entries()) {
      if (s.id === sessionId) {
        foundKey = key;
        foundSession = s;
        break;
      }
    }

    if (!foundSession || !foundKey) {
      console.warn(`[SessionManager] Session ${sessionId} not found`);
      return false;
    }

    // Create updated session (immutable)
    const updated: IChannelSession = {
      ...foundSession,
      conversationId,
      lastActivity: Date.now(),
    };

    // Save to database and update cache
    db.upsertChannelSession(updated);
    this.activeSessions.set(foundKey, updated);

    return true;
  }

  /**
   * Update session's last activity timestamp
   */
  updateSessionActivity(userId: string, chatId?: string): void {
    const key = this.buildKey(userId, chatId);
    const session = this.activeSessions.get(key);
    if (!session) return;

    // Create updated session (immutable)
    const updated: IChannelSession = { ...session, lastActivity: Date.now() };
    this.activeSessions.set(key, updated);

    const db = getDatabase();
    db.upsertChannelSession(updated);
  }

  /**
   * Clear session for a user (e.g., when user clicks "New Session")
   */
  clearSession(userId: string, chatId?: string): boolean {
    const key = this.buildKey(userId, chatId);
    const session = this.activeSessions.get(key);
    if (!session) {
      return false;
    }

    const db = getDatabase();
    db.deleteChannelSession(session.id);
    this.activeSessions.delete(key);

    return true;
  }

  /**
   * Clear all sessions from both in-memory cache and database.
   * Used when channel settings change to force session re-evaluation on next message.
   */
  clearAllSessions(): number {
    const db = getDatabase();
    let cleared = 0;
    for (const [key, session] of this.activeSessions.entries()) {
      db.deleteChannelSession(session.id);
      this.activeSessions.delete(key);
      cleared++;
    }
    return cleared;
  }

  /**
   * Clear session by conversation ID
   * Used when a conversation is deleted from AionUI
   */
  clearSessionByConversationId(conversationId: string): IChannelSession | null {
    const db = getDatabase();

    // Find session with this conversation ID
    let foundSession: IChannelSession | null = null;
    let foundKey: string | null = null;

    for (const [key, session] of this.activeSessions.entries()) {
      if (session.conversationId === conversationId) {
        foundSession = session;
        foundKey = key;
        break;
      }
    }

    if (!foundSession || !foundKey) {
      return null;
    }

    // Delete from database and cache
    db.deleteChannelSession(foundSession.id);
    this.activeSessions.delete(foundKey);

    return foundSession;
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): IChannelSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Cleanup stale sessions (e.g., inactive for more than 24 hours)
   */
  cleanupStaleSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const db = getDatabase();
    const now = Date.now();
    let cleaned = 0;

    for (const [key, session] of this.activeSessions.entries()) {
      if (now - session.lastActivity > maxAgeMs) {
        db.deleteChannelSession(session.id);
        this.activeSessions.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[SessionManager] Cleaned up ${cleaned} stale session(s)`);
    }

    return cleaned;
  }
}
