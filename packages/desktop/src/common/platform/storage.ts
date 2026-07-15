/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { bridge } from './bridge';

type MaybePromise<T> = T | Promise<T>;

export type StorageInterceptor<S extends object> = {
  get?: <K extends keyof S>(key: K) => MaybePromise<S[K]>;
  set?: <K extends keyof S>(key: K, data: S[K]) => MaybePromise<S[K]>;
  remove?: <K extends keyof S>(key: K) => MaybePromise<unknown>;
  clear?: () => MaybePromise<unknown>;
};

export const buildStorage = <S extends object>(namespace: string) => {
  const getProvider = bridge.buildProvider<S[keyof S], string>(`${namespace}.storage.get`);
  const setProvider = bridge.buildProvider<S[keyof S], { key: string; data: S[keyof S] }>(`${namespace}.storage.set`);
  const removeProvider = bridge.buildProvider<void, string>(`${namespace}.storage.remove`);
  const clearProvider = bridge.buildProvider<void, void>(`${namespace}.storage.clear`);

  return {
    namespace,
    get<K extends keyof S>(key: K): Promise<S[K]> {
      return getProvider.invoke(String(key)) as Promise<S[K]>;
    },
    set<K extends keyof S>(key: K, data: S[K]): Promise<S[K]> {
      return setProvider.invoke({ key: String(key), data }) as Promise<S[K]>;
    },
    remove(key: keyof S): Promise<void> {
      return removeProvider.invoke(String(key));
    },
    clear(): Promise<void> {
      return clearProvider.invoke();
    },
    interceptor(interceptor: StorageInterceptor<S>): void {
      if (interceptor.get) {
        getProvider.provider((key) => interceptor.get?.(key as keyof S) as MaybePromise<S[keyof S]>);
      }
      if (interceptor.set) {
        setProvider.provider(({ key, data }) => interceptor.set?.(key as keyof S, data) as MaybePromise<S[keyof S]>);
      }
      if (interceptor.remove) {
        removeProvider.provider(async (key) => {
          await interceptor.remove?.(key as keyof S);
        });
      }
      if (interceptor.clear) {
        clearProvider.provider(async () => {
          await interceptor.clear?.();
        });
      }
    },
  };
};
