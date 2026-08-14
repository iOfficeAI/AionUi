import type { ConfigKey, ConfigKeyMap } from './configKeys';
import { httpRequest } from '../adapter/httpBridge';

type Subscriber = (value: unknown) => void;

class ConfigServiceImpl {
  private cache = new Map<string, unknown>();
  private subscribers = new Map<string, Set<Subscriber>>();
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private generation = 0;

  // Idempotent: concurrent callers share the same in-flight promise, and a
  // resolved init returns immediately. Modules that need persisted settings on
  // module load (theme/language) await whenReady() before reading.
  initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    const generation = this.generation;
    const initialization = (async () => {
      const data = await httpRequest<Record<string, unknown>>('GET', '/api/settings/client');
      // A logout/account switch can happen while the request is in flight.
      // Never let that stale response repopulate the next account's cache.
      if (generation !== this.generation) return;
      const previous = new Map(this.cache);
      this.cache.clear();
      if (data) {
        for (const [key, value] of Object.entries(data)) {
          this.cache.set(key, value);
        }
      }
      this.initialized = true;
      const changedKeys = new Set([...previous.keys(), ...this.cache.keys()]);
      for (const key of changedKeys) {
        const nextValue = this.cache.get(key);
        if (!Object.is(previous.get(key), nextValue)) this.notify(key as ConfigKey, nextValue);
      }
    })();
    this.initPromise = initialization;
    initialization.catch(() => {
      // Allow a future caller to retry after a transient failure
      if (this.initPromise === initialization) this.initPromise = null;
    });
    return initialization;
  }

  whenReady(): Promise<void> {
    return this.initialize();
  }

  get<K extends ConfigKey>(key: K): ConfigKeyMap[K] | undefined {
    return this.cache.get(key) as ConfigKeyMap[K] | undefined;
  }

  async set<K extends ConfigKey>(key: K, value: ConfigKeyMap[K]): Promise<void> {
    this.cache.set(key, value);
    this.notify(key, value);
    await httpRequest<void>('PUT', '/api/settings/client', { [key]: value });
  }

  setLocal<K extends ConfigKey>(key: K, value: ConfigKeyMap[K]): void {
    this.cache.set(key, value);
    this.notify(key, value);
  }

  async remove(key: ConfigKey): Promise<void> {
    this.cache.delete(key);
    this.notify(key, undefined);
    await httpRequest<void>('PUT', '/api/settings/client', { [key]: null });
  }

  async setBatch(entries: Partial<{ [K in ConfigKey]: ConfigKeyMap[K] }>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      this.cache.set(key, value);
      this.notify(key as ConfigKey, value);
    }
    await httpRequest<void>('PUT', '/api/settings/client', entries);
  }

  subscribe(key: ConfigKey, callback: Subscriber): () => void {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key)!.add(callback);
    return () => {
      this.subscribers.get(key)?.delete(callback);
    };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  reset(): void {
    const populatedKeys = [...this.cache.keys()];
    this.generation += 1;
    this.cache.clear();
    this.initialized = false;
    this.initPromise = null;
    for (const key of populatedKeys) this.notify(key as ConfigKey, undefined);
  }

  private notify(key: ConfigKey, value: unknown): void {
    const subs = this.subscribers.get(key);
    if (subs) {
      for (const cb of subs) {
        cb(value);
      }
    }
  }
}

export const configService = new ConfigServiceImpl();
