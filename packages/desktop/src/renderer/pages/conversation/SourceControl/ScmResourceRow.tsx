/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * One resource row in the Changes panel: state badge + name + dimmed parent dir.
 *
 * Rendering rules that are contract, not cosmetics (source-control.md §变更清单):
 *
 *  - `conflicted` must be visually distinct from `modified`. Folding them would
 *    let a user act on a half-resolved merge believing it is an ordinary edit.
 *  - an **unknown** state (the wire set is open) renders as an opaque `?` row,
 *    never as a regular state.
 *  - `renamed` shows `old → new`. A move is NOT guaranteed to arrive as one
 *    `renamed` row — over the backend's rename-detection budget the same move
 *    arrives as a `deleted` + a `created` row, so both shapes render correctly
 *    here by construction (each row renders from its own state).
 *
 * Read-only for this round: no stage/unstage/discard affordance (PR-4).
 */

import { Button } from '@arco-design/web-react';
import { Minus, Plus, Undo } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import {
  classifyResourceState,
  isActionable,
  resourceDir,
  resourceName,
  type ScmActionKind,
  type ScmKnownResourceState,
  type ScmResource,
  type ScmResourceKind,
} from './scmModel';

/**
 * i18n key suffix for a row's state label/badge. Every unknown state collapses to
 * one `unknown` key — we cannot have a translation for a state this build has
 * never heard of, and inventing one from the raw wire value would leak an
 * untranslated identifier into the UI.
 */
type StateKeySuffix = ScmKnownResourceState | 'unknown';

const stateKeySuffix = (resource: ScmResource, kind: ScmResourceKind): StateKeySuffix =>
  kind === 'opaque' ? 'unknown' : (resource.state as ScmKnownResourceState);

/**
 * Badge styling for the A/M/D letter, keyed on the **suffix** — i.e. on `kind`
 * first, then on the narrowed known state (see {@link stateKeySuffix}).
 *
 * Why keyed on the suffix and not on `resource.state`: `ScmResourceState` is an
 * **open union** (`ScmKnownResourceState | (string & {})`), so a map keyed on the
 * raw state could never be exhaustive and would need a non-null assertion at the
 * lookup — exactly the "two-way branch meets a third value" shape that has bitten
 * this file before. `stateKeySuffix` collapses every unrecognized state to
 * `'unknown'` first, so this map IS total over its key type with no assertion.
 *
 * Colours come from the theme's semantic tokens (`--success` / `--warning` /
 * `--danger`, defined per light and dark scheme in
 * `styles/themes/default-color-scheme.css`), so they follow the theme with no
 * hard-coded hex here:
 *
 *  - `created`  → success  (added)
 *  - `modified` → warning  (changed in place)
 *  - `deleted`  → danger   (gone)
 *  - `renamed`  → success: a rename is the *presence* half of a move. When rename
 *    detection is skipped the same move surfaces as `deleted` + `created`, and
 *    colouring `renamed` like `created` keeps those two renderings visually
 *    consistent instead of inventing a fourth hue for the same event.
 *  - `unknown`  → tertiary (see below)
 */
const BADGE_CLASS: Record<StateKeySuffix, string> = {
  created: 'text-success',
  modified: 'text-warning',
  deleted: 'text-danger',
  renamed: 'text-success',
  /**
   * `conflicted` must NOT be plain `text-danger`.
   *
   * `deleted` is danger-coloured, and these two states are the pair a user most
   * needs to tell apart: a deleted file is an ordinary change with actions
   * available, while a conflicted file has **every action disabled** (no buttons
   * at all, see `canDiscard` / `stagingActions`). If conflicted merely looks like
   * deleted, the user hunts for buttons that were never there.
   *
   * So it is distinguished by **shape, not only hue** — a filled chip
   * (`bg-danger-light-1` + `border-danger-4` + a deeper `text-danger-6`), which is
   * the same treatment `CronStatusTag` uses for a status that needs to stand out.
   * All four are Arco theme variables, so this still follows the theme. Being
   * heavier than the plain letters is intentional: this is the state that most
   * needs attention, so it must not read as *less* prominent than `deleted`.
   */
  conflicted: 'bg-danger-light-1 border border-danger-4 text-danger-6 rd-2px',
  /** Unknown to this build: shown, but deliberately the quietest — we cannot say
   *  what it means, so it must not borrow another state's colour. */
  unknown: 'text-t-tertiary',
};

export type ScmResourceRowProps = {
  resource: ScmResource;
  selected: boolean;
  onSelect: (resource: ScmResource) => void;
  /**
   * Whether the owning repo has a staging area. Gates the stage/unstage buttons:
   * a provider without an index must show no staging affordance at all, and calling
   * those methods on it is a `-32052 capability_unsupported` error.
   */
  staging: boolean;
  /** Run an action for this single row. Omit to render the row read-only. */
  onAction?: (action: ScmActionKind, resource: ScmResource) => void;
  /** True while an action involving this row is in flight (buttons disabled). */
  busy?: boolean;
  /** True when the last action reported this row in its `failed[]`. */
  failed?: boolean;
  /**
   * Left indent in px, added to the row's base padding. Tree view uses this to
   * step files under their folder; list view leaves it 0. The badge/name layout is
   * unchanged — only the leading gap grows.
   */
  indent?: number;
  /**
   * Suppress the dimmed parent-directory suffix. Tree view sets this: the folder
   * chain already shows the path, so repeating the dir on every leaf is noise (VS
   * Code hides it in tree mode). List view leaves it shown.
   */
  hideDir?: boolean;
};

