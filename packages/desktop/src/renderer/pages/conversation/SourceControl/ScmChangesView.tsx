/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The Changes section body: per-repo, grouped rows (staged / changes / blocked),
 * rendered either as a flat **list** (the wire order — the prior behavior) or as a
 * directory **tree** (VS Code "view as tree"). The mode is a persisted UI preference
 * read from `scmUiStore`; both modes reuse the exact same `ScmResourceRow` and the
 * same action wiring, so click-to-diff, stage/unstage/discard, bulk actions and
 * grouping never differ between views.
 *
 * The tree is display-only: it regroups a group's resources by directory (see
 * `scmTree`), but the underlying resource identity, selection key and actions are
 * unchanged. Directory rows expand/collapse with per-directory persistence; files
 * indent under their folder.
 */

import { Down, Minus, Plus, Right, Undo } from '@icon-park/react';
import { Button, Spin } from '@arco-design/web-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScmResourceRow } from './ScmResourceRow';
import {
  actionableResources,
  groupResources,
  resourceKey,
  type ScmActionKind,
  type ScmGroupId,
  type ScmRepository,
  type ScmResource,
  type ScmStatus,
} from './scmModel';
import { selectScmResource } from './scmStore';
import { allDirKeys, buildScmTree, type ScmTreeNode } from './scmTree';
import { setScmTreeExpanded, type ScmViewMode } from './scmUiStore';

/** Depth → left indent in px for tree rows (folders and files share the step). */
const INDENT_STEP = 12;

/**
 * The bulk staging action a group header offers, or null for none. `blocked` gets
 * none (every row non-actionable); the single `changes` group of a provider without
 * a staging area gets none either (no index to move into).
 */
const bulkAction = (groupId: ScmGroupId): ScmActionKind | null => {
  if (groupId === 'staged') return 'unstage';
  if (groupId === 'unstaged') return 'stage';
  return null;
};

/**
 * Whether a group's own gray title row is suppressed. The `unstaged` and staging-less
 * `changes` groups both label to "变更", which merely repeats the black section header
 * — VS Code shows no such duplicate. We hide those, hoisting their bulk stage-all into
 * the section header (see `stageAllTargets`); `staged` and `blocked` carry distinct
 * meaning and keep their labels.
 */
const isRedundantGroupTitle = (groupId: ScmGroupId): boolean => groupId === 'unstaged' || groupId === 'changes';

/** The unstaged/changes groups of a status — the ones whose title we suppress and
 *  whose bulk actions we hoist to the section header. */
const unstagedGroups = (status: ScmStatus | undefined, staging: boolean) =>
  status ? groupResources(status.resources, staging).filter((g) => g.id === 'unstaged' || g.id === 'changes') : [];

/**
 * The resources a header-level "stage all" acts on: every actionable row in the
 * unstaged/changes groups of a status. Exposed so the Changes section header can
 * offer one stage-all instead of a per-group button on the (now title-less) group.
 */
export const stageAllTargets = (status: ScmStatus | undefined, staging: boolean): ScmResource[] =>
  unstagedGroups(status, staging).flatMap((g) => actionableResources(g.resources));

/**
 * The resources a header-level "discard all" acts on: every actionable row in the
 * unstaged/changes groups. `scm/discard` only ever touches the unstaged side
 * (protocol.md v11), so `staged` is intentionally excluded — the same gate the
 * per-group discard used before its title row was removed.
 */
export const discardAllTargets = (status: ScmStatus | undefined, staging: boolean): ScmResource[] =>
  unstagedGroups(status, staging).flatMap((g) => actionableResources(g.resources));

type RowCallbacks = {
  selectedKey: string | null;
  staging: boolean;
  onRowAction: (action: ScmActionKind, resource: ScmResource) => void;
  busy: boolean;
  failed: Set<string>;
};

/** Flat list body: rows in wire order, the prior behavior. */
const ListBody: React.FC<{ resources: ScmResource[]; cb: RowCallbacks }> = ({ resources, cb }) => (
  <>
    {resources.map((resource) => {
      const key = resourceKey(resource);
      return (
        <ScmResourceRow
          key={key}
          resource={resource}
          selected={cb.selectedKey === key}
          onSelect={(r) => selectScmResource(resourceKey(r))}
          staging={cb.staging}
          onAction={cb.onRowAction}
          busy={cb.busy}
          failed={cb.failed.has(key)}
        />
      );
    })}
  </>
);

