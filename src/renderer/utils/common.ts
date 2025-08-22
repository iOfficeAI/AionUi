/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
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

export { uuid } from '@/common/utils';
