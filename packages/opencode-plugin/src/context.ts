/**
 * Holds the latest `context.update` strings per session (and a global
 * fallback) so that `experimental.chat.system.transform` and the
 * `chat.message` synthetic-part fallback can pull the current state.
 *
 * Concurrency: a single in-process map. The store is mutated only from
 * the SSE dispatch callback and read from OpenCode hook callbacks, both
 * of which run on the same event loop. No locks required.
 */

export type ContextStoreOptions = {
  /** Maximum number of session entries to retain. Defaults to 256. */
  maxSessions?: number;
};

const DEFAULT_MAX_SESSIONS = 256;

/** Snapshot of system strings for a session, in insertion order. */
export type SystemSnapshot = {
  /** Global strings (apply to every session). */
  global: string[];
  /** Session-specific strings. */
  session: string[];
};

export class ContextStore {
  private readonly global: string[] = [];
  private readonly session = new Map<string, string[]>();
  private readonly maxSessions: number;
  private order: string[] = [];

  constructor(options: ContextStoreOptions = {}) {
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  }

  /**
   * Apply a `context.update` payload. Strings are appended (not
   * replaced) to the target bucket. A `note` field is ignored.
   * Returns the new snapshot.
   */
  apply(update: { sessionID?: string; system?: string[]; note?: string }): SystemSnapshot {
    void update.note;
    const additions = (update.system ?? []).filter((s): s is string => typeof s === 'string');
    if (update.sessionID) {
      const bucket = this.session.get(update.sessionID);
      if (bucket) {
        bucket.push(...additions);
      } else {
        this.session.set(update.sessionID, [...additions]);
        this.order.push(update.sessionID);
        this.evictIfNeeded();
      }
    } else {
      this.global.push(...additions);
    }
    return this.snapshot(update.sessionID);
  }

  /** Read-only snapshot of the current state for a given session. */
  snapshot(sessionID?: string): SystemSnapshot {
    const sessionBucket = sessionID ? this.session.get(sessionID) : undefined;
    return {
      global: [...this.global],
      session: sessionBucket ? [...sessionBucket] : [],
    };
  }

  /**
   * Get the full ordered list of system strings for a session
   * (global first, then session). Returns a fresh array.
   */
  getSystem(sessionID: string | undefined): string[] {
    const snap = this.snapshot(sessionID);
    return [...snap.global, ...snap.session];
  }

  /** Discard all stored state. Test helper. */
  clear(): void {
    this.global.length = 0;
    this.session.clear();
    this.order = [];
  }

  private evictIfNeeded(): void {
    if (this.session.size <= this.maxSessions) return;
    const overflow = this.session.size - this.maxSessions;
    for (let i = 0; i < overflow; i += 1) {
      const oldest = this.order.shift();
      if (oldest === undefined) break;
      this.session.delete(oldest);
    }
  }
}

/** Concatenate stored system strings into a single block. */
export const formatSystemInjection = (strings: string[]): string => {
  if (strings.length === 0) return '';
  return strings.join('\n\n');
};
