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
 * Layout: the body is a stack of collapsible/resizable sections (VS Code SCM
 * sidebar). Repositories and Changes are the two sections today; a future graph
 * section drops in as a third with no framework change (see `ScmSectionStack`).
 */

import { Button, Tooltip } from '@arco-design/web-react';
import {
  BranchTwo,
  FolderCode,
  FolderCodeOne,
  Plus,
  Refresh,
  RightBranchOne,
  TreeList,
  Undo,
  ViewList,
} from '@icon-park/react';
import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreviewContext } from '../Preview';
import { discardAllTargets, ScmChangesView, stageAllTargets } from './ScmChangesView';
import { ScmSection, ScmSectionDivider } from './ScmSection';
import {
  diffAnchors,
  resourceKey,
  resourceName,
  type ScmActionKind,
  type ScmRepository,
  type ScmResource,
} from './scmModel';
import { groupRepositories, type ScmRepoGroup } from './scmRepoTree';
import { fetchScmDiff, openScmProject, refreshAllRepos, setSelectedRepo, useScm } from './scmStore';
import { initScmRuntime } from './scmTransport';
import {
  clearSectionHeight,
  openScmUi,
  setRepoWorktreesCollapsed,
  setScmViewMode,
  setSectionCollapsed,
  setSectionHeight,
  useScmUi,
  type ScmViewMode,
} from './scmUiStore';
import { type ScmActionReport, useScmActions } from './useScmActions';

/** Section ids — the persistence keys and the extensible section registry. */
const SECTION_REPOSITORIES = 'repositories';
const SECTION_CHANGES = 'changes';

/** Height of a section header row, in px (mirror of ScmSection's `h-24px`). Used to
 *  bound section body heights so at least one header row always stays on screen. */
const SECTION_HEADER_PX = 24;
/** Minimum body height a sized (bottom-anchored) section keeps when dragged small. */
const SECTION_MIN_BODY_PX = 40;
/** Default body height for a sized section when nothing is stored: a fraction of the
 *  panel height (the Changes section should open roomy, ~60%). */
const SECTION_DEFAULT_FRACTION = 0.6;

export type ScmPanelProps = {
  /** Owning project id — scopes the store's repositories + statuses. */
  projectId: string;
};

