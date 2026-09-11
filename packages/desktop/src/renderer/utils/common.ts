/**
 * @license
 * Copyright 2025 AIbang (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const removeStack = (...args: Array<() => void>) => {
  return () => {
    const list = args.slice();
    while (list.length) {
      list.pop()!();
    }
  };
};

/**
 * new-api stores quota as internal units where 500,000 quota equals 1 CNY,
 * and AIbang credits are priced at 100 credits per CNY.
 */
export const QUOTA_PER_CNY = 500_000;
export const CREDITS_PER_CNY = 100;

export const quotaToCredits = (quota: number): number => Math.floor((quota / QUOTA_PER_CNY) * CREDITS_PER_CNY);

/**
 * Tool confirmation outcome enum
 * Kept in the renderer because this module cannot import Node.js dependencies.
 */
export enum ToolConfirmationOutcome {
  ProceedOnce = 'proceed_once',
  ProceedAlways = 'proceed_always',
  ProceedAlwaysServer = 'proceed_always_server',
  ProceedAlwaysTool = 'proceed_always_tool',
  ModifyWithEditor = 'modify_with_editor',
  Cancel = 'cancel',
}

export { uuid } from '@/common/utils';
