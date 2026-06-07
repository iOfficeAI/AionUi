/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React from 'react';

export type StatusPillState = 'queued' | 'running' | 'success' | 'failed' | 'cancelled' | 'skipped';

/** i18n key for each StatusPill state's label. */
export const STATE_LABEL_KEY: Record<StatusPillState, string> = {
  queued: 'messages.toolShell.stateQueued',
  running: 'messages.toolShell.stateRunning',
  success: 'messages.toolShell.stateDone',
  failed: 'messages.toolShell.stateFailed',
  cancelled: 'messages.toolShell.stateCancelled',
  skipped: 'messages.toolShell.stateSkipped',
};

/** English fallback for each StatusPill state. */
export const STATE_LABEL_FALLBACK: Record<StatusPillState, string> = {
  queued: 'Queued',
  running: 'Running',
  success: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
  skipped: 'Skipped',
};

/** Map the internal `NormalizedToolStatus` vocabulary to the StatusPill state set. */
export function statusPillFromNormalized(
  status:
    | 'pending'
    | 'running'
    | 'completed'
    | 'error'
    | 'canceled'
    | 'queued'
    | 'success'
    | 'failed'
    | 'cancelled'
    | 'skipped'
): StatusPillState {
  switch (status) {
    case 'pending':
    case 'queued':
      return 'queued';
    case 'running':
      return 'running';
    case 'completed':
    case 'success':
      return 'success';
    case 'error':
    case 'failed':
      return 'failed';
    case 'canceled':
    case 'cancelled':
      return 'cancelled';
    case 'skipped':
      return 'skipped';
    default:
      return 'queued';
  }
}

interface StatusPillProps {
  state: StatusPillState;
  label?: string;
  className?: string;
}

const dotColor: Record<StatusPillState, string> = {
  queued: 'var(--text-secondary)',
  running: 'var(--brand)',
  success: 'var(--success)',
  failed: 'var(--danger)',
  cancelled: 'var(--bg-6)',
  skipped: 'var(--bg-6)',
};

const StatusPill: React.FC<StatusPillProps> = ({ state, label, className }) => {
  const textCls =
    state === 'running'
      ? 'text-brand'
      : state === 'success'
        ? 'text-success'
        : state === 'failed'
          ? 'text-danger'
          : state === 'queued'
            ? 'text-t-secondary'
            : 'text-t-tertiary';

  const bgStyle =
    state === 'running'
      ? { backgroundColor: 'var(--activity-pulse-bg)' }
      : state === 'success'
        ? { backgroundColor: 'color-mix(in srgb, var(--success) 12%, transparent)' }
        : state === 'failed'
          ? { backgroundColor: 'color-mix(in srgb, var(--danger) 14%, transparent)' }
          : { backgroundColor: 'var(--bg-2)' };

  return (
    <span
      role='status'
      aria-label={`${state}${label ? `: ${label}` : ''}`}
      className={classNames(
        'status-pill inline-flex items-center gap-6px h-20px px-8px rounded-control text-12px font-medium leading-none whitespace-nowrap select-none',
        textCls,
        className
      )}
      style={bgStyle}
    >
      <span
        className={classNames('status-pill__dot inline-block w-6px h-6px rounded-full', {
          'status-pill__dot--running': state === 'running',
        })}
        style={{ backgroundColor: dotColor[state] }}
        aria-hidden='true'
      />
      {label && <span>{label}</span>}
    </span>
  );
};

export default StatusPill;
