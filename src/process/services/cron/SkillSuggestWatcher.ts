/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { uuid } from '@/common/utils';
import { hasCronSkillFile } from './cronSkillFile';

const SKILL_SUGGEST_FILENAME = 'SKILL_SUGGEST.md';

interface WatchEntry {
  jobId: string;
  workspace: string;
  lastHash: string | null;
  /** One-shot callback fired on the first onFinish() call (e.g. send skill suggest request). */
  onFirstFinish?: () => Promise<void>;
}

/**
 * Singleton watcher for SKILL_SUGGEST.md changes.
 *
 * Each AgentManager calls `onFinish(conversationId)` in its finish handler
 * (same pattern as `hasCronCommands` / `checkCronWithRetry`).
 * The watcher checks whether the conversation is registered and, if so,
 * reads SKILL_SUGGEST.md with retry logic and emits a skill_suggest event
 * when the content changes.
 */
class SkillSuggestWatcher {
  private entries = new Map<string, WatchEntry>();

  /**
   * Register a conversation for SKILL_SUGGEST.md monitoring.
   * Called by the executor after initial detection or when retries are exhausted.
   */
  register(conversationId: string, jobId: string, workspace: string, onFirstFinish?: () => Promise<void>): void {
    if (this.entries.has(conversationId)) return;
    this.entries.set(conversationId, { jobId, workspace, lastHash: null, onFirstFinish });
  }

  /**
   * Unregister a conversation (e.g. when the user saves the skill).
   */
  unregister(conversationId: string): void {
    this.entries.delete(conversationId);
  }

  /**
   * Check if a conversation is registered.
   */
  has(conversationId: string): boolean {
    return this.entries.has(conversationId);
  }

  /**
   * Update the last emitted hash (called after initial detection emits).
   */
  setLastHash(conversationId: string, hash: string): void {
    const entry = this.entries.get(conversationId);
    if (entry) entry.lastHash = hash;
  }

  /**
   * Get the last emitted hash for a conversation.
   */
  getLastHash(conversationId: string): string | null {
    return this.entries.get(conversationId)?.lastHash ?? null;
  }

  /**
   * Called by AgentManagers when a turn finishes.
   * Follows the same pattern as `checkCronWithRetry` — uses setTimeout
   * with retries to wait for file writes to flush.
   */
  onFinish(conversationId: string): void {
    const entry = this.entries.get(conversationId);
    if (!entry) return;

    // Fire one-shot callback on first finish (e.g. send skill suggest follow-up message)
    if (entry.onFirstFinish) {
      const cb = entry.onFirstFinish;
      entry.onFirstFinish = undefined;
      cb().catch((err) => {
        console.warn(`[SkillSuggestWatcher] onFirstFinish callback failed for ${conversationId}:`, err);
      });
      // Skip file check on this finish — the follow-up message hasn't been processed yet.
      // The next finish (after agent writes the file) will trigger checkWithRetry.
      return;
    }

    this.checkWithRetry(conversationId, entry, 0);
  }

  private checkWithRetry(conversationId: string, entry: WatchEntry, attempt: number): void {
    const delays = [1000, 2000, 3000];
    const maxAttempts = delays.length;

    if (attempt >= maxAttempts) return;

    setTimeout(async () => {
      const found = await this.checkAndEmit(conversationId, entry);
      if (!found && attempt < maxAttempts - 1) {
        this.checkWithRetry(conversationId, entry, attempt + 1);
      }
    }, delays[attempt]);
  }

  private async checkAndEmit(conversationId: string, entry: WatchEntry): Promise<boolean> {
    const { jobId, workspace } = entry;
    const filePath = path.join(workspace, SKILL_SUGGEST_FILENAME);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      if (!content?.trim()) return false;

      // Stop if user already saved a dedicated skill
      if (await hasCronSkillFile(jobId)) {
        this.unregister(conversationId);
        return true;
      }

      // Skip if content hasn't changed
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      if (entry.lastHash === hash) return true; // File exists but unchanged

      // Validate
      const { validateSkillContent } = await import('./cronSkillFile');
      const validated = validateSkillContent(content);
      if (!validated) {
        console.warn(`[SkillSuggestWatcher] ${SKILL_SUGGEST_FILENAME} validation failed for job ${jobId}`);
        return true; // File exists but invalid
      }

      entry.lastHash = hash;

      // Emit to frontend
      const message: IResponseMessage = {
        type: 'skill_suggest',
        conversation_id: conversationId,
        msg_id: uuid(),
        data: {
          cronJobId: jobId,
          name: validated.name,
          description: validated.description,
          skillContent: content,
        },
      };

      ipcBridge.conversation.responseStream.emit(message);
      ipcBridge.geminiConversation.responseStream.emit(message);
      ipcBridge.acpConversation.responseStream.emit(message);
      ipcBridge.openclawConversation.responseStream.emit(message);
      console.log(`[SkillSuggestWatcher] Emitted skill_suggest for job ${jobId}, conversation ${conversationId}`);

      return true;
    } catch {
      return false; // File not found
    }
  }
}

/** Singleton instance — imported by AgentManagers and the executor. */
export const skillSuggestWatcher = new SkillSuggestWatcher();
