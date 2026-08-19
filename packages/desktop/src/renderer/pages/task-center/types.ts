/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ITaskCenterFilters, ITaskCenterRow } from '@/common/adapter/ipcBridge';

export type { ITaskCenterFilters, ITaskCenterRow };

export type UrgencyKey = 'urgent' | 'important' | 'normal';

export const urgencyToKey = (urgency: number): UrgencyKey => {
  if (urgency === 0) return 'urgent';
  if (urgency === 1) return 'important';
  return 'normal';
};

export const urgencyToColor = (urgency: number): 'red' | 'orange' | 'gray' => {
  if (urgency === 0) return 'red';
  if (urgency === 1) return 'orange';
  return 'gray';
};

/** Heuristic — backend `statusDesc` is Chinese for now; we map known values.
 *  Anything we don't recognize falls back to gray. */
export const statusToColor = (status: number, statusDesc: string): 'blue' | 'green' | 'gray' | 'red' => {
  if (status === 2) return 'green';
  if (status === 1) return 'blue';
  if (statusDesc.includes('完成')) return 'green';
  if (statusDesc.includes('关闭')) return 'gray';
  if (statusDesc.includes('未开展') || statusDesc.includes('挂起')) return 'red';
  return 'gray';
};

/** Returns true when the task is incomplete AND past its deadline. */
export const isOverdue = (item: ITaskCenterRow): boolean => {
  if (!item.deadlineTime) return false;
  if (item.status === 2) return false;
  const d = Date.parse(String(item.deadlineTime).replace(/-/g, '/'));
  if (!Number.isFinite(d)) return false;
  return d < Date.now();
};