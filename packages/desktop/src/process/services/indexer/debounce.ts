/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type DebouncedBatch<T> = {
  add(item: T): void;
  flush(): void;
  clear(): void;
  readonly size: number;
};

export function createDebouncedBatch<T>(
  delayMs: number,
  onFlush: (items: readonly T[]) => void
): DebouncedBatch<T> {
  const pending = new Set<T>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flushNow = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending.size === 0) return;
    const items = [...pending];
    pending.clear();
    onFlush(items);
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flushNow, delayMs);
  };

  return {
    add(item: T) {
      pending.add(item);
      schedule();
    },
    flush: flushNow,
    clear() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pending.clear();
    },
    get size() {
      return pending.size;
    },
  };
}
