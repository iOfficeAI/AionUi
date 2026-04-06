/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CronJob } from './CronStore';

export interface ICronJobExecutor {
  /** Returns true if the conversation already has an active run in progress. */
  isConversationBusy(conversationId: string): boolean;
  /** Execute the job's payload against the target conversation.
   * @param onAcquired - Called after task acquisition succeeds, before sendMessage.
   *   Use this hook to register completion notifications while guaranteeing that
   *   busy-state has already been set (avoiding premature onceIdle fires). */
  executeJob(job: CronJob, onAcquired?: () => void, preparedConversationId?: string): Promise<string | void>;
  /** Create/resolve the conversation for a job without sending a message.
   *  Returns the conversationId that will be used for execution. */
  prepareConversation(job: CronJob): Promise<string>;
  /** Register a callback to fire once the conversation becomes idle. */
  onceIdle(conversationId: string, callback: () => Promise<void>): void;
  /** Mark the conversation as busy/not-busy. */
  setProcessing(conversationId: string, busy: boolean): void;
}
