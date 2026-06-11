/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { abortUploads, type UploadSource } from './useUploadState';

/**
 * Aborts in-flight uploads when the active conversation changes (or when the
 * caller unmounts). Each upload is bound to its `conversationId` at start
 * time; this hook cancels everything still running for the *previous*
 * conversation as soon as the user switches contexts, plus everything in the
 * scoped `source` on unmount.
 *
 * Pass `null`/`undefined` for `conversationId` while the conversation is still
 * loading — uploads kicked off before a real id is known will be cancelled
 * once one arrives, which matches the user expectation of "leaving the
 * pre-conversation screen also stops the upload".
 *
 * @param conversationId Currently-active conversation id. Used as the
 *   "exception": uploads bound to this id are kept; everything else for the
 *   given source is aborted on change.
 * @param source         Optional source to scope to (sendbox / workspace).
 */
export function useAbortUploadsOnConversationChange(conversationId: string | undefined, source?: UploadSource): void {
  useEffect(() => {
    // On id transition, abort uploads bound to anything other than the new id.
    abortUploads({ source, exceptConversationId: conversationId ?? null });
    return () => {
      // On unmount (e.g. closing the chat panel), abort everything in this
      // source bucket — those uploads have nowhere to surface their results.
      abortUploads({ source });
    };
  }, [conversationId, source]);
}
