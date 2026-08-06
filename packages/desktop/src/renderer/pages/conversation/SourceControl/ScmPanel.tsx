/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Changes panel — the Source Control component hosted in the project panel's
 * `changes` tab (see `formal/runtime/source-control.md` §前端).
 *
 * Lifecycle, and why it is the way it is: the subscription is **project-scoped,
 * not tab-scoped**. This component may be unmounted whenever the user switches to
 * the Files tab, so it must NOT unsubscribe on unmount — doing so would drop the
 * backend watch and the warm status on every tab click, making a switch back cost
 * a full recompute. Ownership of the subscription therefore sits with the store,
 * keyed by project id: mounting calls `openScmProject` (a no-op when the project
 * is already open) and nothing here ever closes it. Release happens on project
 * switch (the store's own guard) or reconnect.
 *
 * Refresh: besides backend pushes, the panel pulls on window focus. An external
 * editor writing a working-tree file — and editing `.gitignore` itself — produces
 * no `.git` event, so the backend watch cannot observe it; only this signal can
 * (source-control.md §三信号 ③).
 *
 * Read-only this round: no stage/unstage/discard (PR-4).
 */

import { Button, Spin, Tooltip } from '@arco-design/web-react';
import { Branch, Minus, Plus, Refresh, Undo } from '@icon-park/react';
import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreviewContext } from '../Preview';
import { ScmResourceRow } from './ScmResourceRow';
import {
  actionableResources,
  diffAnchors,
  groupResources,
  resourceKey,
  resourceName,
  type ScmActionKind,
  type ScmGroupId,
  type ScmRepository,
  type ScmResource,
  type ScmStatus,
} from './scmModel';
import { fetchScmDiff, openScmProject, refreshAllRepos, selectScmResource, setSelectedRepo, useScm } from './scmStore';
import { initScmRuntime } from './scmTransport';
import { type ScmActionReport, useScmActions } from './useScmActions';

export type ScmPanelProps = {
  /** Owning project id — scopes the store's repositories + statuses. */
  projectId: string;
};