export const ScmResourceRow: React.FC<ScmResourceRowProps> = ({
  resource,
  selected,
  onSelect,
  staging,
  onAction,
  busy = false,
  failed = false,
  indent = 0,
  hideDir = false,
}) => {
  const { t } = useTranslation();
  const kind = classifyResourceState(resource.state);
  const suffix = stateKeySuffix(resource, kind);
  const name = resourceName(resource);
  const dir = resourceDir(resource);

  // `renamed` replaces the plain name with `old → new` so the move is legible at a
  // glance; `rename_from` is the pre-rename path while the row identity is the
  // post-rename one (the wire carries the new path as identity on purpose).
  const label =
    kind === 'renamed' && resource.rename_from
      ? t('conversation.explorer.scm.renamedFrom', { from: resource.rename_from, to: name })
      : name;

  const hint =
    kind === 'conflicted'
      ? t('conversation.explorer.scm.conflictedHint')
      : kind === 'opaque'
        ? t('conversation.explorer.scm.opaqueHint')
        : undefined;

  // Action gating, in order of how hard the "no" is:
  //  - a non-actionable row (conflicted / unknown state) gets NO action at all —
  //    including it in a request makes the backend refuse the whole batch (-32053);
  //  - stage/unstage additionally require the staging capability AND a known side
  //    (a flagless row has no side to move between);
  //  - discard additionally requires that this row is NOT the staged side.
  const actionable = onAction !== undefined && isActionable(resource);
  const stagingActions = actionable && staging && resource.staged !== undefined;

  // `scm/discard` acts on the **unstaged side only** (protocol.md v11; the engine
  // restores via `checkout_index`). So offering it on a staged row would destroy
  // the newest working-tree edit — which is a DIFFERENT row in the UI, one the user
  // never asked to touch, and `checkout_index` does not go through the trash.
  //
  // The condition must read both `staging` and `staged === true`, NOT just
  // `staged !== true`: `staged` is genuinely three-state, and a provider without a
  // staging area reports every row with `staged: undefined` (see `groupResources`'s
  // `!staging` branch). Such a provider — a future SVN one — has exactly one
  // "working tree vs committed" notion, and discard is its most basic action, so it
  // must keep the button. Gating on the row's flag alone would silently take a
  // whole provider's capability away while fixing this bug.
  const canDiscard = actionable && !(staging && resource.staged === true);

  // ⚠️ `isActionable` is checked TWICE on purpose — here (via `actionable`) and again
  // in the JSX wrapper below (`{actionable && …}`). **This duplication is load-bearing,
  // not leftover.** It is the reason a conflicted row cannot grow an action button
  // even if one of the two gates is later weakened.
  //
  // Two consequences for anyone touching this:
  //  1. **Do not "de-duplicate" it.** Removing either layer leaves the other one
  //     covering the case, so **every test still passes** — the cost is invisible at
  //     the moment you pay it, and only shows up when the surviving layer is weakened
  //     too (two edits, months apart, neither one obviously wrong).
  //  2. **A single-point mutation probe here comes back GREEN.** That green means
  //     "the injection was absorbed by the other layer", NOT "the tests are useless".
  //     To actually verify these gates, break BOTH at once (that does turn cells 1/6
  //     of `scmPanelActions.dom.test.tsx` red).

  const actionButton = (action: ScmActionKind, icon: React.ReactNode) => (
    <Button
      type='text'
      size='mini'
      disabled={busy}
      className='flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100'
      data-scm-action={action}
      icon={icon}
      aria-label={t(`conversation.explorer.scm.actions.${action}`)}
      title={t(`conversation.explorer.scm.actions.${action}`)}
      onClick={(e) => {
        e.stopPropagation(); // an explicit action must not also select the row
        onAction?.(action, resource);
      }}
    />
  );

  return (
    <div
      role='button'
      tabIndex={0}
      data-scm-resource
      data-scm-state={resource.state}
      data-scm-kind={kind}
      data-scm-failed={failed ? 'true' : undefined}
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(resource)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(resource);
        }
      }}
      className={`group flex items-center gap-6px px-8px py-3px rd-4px cursor-pointer hover:bg-2 min-w-0 ${
        selected ? 'bg-2' : ''
      }`}
      style={indent ? { paddingInlineStart: 8 + indent } : undefined}
      title={hint ?? resource.repo_relative_path}
    >
      <span
        aria-label={t(`conversation.explorer.scm.state.${suffix}`)}
        className={`flex-shrink-0 w-14px text-center text-12px font-medium ${BADGE_CLASS[suffix]}`}
      >
        {t(`conversation.explorer.scm.badge.${suffix}`)}
      </span>
      {/* Filename must carry an explicit primary-text token, not inherit. With no
          colour class it inherited a value that does not follow the theme, so in dark
          mode the name resolved dark-on-dark and blurred into the background (real-
          browser check: inherited stayed rgb(0,0,0) under dark, while text-t-primary
          resolves to #fff). conflicted/failed keep danger; everything else is primary. */}
      <span
        dir='ltr'
        className={`overflow-hidden text-ellipsis whitespace-nowrap text-13px ${
          kind === 'conflicted' || failed ? 'text-danger' : 'text-t-primary'
        } ${resource.state === 'deleted' ? 'line-through' : ''}`}
      >
        {label}
      </span>
      {dir && !hideDir && (
        <span className='overflow-hidden text-ellipsis whitespace-nowrap text-t-tertiary text-12px flex-1 min-w-0'>
          {dir}
        </span>
      )}
      {actionable && (
        <span className='flex items-center flex-shrink-0 ms-auto'>
          {canDiscard && actionButton('discard', <Undo theme='outline' size='13' />)}
          {stagingActions &&
            (resource.staged === true
              ? actionButton('unstage', <Minus theme='outline' size='13' />)
              : actionButton('stage', <Plus theme='outline' size='13' />))}
        </span>
      )}
    </div>
  );
};