export const ScmPanel: React.FC<ScmPanelProps> = ({ projectId }) => {
  const { t } = useTranslation();
  const view = useScm();
  const ui = useScmUi();
  const actions = useScmActions();

  // Wire the WS runtime (idempotent) and declare the project. Deliberately no
  // cleanup: unmount here means "tab switched", not "project closed". The UI store
  // is opened alongside so collapse/height/view-mode restore for this project.
  useEffect(() => {
    initScmRuntime();
    void openScmProject(projectId);
    openScmUi(projectId);
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
      {/* Action-report banner. Refresh and the bulk/view controls now live on the
          Changes section header (VS Code parity — actions sit on the section they
          act on), so this row exists only to surface an action report and collapses
          away entirely when there is none, leaving no empty toolbar strip on top.
          The report's secondary parts (a failed-file detail line, a retry button)
          are rare and wide, so they drop to their own full-width row underneath via
          `ActionReportExtras`; the common success case stays a single line. */}
      {actions.report && (
        <div className='flex-shrink-0 flex items-center gap-8px px-8px py-2px min-h-28px'>
          <ActionReportSummary report={actions.report} onDismiss={actions.clearReport} />
        </div>
      )}
      {actions.report && <ActionReportExtras report={actions.report} busy={actions.busy} onRetry={actions.retry} />}
      <ScmSectionStack
        view={view}
        ui={ui}
        selectedRepo={selectedRepo}
        multiRepo={multiRepo}
        onRepoSelect={setSelectedRepo}
        onAction={actions.run}
        busy={actions.busy}
        failedRowKeys={actions.report?.failedRowKeys ?? []}
      />
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
 * The section stack: the collapsible/resizable body of the panel below the header
 * bar. Renders the Repositories section (multi-repo only) and the Changes section,
 * with a drag divider between them. The Changes section always flexes to fill and
 * its header is `flex-shrink-0`, so it can never lose its header no matter how many
 * repos the list holds — the hard layout requirement.
 *
 * Extensible by construction: a future graph section is one more `ScmSection` +
 * divider in this stack; collapse/height persistence is already id-keyed in the UI
 * store, so no mechanism here is hard-wired to exactly two sections.
 */
const ScmSectionStack: React.FC<{
  view: ReturnType<typeof useScm>;
  ui: ReturnType<typeof useScmUi>;
  selectedRepo: ScmRepository;
  multiRepo: boolean;
  onRepoSelect: (repoId: string) => void;
  onAction: (action: ScmActionKind, repoId: string, resources: ScmResource[]) => void;
  busy: boolean;
  failedRowKeys: string[];
}> = ({ view, ui, selectedRepo, multiRepo, onRepoSelect, onAction, busy, failedRowKeys }) => {
  const { t } = useTranslation();
  const reposCollapsed = ui.collapsed[SECTION_REPOSITORIES] === true;
  const changesCollapsed = ui.collapsed[SECTION_CHANGES] === true;

  // Measure the stack's own pixel height so a sized section can default to a fraction
  // of it and so drags can be clamped to "leave at least the other headers on screen".
  const stackRef = React.useRef<HTMLDivElement>(null);
  const [stackPx, setStackPx] = React.useState<number>(0);
  React.useLayoutEffect(() => {
    const el = stackRef.current;
    if (!el) return;
    setStackPx(el.clientHeight);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setStackPx(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Bottom-anchored stack model. Screen order is fixed (repositories on top, changes
  // below, a future graph further below). The FIRST open section is the "filler": it
  // flexes to take whatever space the sized sections below leave. Every other open
  // section keeps its own persisted body height and anchors from the bottom up. This
  // is what lets the Changes header be dragged all the way to full height (repositories
  // shrinks to just its header) or down to just its own header (repositories fills).
  const repoOpen = multiRepo && !reposCollapsed;
  // With only two sections today, the filler is repositories when it is open, else the
  // changes section fills. Generalizes to "first open section fills" when graph lands.
  const changesIsFiller = !repoOpen;

  // Body height a bottom-anchored (non-filler) section uses. Absent stored value ⇒ a
  // fraction of the panel. Always clamped so the filler above keeps at least its header
  // visible (min body) and so the sized body itself never collapses below a usable min.
  const sizedBodyHeight = (id: string): number => {
    const stored = ui.heights[id];
    const fallback = stackPx > 0 ? Math.round(stackPx * SECTION_DEFAULT_FRACTION) : 240;
    const desired = stored ?? fallback;
    // Reserve room above for the filler's header (and its own header is outside the body).
    const upperReserve = SECTION_HEADER_PX + SECTION_MIN_BODY_PX;
    const maxBody = stackPx > 0 ? Math.max(SECTION_MIN_BODY_PX, stackPx - upperReserve) : desired;
    return Math.max(SECTION_MIN_BODY_PX, Math.min(desired, maxBody));
  };

  // Dragging the divider above the Changes section: up (negative cumulative delta)
  // grows the Changes body, down shrinks it; the filler (repositories) absorbs the
  // inverse. `totalDeltaY` is measured from the drag start, so the base height is
  // captured once when the drag begins — reading `ui.heights` on every move would
  // hit the stale closure captured at pointerdown and drop all but the last step.
  const changesDragBase = React.useRef<number | null>(null);
  const onChangesDividerDrag = (totalDeltaY: number): void => {
    changesDragBase.current ??= ui.heights[SECTION_CHANGES] ?? sizedBodyHeight(SECTION_CHANGES);
    setSectionHeight(SECTION_CHANGES, changesDragBase.current - totalDeltaY);
  };
  const onChangesDividerDragEnd = (): void => {
    changesDragBase.current = null;
  };

  const viewMode: ScmViewMode = ui.viewMode;
  const changesStatus = view.statuses[selectedRepo.repo_id];
  const stageTargets = stageAllTargets(changesStatus, selectedRepo.capabilities.staging);
  const discardTargets = discardAllTargets(changesStatus, selectedRepo.capabilities.staging);

  const changesActions = (
    <ChangesHeaderActions
      mode={viewMode}
      onChangeMode={setScmViewMode}
      stageTargets={stageTargets}
      discardTargets={discardTargets}
      busy={busy}
      onStageAll={() => onAction('stage', selectedRepo.repo_id, stageTargets)}
      onDiscardAll={() => onAction('discard', selectedRepo.repo_id, discardTargets)}
    />
  );

  const changesBody = (
    <div className='flex-1 min-h-0 overflow-auto ps-4px pe-4px pb-8px'>
      <ScmChangesView
        repo={selectedRepo}
        status={view.statuses[selectedRepo.repo_id]}
        selectedKey={view.selectedResource}
        onAction={onAction}
        busy={busy}
        failedRowKeys={failedRowKeys}
        viewMode={viewMode}
        treeExpanded={ui.treeExpanded}
      />
    </div>
  );

  return (
    <div data-scm-section-stack ref={stackRef} className='flex-1 min-h-0 flex flex-col'>
      {multiRepo && (
        <div
          data-scm-section-slot={SECTION_REPOSITORIES}
          // Repositories is the filler when open (flex-1); when collapsed it is just
          // its header (flex-shrink-0). It never carries a stored height — it always
          // takes the space the sized sections below leave.
          className={repoOpen ? 'flex-1 min-h-0 flex flex-col' : 'flex-shrink-0 flex flex-col'}
        >
          <ScmSection
            id={SECTION_REPOSITORIES}
            title={t('conversation.explorer.scm.sections.repositories')}
            collapsed={reposCollapsed}
            onToggleCollapsed={() => setSectionCollapsed(SECTION_REPOSITORIES, !reposCollapsed)}
          >
            <div className='flex-1 min-h-0 overflow-auto'>
              <RepoList
                repositories={view.repositories}
                selectedRepoId={selectedRepo.repo_id}
                onSelect={onRepoSelect}
                collapsedParents={ui.repoCollapsed}
                onToggleParent={setRepoWorktreesCollapsed}
              />
            </div>
          </ScmSection>
        </div>
      )}
      {/* Divider above Changes: only meaningful when the section above it (repositories)
          is open and Changes is sized (not itself the filler / not collapsed). */}
      {repoOpen && !changesCollapsed && (
        <ScmSectionDivider
          onDrag={onChangesDividerDrag}
          onDragEnd={onChangesDividerDragEnd}
          onDoubleReset={() => clearSectionHeight(SECTION_CHANGES)}
        />
      )}
      <div
        data-scm-section-slot={SECTION_CHANGES}
        // Changes fills only when it is the first open section (repositories collapsed
        // or single-repo); otherwise it is bottom-anchored at its stored/derived height.
        // Collapsed ⇒ just its header.
        className={
          changesIsFiller && !changesCollapsed ? 'flex-1 min-h-0 flex flex-col' : 'flex-shrink-0 flex flex-col'
        }
        style={
          changesIsFiller || changesCollapsed
            ? undefined
            : { height: SECTION_HEADER_PX + sizedBodyHeight(SECTION_CHANGES) }
        }
      >
        <ScmSection
          id={SECTION_CHANGES}
          title={t('conversation.explorer.scm.sections.changes')}
          collapsed={changesCollapsed}
          onToggleCollapsed={() => setSectionCollapsed(SECTION_CHANGES, !changesCollapsed)}
          actions={changesActions}
        >
          {changesBody}
        </ScmSection>
      </div>
    </div>
  );
};

/**
 * The Changes section header's action cluster (VS Code parity — the actions sit on
 * the section they act on, not on a separate top toolbar): stage-all, refresh, and
 * the view-as-tree/list toggle, in that right-to-left importance order. Stage-all
 * only appears when there is something to stage; refresh acts on every repo.
 * `stopPropagation` keeps a click on any action from also toggling the section's
 * collapse (the header row owns that click otherwise).
 */
const ChangesHeaderActions: React.FC<{
  mode: ScmViewMode;
  onChangeMode: (mode: ScmViewMode) => void;
  stageTargets: ScmResource[];
  discardTargets: ScmResource[];
  busy: boolean;
  onStageAll: () => void;
  onDiscardAll: () => void;
}> = ({ mode, onChangeMode, stageTargets, discardTargets, busy, onStageAll, onDiscardAll }) => {
  const { t } = useTranslation();
  return (
    <>
      {discardTargets.length > 0 && (
        <Tooltip content={t('conversation.explorer.scm.actions.discard')} mini>
          <Button
            type='text'
            size='mini'
            disabled={busy}
            data-scm-header-discard-all
            className='flex-shrink-0'
            icon={<Undo theme='outline' size='14' />}
            aria-label={t('conversation.explorer.scm.actions.discard')}
            onClick={onDiscardAll}
          />
        </Tooltip>
      )}
      {stageTargets.length > 0 && (
        <Tooltip content={t('conversation.explorer.scm.actions.stageAll')} mini>
          <Button
            type='text'
            size='mini'
            disabled={busy}
            data-scm-header-stage-all
            className='flex-shrink-0'
            icon={<Plus theme='outline' size='14' />}
            aria-label={t('conversation.explorer.scm.actions.stageAll')}
            onClick={onStageAll}
          />
        </Tooltip>
      )}
      <Tooltip content={t('conversation.explorer.scm.refresh')} mini>
        <Button
          type='text'
          size='mini'
          data-scm-header-refresh
          className='flex-shrink-0'
          icon={<Refresh theme='outline' size='14' />}
          aria-label={t('conversation.explorer.scm.refresh')}
          onClick={() => void refreshAllRepos()}
        />
      </Tooltip>
      <ViewModeToggle mode={mode} onChange={onChangeMode} />
    </>
  );
};

/**
 * The Changes section header's view-as-tree / view-as-list toggle (VS Code parity).
 * A single button that flips to the other mode; the icon shows the mode it switches
 * TO, matching VS Code's toolbar affordance.
 */
const ViewModeToggle: React.FC<{ mode: ScmViewMode; onChange: (mode: ScmViewMode) => void }> = ({ mode, onChange }) => {
  const { t } = useTranslation();
  const next: ScmViewMode = mode === 'tree' ? 'list' : 'tree';
  const label = t(next === 'tree' ? 'conversation.explorer.scm.viewAsTree' : 'conversation.explorer.scm.viewAsList');
  return (
    <Tooltip content={label} mini>
      <Button
        type='text'
        size='mini'
        data-scm-view-toggle={mode}
        className='flex-shrink-0'
        icon={next === 'tree' ? <TreeList theme='outline' size='14' /> : <ViewList theme='outline' size='14' />}
        aria-label={label}
        onClick={() => onChange(next)}
      />
    </Tooltip>
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

/** Left indent (px) applied to a nested worktree row so it reads as a child of its
 *  primary, matching the tree view's step. */
const REPO_WORKTREE_INDENT = 16;

/**
 * One repository row. Shared by primaries, nested worktree children, and orphan
 * worktrees so selection/branch rendering stays identical across all three — the
 * task's invariant that grouping only changes layering, never per-repo semantics.
 *
 * `leading` is the row's left affordance: a primary with worktrees passes its
 * expand/collapse chevron, a worktree passes its glyph, an ordinary repo passes
 * nothing. Clicking the row always selects `repo.repo_id`; the chevron handles its
 * own toggle and stops propagation so expanding never also re-selects.
 */
const RepoRow: React.FC<{
  repo: ScmRepository;
  isSelected: boolean;
  onSelect: (repoId: string) => void;
  indent?: number;
  leading?: React.ReactNode;
}> = ({ repo, isSelected, onSelect, indent = 0, leading }) => (
  <div
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
    style={indent ? { paddingInlineStart: 8 + indent } : undefined}
  >
    {leading}
    <span className='flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-13px text-t-primary'>
      {repo.pe_name || repo.label}
    </span>
    {/* Branch info is pinned to the right of the row (`ms-auto`), the branch
        name preceded by a branch glyph. `flex-1` on the repo name above
        claims the slack so the two never touch; both truncate under pressure.
        Rendered only when a head name is known — a detached/unknown head
        shows nothing rather than a lone icon. */}
    {repo.head?.name && (
      <span className='ms-auto flex items-center gap-2px min-w-0 flex-shrink text-t-tertiary text-12px'>
        <BranchTwo theme='outline' size='12' className='flex-shrink-0' />
        <span className='overflow-hidden text-ellipsis whitespace-nowrap'>{repo.head.name}</span>
      </span>
    )}
  </div>
);

/** The worktree glyph shown at the left of a worktree row (nested child or orphan). */
const WorktreeGlyph: React.FC<{ label: string }> = ({ label }) => (
  <Tooltip content={label} mini>
    <span className='flex-shrink-0 flex items-center' aria-label={label}>
      <RightBranchOne theme='outline' size='12' className='text-t-tertiary' />
    </span>
  </Tooltip>
);

/**
 * Repository switcher, shown only for a multi-repo project. Rows come from
 * `groupRepositories`, which folds linked worktrees under the primary they name
 * (VS Code REPOSITORIES parity); a worktree whose primary is out of view is shown
 * flat with a worktree glyph. A primary that has worktrees gets an expand/collapse
 * chevron whose state persists per project. The name uses `||`, not `??`: the
 * backend promises never to emit `Some("")`, but an empty string must still fall
 * back to `label` rather than smear into a blank repo name. Clicking any row changes
 * which repo fills the body — pure front-end, no `scm/*` request (every repo is
 * already subscribed; see `setSelectedRepo`).
 */
const RepoList: React.FC<{
  repositories: ScmRepository[];
  selectedRepoId: string;
  onSelect: (repoId: string) => void;
  /** Primary repo ids whose worktree children are currently collapsed. */
  collapsedParents: string[];
  onToggleParent: (repoId: string, collapsed: boolean) => void;
}> = ({ repositories, selectedRepoId, onSelect, collapsedParents, onToggleParent }) => {
  const { t } = useTranslation();
  const groups = useMemo(() => groupRepositories(repositories), [repositories]);
  const collapsed = useMemo(() => new Set(collapsedParents), [collapsedParents]);
  const labels = {
    worktree: t('conversation.explorer.scm.worktree'),
    expand: t('conversation.explorer.scm.expandWorktrees'),
    collapse: t('conversation.explorer.scm.collapseWorktrees'),
  };

  return (
    <div
      data-scm-repo-list
      // No own scroll/max-height: the enclosing section body owns scrolling and the
      // height cap, and measures this list's natural height. A second scroll box here
      // would clip that measurement and reintroduce blank space.
      className='flex flex-col gap-1px px-4px py-4px border-b border-[var(--bg-3)]'
    >
      {groups.map((group) => (
        <RepoGroupRows
          key={group.repo.repo_id}
          group={group}
          selectedRepoId={selectedRepoId}
          onSelect={onSelect}
          isCollapsed={collapsed.has(group.repo.repo_id)}
          onToggleParent={onToggleParent}
          labels={labels}
        />
      ))}
    </div>
  );
};

/** Renders one grouped entry: an orphan worktree row, or a primary row followed by
 *  its (optionally collapsed) worktree children. */
const RepoGroupRows: React.FC<{
  group: ScmRepoGroup;
  selectedRepoId: string;
  onSelect: (repoId: string) => void;
  isCollapsed: boolean;
  onToggleParent: (repoId: string, collapsed: boolean) => void;
  labels: { worktree: string; expand: string; collapse: string };
}> = ({ group, selectedRepoId, onSelect, isCollapsed, onToggleParent, labels }) => {
  if (group.kind === 'orphanWorktree') {
    return (
      <RepoRow
        repo={group.repo}
        isSelected={group.repo.repo_id === selectedRepoId}
        onSelect={onSelect}
        leading={<WorktreeGlyph label={labels.worktree} />}
      />
    );
  }

  const hasWorktrees = group.worktrees.length > 0;
  // Collapsed (or non-expandable) shows the closed repo glyph; expanded shows the open
  // one. A repo with worktrees toggles between the two on click.
  const RepoIcon = isCollapsed ? FolderCode : FolderCodeOne;
  return (
    <>
      <RepoRow
        repo={group.repo}
        isSelected={group.repo.repo_id === selectedRepoId}
        onSelect={onSelect}
        leading={
          hasWorktrees ? (
            <button
              type='button'
              data-scm-repo-toggle={group.repo.repo_id}
              aria-expanded={!isCollapsed}
              aria-label={isCollapsed ? labels.expand : labels.collapse}
              onClick={(e) => {
                e.stopPropagation();
                onToggleParent(group.repo.repo_id, !isCollapsed);
              }}
              className='flex-shrink-0 flex items-center justify-center w-14px h-14px text-t-tertiary hover:text-t-primary bg-transparent border-none p-0 cursor-pointer'
            >
              <RepoIcon theme='outline' size='12' />
            </button>
          ) : (
            // A non-expandable repo (no worktrees) still occupies the same 14px leading
            // slot the toggle would, so its name aligns with expandable rows instead of
            // shifting a glyph-width to the left.
            <span
              data-scm-repo-glyph={group.repo.repo_id}
              className='flex-shrink-0 flex items-center justify-center w-14px h-14px text-t-tertiary'
            >
              <FolderCode theme='outline' size='12' />
            </span>
          )
        }
      />
      {hasWorktrees &&
        !isCollapsed &&
        group.worktrees.map((wt) => (
          <RepoRow
            key={wt.repo_id}
            repo={wt}
            isSelected={wt.repo_id === selectedRepoId}
            onSelect={onSelect}
            indent={REPO_WORKTREE_INDENT}
            leading={<WorktreeGlyph label={labels.worktree} />}
          />
        ))}
    </>
  );
};

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

const PanelNotice: React.FC<{ text: string }> = ({ text }) => (
  <div className='h-full flex items-center justify-center px-16px text-center text-t-secondary text-13px'>{text}</div>
);
