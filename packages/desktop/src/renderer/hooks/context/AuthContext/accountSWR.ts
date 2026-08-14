/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mutate as defaultMutate, type ScopedMutator } from 'swr';

/**
 * Imperative cache mutation entry point for code that cannot call
 * `useSWRConfig`. The account provider binds it to the currently mounted
 * cache; outside that provider it retains SWR's default behavior.
 */
export let mutateAccountCache: ScopedMutator = defaultMutate;

/** Bind imperative mutations to one mounted account cache. */
export function bindAccountCacheMutator(mutate: ScopedMutator): () => void {
  mutateAccountCache = mutate;
  return () => {
    if (mutateAccountCache === mutate) mutateAccountCache = defaultMutate;
  };
}

/** Remove data left in SWR's process-global fallback cache. */
export function clearDefaultSWRCache(): void {
  void defaultMutate(() => true, undefined, { revalidate: false });
}
