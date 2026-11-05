import type { ConfigKey, ConfigKeyMap } from './configKeys';

type Subscriber = (value: unknown) => void;

declare global {
  interface Window {
    __backendPort?: number;
  }
}

function getBaseUrl(): string {
  // WebUI browser mode: no preload, fetch same-origin so web-host's
  // static-server reverse-proxies /api/* to the backend.
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && !(window as Window).__backendPort) {
    return '';
  }
  const port = typeof window !== 'undefined' ? (window as Window).__backendPort || 13400 : 13400;
  return `http://127.0.0.1:${port}`;
}

async function fetchJson<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ConfigService ${method} ${path} failed (${response.status}): ${errorBody}`);
  }
  const contentType = response.headers.get('Content-Type');
  if (!contentType?.includes('application/json')) {
    return undefined as T;
  }
  const json = await response.json();
  if (json && typeof json === 'object' && 'data' in json) {
    return json.data as T;
  }
  return json as T;
}

class ConfigServiceImpl {
  private cache = new Map<string, unknown>();
  private subscribers = new Map<string, Set<Subscriber>>();
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private revisions = new Map<string, number>();
  private generation = 0;

  // Idempotent: concurrent callers share the same in-flight promise, and a
  // resolved init returns immediately. Modules that need persisted settings on
  // module load (theme/language) await whenReady() before reading.
  initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    const generation = this.generation;
    const revisions = new Map(this.revisions);
    const initialization = (async () => {
      const data = await fetchJson<Record<string, unknown>>('GET', '/api/settings/client');
      if (generation !== this.generation) return;
      const changes = new Map<string, unknown>();
      for (const key of new Set([...this.cache.keys(), ...Object.keys(data ?? {})])) {
        // A completed write or local update is newer than this GET snapshot.
        if (this.revisions.get(key) !== revisions.get(key)) continue;
        const value = data?.[key];
        if (!Object.is(this.cache.get(key), value)) changes.set(key, value);
        if (value === undefined) this.cache.delete(key);
        else this.cache.set(key, value);
      }
      this.initialized = true;
      // Publish only after all keys are available, so related settings (such as
      // active theme and custom themes) are observed as a coherent snapshot.
      for (const [key, value] of changes) this.notify(key as ConfigKey, value);
    })();
    this.initPromise = initialization;
    void initialization.catch(() => {
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
    await this.persist({ [key]: value });
  }

  setLocal<K extends ConfigKey>(key: K, value: ConfigKeyMap[K]): void {
    this.cache.set(key, value);
    this.revisions.set(key, (this.revisions.get(key) ?? 0) + 1);
    this.notify(key, value);
  }

  async remove(key: ConfigKey): Promise<void> {
    await this.persist({ [key]: null });
  }

  async setBatch(entries: Partial<{ [K in ConfigKey]: ConfigKeyMap[K] }>): Promise<void> {
    await this.persist(entries);
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
    this.generation++;
    this.cache.clear();
    this.subscribers.clear();
    this.revisions.clear();
    this.initialized = false;
    this.initPromise = null;
    this.writeQueue = Promise.resolve();
  }

  private persist(entries: Record<string, unknown>): Promise<void> {
    const generation = this.generation;
    // Capture JSON values when called, and use the API's deletion tombstone for
    // undefined optional preferences rather than silently omitting the key.
    const body = JSON.parse(
      JSON.stringify(Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value ?? null])))
    ) as Record<string, unknown>;
    const write = this.writeQueue.then(async () => {
      if (generation !== this.generation) throw new Error('ConfigService was reset before saving');
      await fetchJson<void>('PUT', '/api/settings/client', body);
      if (generation !== this.generation) throw new Error('ConfigService was reset while saving');
      for (const [key, value] of Object.entries(body)) {
        if (value === null) this.cache.delete(key);
        else this.cache.set(key, value);
        this.revisions.set(key, (this.revisions.get(key) ?? 0) + 1);
      }
      for (const [key, value] of Object.entries(body)) this.notify(key as ConfigKey, value ?? undefined);
    });
    // Failed writes reject their caller, but do not block subsequent saves.
    this.writeQueue = write.catch(() => {});
    return write;
  }

  private notify(key: ConfigKey, value: unknown): void {
    const subs = this.subscribers.get(key);
    if (subs) {
      for (const cb of subs) {
        try {
          cb(value);
        } catch {
          // A view failure must not turn a committed save into a rejected one
          // or prevent other views from observing the persisted preference.
          console.error(`ConfigService subscriber failed for ${key}`);
        }
      }
    }
  }
}

export const configService = new ConfigServiceImpl();