export const ScmPanel: React.FC<ScmPanelProps> = ({ projectId }) => {
  const { t } = useTranslation();
  const view = useScm();
  const actions = useScmActions();

  // Wire the WS runtime (idempotent) and declare the project. Deliberately no
  // cleanup: unmount here means "tab switched", not "project closed".
  useEffect(() => {
    initScmRuntime();
    void openScmProject(projectId);
  }, [projectId]);

  // Focus refresh — the only signal that catches an external editor's write and a
  // `.gitignore` edit.
  useEffect(() => {
    const onFocus = (): void => {
      void refreshAllRepos();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // The repo whose changes the body shows. A stale or absent `selectedRepoId`
  // (default on open, or after the selected repo was removed) resolves to the first
  // repo — so the body never renders nothing while a repo exists. Undefined only
  // when there are no repos at all, which the guards below handle first.
  const selectedRepo = useMemo(
    () => view.repositories.find((r) => r.repo_id === view.selectedRepoId) ?? view.repositories[0],
    [view.repositories, view.selectedRepoId]
  );

  // Diff selection is scoped to the shown repo: only its rows are on screen, and a
  // repo switch clears `selectedResource` (see `setSelectedRepo`), so a resolved row
  // always belongs to `selectedRepo`. A whole-frame replace that drops the row
  // resolves to null and closes the diff.
  const selected = useMemo(() => {
    if (!selectedRepo || !view.selectedResource) return null;
    const resource = view.statuses[selectedRepo.repo_id]?.resources.find(
      (r) => resourceKey(r) === view.selectedResource
    );
    return resource ? { repo: selectedRepo, resource } : null;
  }, [selectedRepo, view.statuses, view.selectedResource]);

  if (view.loadState === 'loading' && view.repositories.length === 0) {
    return <PanelNotice text={t('conversation.explorer.scm.loading')} />;
  }
  if (view.loadState === 'error') {
    return <PanelNotice text={t('conversation.explorer.scm.loadFailed')} />;
  }
  // No pe root of this project is a repository → say so, do not fabricate a repo.
  if (view.repositories.length === 0 || !selectedRepo) {
    return <PanelNotice text={t('conversation.explorer.scm.notARepository')} />;
  }

  const multiRepo = view.repositories.length > 1;

  return (
    <div data-scm-panel className='h-full flex flex-col min-h-0'>
      {/* Header bar. The action summary and the refresh button share this one row
          — the summary claims the left, the refresh stays pinned right — instead of
          the summary opening a separate banner below a near-empty toolbar. The
          report's secondary parts (a failed-file detail line, a retry button) are
          rare and can be wide, so they drop to their own full-width row underneath
          via `ActionReportExtras`; the common success case stays a single line. */}
      <div className='flex-shrink-0 flex items-center gap-8px px-8px py-2px min-h-28px'>
        {actions.report ? (
          <ActionReportSummary report={actions.report} onDismiss={actions.clearReport} />
        ) : (
          <div className='flex-1 min-w-0' />
        )}
        <Tooltip content={t('conversation.explorer.scm.refresh')} mini>
          <Button
            type='text'
            size='mini'
            className='flex-shrink-0'
            icon={<Refresh theme='outline' size='14' />}
            aria-label={t('conversation.explorer.scm.refresh')}
            onClick={() => void refreshAllRepos()}
          />
        </Tooltip>
      </div>
      {actions.report && <ActionReportExtras report={actions.report} busy={actions.busy} onRetry={actions.retry} />}
      {/* Repo switcher only for a multi-repo project (D3): a single repo goes
          straight to its changes with no list. Clicking is pure front-end. */}
      {multiRepo && (
        <RepoList repositories={view.repositories} selectedRepoId={selectedRepo.repo_id} onSelect={setSelectedRepo} />
      )}
      <div className='flex-1 min-h-0 overflow-auto pl-4px pr-4px pb-8px'>
        <RepoSection
          repo={selectedRepo}
          status={view.statuses[selectedRepo.repo_id]}
          selectedKey={view.selectedResource}
          onAction={actions.run}
          busy={actions.busy}
          failedRowKeys={actions.report?.failedRowKeys ?? []}
        />
      </div>
      {/* Selecting a change opens its diff in the shared preview panel (a `'diff'`
          tab, reusing the same `openPreview` mechanism the file tree uses) rather
          than a fixed pane docked below this panel. Rendered as a hookless bridge
          so the fetch/open effect only exists while a row is selected and unmounts
          cleanly when it clears. */}
      {selected && (
        <ScmDiffPreviewBridge
          repoId={selected.repo.repo_id}
          staging={selected.repo.capabilities.staging}
          resource={selected.resource}
        />
      )}
    </div>
  );
};

/**
 * Bridges a selected change to the shared preview panel: on selection (or when the
 * selected row's staged/working identity changes) it fetches the unified diff and
 * hands it to `openPreview` as a `'diff'` tab, exactly the mechanism the file tree
 * uses for file previews — the diff no longer lives in a pane docked under this
 * panel. Renders nothing itself.
 *
 * A per-effect `cancelled` flag guards the async fetch: rapid row switches must not
 * let a slow earlier response open a stale tab over the newer one. Binary/empty
 * diffs carry no patch to render, so they open a short notice as plain text instead
 * of a blank diff view — the panel still "唤起" a preview for every click. Fetch
 * failures are swallowed here (the row stays selected, no tab opens); surfacing them
 * belongs to the action-report path, not this passive bridge.
 */
const ScmDiffPreviewBridge: React.FC<{
  repoId: string;
  staging: boolean;
  resource: ScmResource;
}> = ({ repoId, staging, resource }) => {
  const { t } = useTranslation();
  const { openPreview } = usePreviewContext();
  const name = resourceName(resource);
  const { pe_id: peId, relative_path: relativePath } = resource.file;
  const { from, to } = diffAnchors(resource, staging);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await fetchScmDiff({
          repository: repoId,
          file: { pe_id: peId, relative_path: relativePath },
          from,
          to,
        });
        if (cancelled) return;
        const body =
          result.binary === true
            ? t('conversation.explorer.scm.diff.binary')
            : result.patch && result.patch.length > 0
              ? result.patch
              : t('conversation.explorer.scm.diff.empty');
        openPreview(body, 'diff', { file_name: name, title: name });
      } catch {
        // Passive bridge: a failed diff fetch leaves the selection intact and opens
        // nothing. Error surfacing is the action-report path's job, not this effect's.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repoId, peId, relativePath, from, to, name, openPreview, t]);

  return null;
};

/**
 * Repository switcher, shown only for a multi-repo project. Each item is one repo:
 * its name (preferring the project-explorer `pe_name` over the bare `label`) and
 * current branch. The name uses `||`, not `??`: the backend promises never to emit
 * `Some("")`, but an empty string must still fall back to `label` rather than smear
 * into a blank repo name. Clicking changes which repo fills the body — pure
 * front-end, no `scm/*` request (every repo is already subscribed; see `setSelectedRepo`).
 */
const RepoList: React.FC<{
  repositories: ScmRepository[];
  selectedRepoId: string;
  onSelect: (repoId: string) => void;
}> = ({ repositories, selectedRepoId, onSelect }) => (
  <div
    data-scm-repo-list
    className='flex-shrink-0 flex flex-col gap-1px px-4px py-4px border-b border-[var(--bg-3)] max-h-[30vh] overflow-auto'
  >
    {repositories.map((repo) => {
      const isSelected = repo.repo_id === selectedRepoId;
      return (
        <div
          key={repo.repo_id}
          role='button'
          tabIndex={0}
          data-scm-repo-item={repo.repo_id}
          aria-current={isSelected ? 'true' : undefined}
          onClick={() => onSelect(repo.repo_id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(repo.repo_id);
            }
          }}
          className={`flex items-center gap-6px px-8px py-3px rd-4px cursor-pointer hover:bg-2 min-w-0 ${
            isSelected ? 'bg-2' : ''
          }`}
        >
          <span className='flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-13px text-t-primary'>
            {repo.pe_name || repo.label}
          </span>
          {/* Branch info is pinned to the right of the row (`ml-auto`), the branch
              name preceded by a branch glyph. `flex-1` on the repo name above
              claims the slack so the two never touch; both truncate under pressure.
              Rendered only when a head name is known — a detached/unknown head
              shows nothing rather than a lone icon. */}
          {repo.head?.name && (
            <span className='ml-auto flex items-center gap-2px min-w-0 flex-shrink text-t-tertiary text-12px'>
              <Branch theme='outline' size='12' className='flex-shrink-0' />
              <span className='overflow-hidden text-ellipsis whitespace-nowrap'>{repo.head.name}</span>
            </span>
          )}
        </div>
      );
    })}
  </div>
);

const reportToneClass = (tone: ScmActionReport['tone']): string =>
  tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-danger';

/**
 * The action outcome's one-line summary, living inline in the header row to the
 * left of the refresh button. Tone carries the distinction that matters: a
 * `warning` means the action **partly happened** (message states counts, never
 * "failed"), while `error` means nothing happened. Only the message and its
 * dismiss control belong here — the detail and retry are wide/rare and go to
 * `ActionReportExtras` so this stays one line. `data-scm-report` stays on this
 * node so existing selectors keep resolving the report by tone.
 */
const ActionReportSummary: React.FC<{
  report: ScmActionReport;
  onDismiss: () => void;
}> = ({ report, onDismiss }) => {
  const { t } = useTranslation();
  return (
    <div data-scm-report={report.tone} className='flex-1 min-w-0 flex items-center gap-4px text-12px'>
      <span className={`flex-1 min-w-0 truncate ${reportToneClass(report.tone)}`}>{report.message}</span>
      <Button type='text' size='mini' className='flex-shrink-0' aria-label={t('common.close')} onClick={onDismiss}>
        ×
      </Button>
    </div>
  );
};

/**
 * The report's secondary parts — a failed-file detail line and a retry button —
 * on their own full-width row below the header. Renders nothing when neither is
 * present (the common success case), so the summary stays a single line up top.
 * Retry appears only when trying again could actually succeed.
 */
const ActionReportExtras: React.FC<{
  report: ScmActionReport;
  /** Disables retry while another action is in flight (parity with row/bulk buttons). */
  busy: boolean;
  onRetry: () => void;
}> = ({ report, busy, onRetry }) => {
  const { t } = useTranslation();
  if (!report.detail && !report.retryable) return null;
  return (
    <div className='flex-shrink-0 flex items-start gap-4px px-8px py-4px text-12px border-b border-[var(--bg-3)]'>
      {report.detail && <div className='flex-1 min-w-0 text-t-tertiary break-all'>{report.detail}</div>}
      {report.retryable && (
        <Button type='text' size='mini' data-scm-retry disabled={busy} onClick={onRetry}>
          {t('conversation.explorer.scm.actions.retry')}
        </Button>
      )}
    </div>
  );
};

/**
 * The bulk staging action a group header offers, or null for none.
 *
 * `blocked` gets none by construction — every row in it is non-actionable. The
 * single `changes` group of a provider without a staging area gets none either:
 * there is no index to move things into.
 */
const bulkAction = (groupId: ScmGroupId): ScmActionKind | null => {
  if (groupId === 'staged') return 'unstage';
  if (groupId === 'unstaged') return 'stage';
  return null;
};

const PanelNotice: React.FC<{ text: string }> = ({ text }) => (
  <div className='h-full flex items-center justify-center px-16px text-center text-t-secondary text-13px'>{text}</div>
);

/**
 * One repo's section: warnings + grouped rows. No repo header here — repo identity
 * lives in the top `RepoList` (multi-repo) and is implicit for a single repo.
 */
const RepoSection: React.FC<{
  repo: ScmRepository;
  status: ScmStatus | undefined;
  selectedKey: string | null;
  onAction: (action: ScmActionKind, repoId: string, resources: ScmResource[]) => void;
  busy: boolean;
  failedRowKeys: string[];
}> = ({ repo, status, selectedKey, onAction, busy, failedRowKeys }) => {
  const { t } = useTranslation();
  // Grouping is a display-layer derivation from capabilities — the wire is flat
  // and never pre-grouped (source-control.md §变更清单).
  const groups = useMemo(
    () => groupResources(status?.resources ?? [], repo.capabilities.staging),
    [status?.resources, repo.capabilities.staging]
  );
  const failed = useMemo(() => new Set(failedRowKeys), [failedRowKeys]);

  return (
    <div data-scm-repo={repo.repo_id}>
      {/* Awaiting this repo's first status frame. The condition is "no status yet",
          NOT `state === 'refreshing'`: per protocol.md v10 the `refreshing` state
          only ever travels on `scm/listRepositories` / `scm/repositoriesChanged`,
          and stage 1 never pushes such a frame — so keying the spinner off it would
          leave a huge repo's slow first frame rendering nothing at all. `state` is
          still honoured (an explicitly refreshing repo shows progress even if a
          stale status is on screen), which keeps this correct if that push is ever
          added. */}
      {(!status || repo.state === 'refreshing') && (
        <div data-scm-loading className='px-8px py-4px'>
          <Spin size={14} />
        </div>
      )}
      {/* degraded is a notice, NOT an error: the list is complete, recompute is
          just persistently slower because git's index cannot be written back. */}
      {status?.degraded === true && (
        <div data-scm-degraded className='px-8px py-4px text-12px text-warning'>
          {t('conversation.explorer.scm.degraded')}
        </div>
      )}
      {status?.truncated === true && (
        <div data-scm-truncated className='px-8px py-4px text-12px text-t-tertiary'>
          {t('conversation.explorer.scm.truncated')}
        </div>
      )}
      {status && groups.length === 0 && (
        <div className='px-8px py-4px text-13px text-t-secondary'>{t('conversation.explorer.scm.noChanges')}</div>
      )}
      {groups.map((group) => {
        const bulk = bulkAction(group.id);
        // Only the rows the backend would accept — a bulk button that sends a
        // conflicted row would have the whole batch refused.
        const bulkTargets = bulk ? actionableResources(group.resources) : [];
        // Bulk discard is offered for every group EXCEPT `staged`: `scm/discard`
        // acts on the unstaged side only (protocol.md v11), so a bulk discard on the
        // staged group would destroy working-tree edits belonging to other rows.
        //
        // Excluding by GROUP ID is the right test here — deliberately not the same
        // condition the row uses. The `changes` group (a provider with no staging
        // area) is not the `staged` group, so it keeps bulk discard for free; testing
        // the rows' `staged` flag instead would take that provider's only action away.
        const discardTargets = group.id === 'staged' ? [] : actionableResources(group.resources);
        return (
          <div key={group.id} data-scm-group={group.id} className='group/scmgroup'>
            <div className='flex items-center px-8px pt-6px pb-2px text-12px text-t-tertiary uppercase'>
              <span className='flex-1 min-w-0'>{t(`conversation.explorer.scm.groups.${group.id}`)}</span>
              {/* Bulk discard for any group whose rows can be acted on — including
                  the single `changes` group of a provider without a staging area.
                  Goes through the same confirmation as a single row, which states
                  whichever consequence(s) the selection actually carries. */}
              {discardTargets.length > 0 && (
                <Button
                  type='text'
                  size='mini'
                  disabled={busy}
                  data-scm-bulk-discard
                  className='flex-shrink-0 opacity-0 group-hover/scmgroup:opacity-100 focus:opacity-100'
                  icon={<Undo theme='outline' size='13' />}
                  aria-label={t('conversation.explorer.scm.actions.discard')}
                  title={t('conversation.explorer.scm.actions.discard')}
                  onClick={() => onAction('discard', repo.repo_id, discardTargets)}
                />
              )}
              {bulk && bulkTargets.length > 0 && (
                <Button
                  type='text'
                  size='mini'
                  disabled={busy}
                  data-scm-bulk={bulk}
                  className='flex-shrink-0 opacity-0 group-hover/scmgroup:opacity-100 focus:opacity-100'
                  icon={bulk === 'stage' ? <Plus theme='outline' size='13' /> : <Minus theme='outline' size='13' />}
                  aria-label={t(
                    bulk === 'stage'
                      ? 'conversation.explorer.scm.actions.stageAll'
                      : 'conversation.explorer.scm.actions.unstageAll'
                  )}
                  title={t(
                    bulk === 'stage'
                      ? 'conversation.explorer.scm.actions.stageAll'
                      : 'conversation.explorer.scm.actions.unstageAll'
                  )}
                  onClick={() => onAction(bulk, repo.repo_id, bulkTargets)}
                />
              )}
            </div>
            {/* A group whose rows have no buttons at all reads like a bug unless the
                reason is stated. The per-row hint is `title`-only (hover), which a
                user facing an inert group will not think to try — so the blocked
                group says it inline. */}
            {group.id === 'blocked' && (
              <div data-scm-blocked-hint className='px-8px pb-2px text-12px text-t-tertiary'>
                {t('conversation.explorer.scm.actions.blockedHint')}
              </div>
            )}
            {group.resources.map((resource) => {
              const key = resourceKey(resource);
              return (
                <ScmResourceRow
                  key={key}
                  resource={resource}
                  selected={selectedKey === key}
                  onSelect={(r) => selectScmResource(resourceKey(r))}
                  staging={repo.capabilities.staging}
                  onAction={(action, r) => onAction(action, repo.repo_id, [r])}
                  busy={busy}
                  failed={failed.has(key)}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
