/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Action orchestration for the Changes panel: confirmation, dispatch, and — the
 * part that actually matters — turning an outcome into a message that is true.
 *
 * Three rules from `formal/runtime/source-control.md` + protocol.md drive this:
 *
 *  1. **Partial success must not be reported as failure.** A non-empty `failed[]`
 *     means the files *not* listed were really changed (a tracked edit is already
 *     overwritten; an untracked file is already in the trash, and on macOS the
 *     trash offers no programmatic restore). Saying "the operation failed" would
 *     invite a retry that re-applies the action to files already done.
 *  2. **Only `-32051` may offer a retry.** `-32053 resource_blocked` stays blocked
 *     until the user resolves the conflict elsewhere, and `-32052` is a static
 *     property of the provider — a retry button on either is a lie.
 *  3. **Never optimistically update.** The backend recomputes and pushes a fresh
 *     `scm/statusChanged` after every action; that frame is the only truth. The
 *     outcome returned here exists solely to phrase the message.
 */

import { Modal } from '@arco-design/web-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { actionableResources, type ScmActionKind, type ScmResource, splitDiscardRisk } from './scmModel';
import {
  beginScmAction,
  clearScmActionReport,
  finishScmAction,
  getLastScmAction,
  runScmAction,
  SCM_ERR_CAPABILITY_UNSUPPORTED,
  SCM_ERR_RESOURCE_BLOCKED,
  type ScmActionOutcome,
  type ScmActionReport,
  useScm,
} from './scmStore';

/**
 * Re-exported from the store, which now owns this shape: the report must survive the
 * panel unmounting (tab switch), so it cannot live in component state.
 */
export type { ScmActionReport };

/** Interpolation-free i18n suffix for a successful action. */
const OK_KEY: Record<ScmActionKind, 'okStage' | 'okUnstage' | 'okDiscard'> = {
  stage: 'okStage',
  unstage: 'okUnstage',
  discard: 'okDiscard',
};

export type UseScmActionsResult = {
  /** Run an action on a selection, confirming first when it is a discard. */
  run: (action: ScmActionKind, repoId: string, resources: ScmResource[]) => void;
  /** True while a request is in flight (the UI disables action buttons). */
  busy: boolean;
  /** Result of the most recent action, or null. */
  report: ScmActionReport | null;
  /** Dismiss the current report. */
  clearReport: () => void;
  /** Re-run the last action — only ever offered when `report.retryable`. */
  retry: () => void;
};

