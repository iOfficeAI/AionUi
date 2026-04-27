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
  job_id: string;
  workspace: string;
  lastHash: string | null;
  /** One-shot callback fired on the first onFinish() call (e.g. send skill suggest request). */
  onFirstFinish?: () => Promise<void>;
}

/**
 * Singleton watcher for SKILL_SUGGEST.md changes.
 *
 * Each AgentManager calls `onFinish(conversation_id)` in its finish handler
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
  register(conversation_id: string, job_id: string, workspace: string, onFirstFinish?: () => Promise<void>): void {
    if (this.entries.has(conversation_id)) return;
    this.entries.set(conversation_id, { job_id, workspace, lastHash: null, onFirstFinish });
  }

  /**
   * Unregister a conversation (e.g. when the user saves the skill).
   */
  unregister(conversation_id: string): void {
    this.entries.delete(conversation_id);
  }

  /**
   * Check if a conversation is registered.
   */
  has(conversation_id: string): boolean {
    return this.entries.has(conversation_id);
  }

  /**
   * Update the last emitted hash (called after initial detection emits).
   */
  setLastHash(conversation_id: string, hash: string): void {
    const entry = this.entries.get(conversation_id);
    if (entry) entry.lastHash = hash;
  }

  /**
   * Get the last emitted hash for a conversation.
   */
  getLastHash(conversation_id: string): string | null {
    return this.entries.get(conversation_id)?.lastHash ?? null;
  }

  /**
   * Called by AgentManagers when a turn finishes.
   * Follows the same pattern as `checkCronWithRetry` — uses setTimeout
   * with retries to wait for file writes to flush.
   */
  onFinish(conversation_id: string): void {
    const entry = this.entries.get(conversation_id);
    if (!entry) return;

    // Fire one-shot callback on first finish (e.g. send skill suggest follow-up message)
    if (entry.onFirstFinish) {
      const cb = entry.onFirstFinish;
      entry.onFirstFinish = undefined;
      cb().catch((err) => {
        console.warn(`[SkillSuggestWatcher] onFirstFinish callback failed for ${conversation_id}:`, err);
      });
      // Skip file check on this finish — the follow-up message hasn't been processed yet.
      // The next finish (after agent writes the file) will trigger checkWithRetry.
      return;
    }

    this.checkWithRetry(conversation_id, entry, 0);
  }

  private checkWithRetry(conversation_id: string, entry: WatchEntry, attempt: number): void {
    const delays = [1000, 2000, 3000];
    const maxAttempts = delays.length;

    if (attempt >= maxAttempts) return;

    setTimeout(async () => {
      const found = await this.checkAndEmit(conversation_id, entry);
      if (!found && attempt < maxAttempts - 1) {
        this.checkWithRetry(conversation_id, entry, attempt + 1);
      }
    }, delays[attempt]);
  }

  private async checkAndEmit(conversation_id: string, entry: WatchEntry): Promise<boolean> {
    const { job_id, workspace } = entry;
    const file_path = path.join(workspace, SKILL_SUGGEST_FILENAME);

    try {
      const content = await fs.readFile(file_path, 'utf-8');
      if (!content?.trim()) return false;

      // Stop if user already saved a dedicated skill
      if (await hasCronSkillFile(job_id)) {
        this.unregister(conversation_id);
        return true;
      }

      // Skip if content hasn't changed
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      if (entry.lastHash === hash) return true; // File exists but unchanged

      // Validate
      const { validateSkillContent } = await import('./cronSkillFile');
      const validated = validateSkillContent(content);
      if (!validated) {
        console.warn(`[SkillSuggestWatcher] ${SKILL_SUGGEST_FILENAME} validation failed for job ${job_id}`);
        return true; // File exists but invalid
      }

      entry.lastHash = hash;

      // Emit to frontend
      const message: IResponseMessage = {
        type: 'skill_suggest',
        conversation_id: conversation_id,
        msg_id: uuid(),
        data: {
          cron_job_id: job_id,
          name: validated.name,
          description: validated.description,
          skillContent: content,
        },
      };

      ipcBridge.conversation.responseStream.emit(message);
      ipcBridge.conversation.responseStream.emit(message);
      ipcBridge.acpConversation.responseStream.emit(message);
      ipcBridge.openclawConversation.responseStream.emit(message);
      console.log(`[SkillSuggestWatcher] Emitted skill_suggest for job ${job_id}, conversation ${conversation_id}`);

      return true;
    } catch {
      return false; // File not found
    }
  }
}

/** Singleton instance — imported by AgentManagers and the executor. */
export const skillSuggestWatcher = new SkillSuggestWatcher();