/** One tree node: a directory (expandable) or a file (a `ScmResourceRow`). */
const TreeNode: React.FC<{
  node: ScmTreeNode;
  depth: number;
  expanded: Set<string>;
  onToggleDir: (key: string) => void;
  cb: RowCallbacks;
}> = ({ node, depth, expanded, onToggleDir, cb }) => {
  if (node.kind === 'file') {
    return (
      <ScmResourceRow
        resource={node.resource}
        selected={cb.selectedKey === node.key}
        onSelect={(r) => selectScmResource(resourceKey(r))}
        staging={cb.staging}
        onAction={cb.onRowAction}
        busy={cb.busy}
        failed={cb.failed.has(node.key)}
        indent={depth * INDENT_STEP}
        hideDir
      />
    );
  }
  const isOpen = expanded.has(node.key);
  return (
    <>
      <div
        data-scm-tree-dir={node.key}
        className='flex items-center gap-4px px-8px py-3px rd-4px cursor-pointer hover:bg-2 min-w-0'
        style={{ paddingInlineStart: 8 + depth * INDENT_STEP }}
        onClick={() => onToggleDir(node.key)}
        role='button'
        aria-expanded={isOpen}
        title={node.key}
      >
        {isOpen ? <Down theme='outline' size='13' /> : <Right theme='outline' size='13' />}
        <span className='overflow-hidden text-ellipsis whitespace-nowrap text-13px text-t-primary'>{node.label}</span>
      </div>
      {isOpen &&
        node.children.map((child) => (
          <TreeNode
            key={child.key}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            onToggleDir={onToggleDir}
            cb={cb}
          />
        ))}
    </>
  );
};

/** Tree body: a group's resources regrouped by directory. */
const TreeBody: React.FC<{ resources: ScmResource[]; treeExpanded: string[]; cb: RowCallbacks }> = ({
  resources,
  treeExpanded,
  cb,
}) => {
  const nodes = useMemo(() => buildScmTree(resources), [resources]);
  // Default is fully expanded (VS Code). Once the user has toggled anything the
  // store holds a non-empty set and we honor it verbatim; before that we synthesize
  // "all dirs open" so a fresh tree is not collapsed.
  const expanded = useMemo(
    () => (treeExpanded.length > 0 ? new Set(treeExpanded) : new Set(allDirKeys(nodes))),
    [treeExpanded, nodes]
  );
  const onToggleDir = (key: string): void => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setScmTreeExpanded([...next]);
  };
  return (
    <>
      {nodes.map((node) => (
        <TreeNode key={node.key} node={node} depth={0} expanded={expanded} onToggleDir={onToggleDir} cb={cb} />
      ))}
    </>
  );
};

/**
 * One repo's changes: loading/degraded/truncated notices, then each group with its
 * bulk actions and either a list or tree body. Repo identity is not shown here — it
 * lives in the repositories section (multi-repo) or is implicit (single repo).
 */
export const ScmChangesView: React.FC<{
  repo: ScmRepository;
  status: ScmStatus | undefined;
  selectedKey: string | null;
  onAction: (action: ScmActionKind, repoId: string, resources: ScmResource[]) => void;
  busy: boolean;
  failedRowKeys: string[];
  viewMode: ScmViewMode;
  treeExpanded: string[];
}> = ({ repo, status, selectedKey, onAction, busy, failedRowKeys, viewMode, treeExpanded }) => {
  const { t } = useTranslation();
  // Grouping is a display-layer derivation from capabilities — the wire is flat and
  // never pre-grouped (source-control.md §变更清单).
  const groups = useMemo(
    () => groupResources(status?.resources ?? [], repo.capabilities.staging),
    [status?.resources, repo.capabilities.staging]
  );
  const failed = useMemo(() => new Set(failedRowKeys), [failedRowKeys]);

  return (
    <div data-scm-repo={repo.repo_id}>
      {/* Awaiting this repo's first status frame — see protocol.md v10 note in the
          prior RepoSection: key off "no status yet", not `state === 'refreshing'`. */}
      {(!status || repo.state === 'refreshing') && (
        <div data-scm-loading className='px-8px py-4px'>
          <Spin size={14} />
        </div>
      )}
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
        const bulkTargets = bulk ? actionableResources(group.resources) : [];
        // Bulk discard for every group EXCEPT `staged` (scm/discard acts on the
        // unstaged side only — protocol.md v11). Excluding by GROUP ID keeps the
        // no-staging `changes` group's bulk discard; see prior RepoSection note.
        const discardTargets = group.id === 'staged' ? [] : actionableResources(group.resources);
        const cb: RowCallbacks = {
          selectedKey,
          staging: repo.capabilities.staging,
          onRowAction: (action, r) => onAction(action, repo.repo_id, [r]),
          busy,
          failed,
        };
        // The unstaged/changes group's title merely repeats the section header, so we
        // drop its gray row; its stage-all lives in the section header now. Its
        // remaining bulk (discard-all) stays reachable via per-row hover actions.
        const showTitle = !isRedundantGroupTitle(group.id);
        return (
          <div key={group.id} data-scm-group={group.id} className='group/scmgroup'>
            {showTitle && (
              <div className='flex items-center px-8px pt-6px pb-2px text-12px text-t-tertiary uppercase'>
                <span className='flex-1 min-w-0'>{t(`conversation.explorer.scm.groups.${group.id}`)}</span>
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
            )}
            {group.id === 'blocked' && (
              <div data-scm-blocked-hint className='px-8px pb-2px text-12px text-t-tertiary'>
                {t('conversation.explorer.scm.actions.blockedHint')}
              </div>
            )}
            {viewMode === 'tree' ? (
              <TreeBody resources={group.resources} treeExpanded={treeExpanded} cb={cb} />
            ) : (
              <ListBody resources={group.resources} cb={cb} />
            )}
          </div>
        );
      })}
    </div>
  );
};