export const useScmActions = (): UseScmActionsResult => {
  const { t } = useTranslation();
  // Read from the store, not component state: the panel unmounts on every switch to
  // the Files tab, and a `partial` report is the only record of which files did not
  // succeed. See `ScmView.actionReport`.
  const { actionBusy: busy, actionReport: report } = useScm();

  const describe = useCallback(
    (outcome: ScmActionOutcome): ScmActionReport => {
      if (outcome.kind === 'ok') {
        return {
          tone: 'success',
          message: t(`conversation.explorer.scm.actions.${OK_KEY[outcome.action]}`, { count: outcome.total }),
          failedRowKeys: [],
          retryable: false,
        };
      }
      if (outcome.kind === 'partial') {
        const failedCount = outcome.failed.length;
        const paths = outcome.failed.map((f) => f.file.relative_path).join(', ');
        // The engine's own wording, shown as-is: it is a raw platform error text
        // whose content varies, so it is never parsed — only appended as detail
        // behind a localized lead-in.
        const detail = t('conversation.explorer.scm.actions.partialDetail', { files: paths });

        // Everything failed → this is not "partial", and warning is too light a
        // tone for it. Reported as an error with its own wording.
        if (failedCount >= outcome.total) {
          return {
            tone: 'error',
            message: t('conversation.explorer.scm.actions.allFailed', { count: outcome.total }),
            detail,
            failedRowKeys: outcome.failedRowKeys,
            // Not retryable from here: `failed[]` is per-file IO, so a blind retry
            // would re-attempt files whose failure has a persistent cause.
            retryable: false,
          };
        }

        // WARNING, not error: most files went through. The counts are explicit so
        // the user knows the action partly happened and does not blind-retry.
        //
        // `Math.max(0, …)` because `failed[]` is not guaranteed to be a subset of
        // what we sent — a backend that reports more failures than requested files
        // would otherwise render "completed -1/1", which reads as a UI bug and
        // destroys trust in the whole message.
        return {
          tone: 'warning',
          message: t('conversation.explorer.scm.actions.partial', {
            succeeded: Math.max(0, outcome.total - failedCount),
            total: outcome.total,
            failed: failedCount,
          }),
          detail,
          failedRowKeys: outcome.failedRowKeys,
          retryable: false,
        };
      }

      // ⚠️ Outcome genuinely unknown: the transport failed, so the action may or may
      // not have run. Never say "nothing happened" here — that is the front end
      // asserting what it cannot know, and for a discard it costs the user a second
      // irreversible destruction when they redo it.
      if (outcome.kind === 'unknown') {
        return outcome.reason === 'not-sent'
          ? {
              // The frame never left the client, so nothing ran. "Retry" is honest.
              tone: 'error',
              message: t('conversation.explorer.scm.actions.notSent'),
              failedRowKeys: [],
              retryable: true,
            }
          : {
              // The request went out; the answer did not come back. Ask the user to
              // re-check the result — do NOT invite a redo.
              tone: 'warning',
              message: t('conversation.explorer.scm.actions.outcomeUnknown'),
              failedRowKeys: [],
              retryable: false,
            };
      }
      // Rejected: nothing happened at all. Which message depends on WHY, because
      // only one of the three can be resolved by trying again.
      const message =
        outcome.code === SCM_ERR_RESOURCE_BLOCKED
          ? t('conversation.explorer.scm.actions.rejectedBlocked')
          : outcome.code === SCM_ERR_CAPABILITY_UNSUPPORTED
            ? t('conversation.explorer.scm.actions.rejectedUnsupported')
            : t('conversation.explorer.scm.actions.rejectedFailed');
      return { tone: 'error', message, failedRowKeys: [], retryable: outcome.retryable };
    },
    [t]
  );

  const dispatch = useCallback(
    async (action: ScmActionKind, repoId: string, resources: ScmResource[]): Promise<void> => {
      beginScmAction(action, repoId, resources);
      let outcomeReport: ScmActionReport | null = null;
      try {
        outcomeReport = describe(await runScmAction(action, repoId, resources));
      } finally {
        // Always published, even if `describe` throws: leaving `busy` stuck true
        // would disable every action button with no way back.
        finishScmAction(outcomeReport);
      }
    },
    [describe]
  );

  const run = useCallback(
    (action: ScmActionKind, repoId: string, resources: ScmResource[]): void => {
      // Drop rows the backend would refuse. Sending one conflicted file makes it
      // reject the WHOLE batch (-32053), turning "stage these five" into "nothing
      // happened" — so they are filtered out here rather than surfaced as an error.
      const targets = actionableResources(resources);
      if (targets.length === 0) return;

      if (action !== 'discard') {
        void dispatch(action, repoId, targets);
        return;
      }

      // Discard is the only irreversible action, and its two halves are
      // irreversible in different ways — so the confirmation says which applies.
      const { tracked, untracked } = splitDiscardRisk(targets);
      const content =
        tracked.length > 0 && untracked.length > 0
          ? t('conversation.explorer.scm.actions.confirmDiscardMixed', {
              tracked: tracked.length,
              untracked: untracked.length,
            })
          : untracked.length > 0
            ? t('conversation.explorer.scm.actions.confirmDiscardUntracked', { count: untracked.length })
            : t('conversation.explorer.scm.actions.confirmDiscardTracked', { count: tracked.length });

      Modal.confirm({
        title: t('conversation.explorer.scm.actions.confirmDiscardTitle'),
        content,
        okText: t('conversation.explorer.scm.actions.discardConfirmButton'),
        cancelText: t('common.cancel'),
        onOk: () => dispatch(action, repoId, targets),
      });
    },
    [dispatch, t]
  );

  /**
   * Re-run the last action. Goes through `run`, **not** `dispatch` — retrying a
   * discard must ask again.
   *
   * Calling `dispatch` directly (as this used to) skipped the confirmation: the
   * user confirmed once, then a retry fired a second irreversible discard with no
   * prompt. Routing through `run` reuses the exact same gate, so the confirmation
   * count always matches the number of destructive requests actually sent.
   */
  const retry = useCallback((): void => {
    const last = getLastScmAction();
    if (!last) return;
    run(last.action, last.repoId, last.resources);
  }, [run]);

  const clearReport = useCallback((): void => clearScmActionReport(), []);

  return { run, busy, report, clearReport, retry };
};
