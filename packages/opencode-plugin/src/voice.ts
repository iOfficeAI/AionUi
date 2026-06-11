/**
 * Voice-mode store: tracks whether voice mode is enabled globally and
 * per session. Driven by `voice_mode` SSE events from AionCore.
 *
 * Concurrency: a single in-process map. Mutated only from the SSE
 * dispatch callback and read from OpenCode hook callbacks, both of
 * which run on the same event loop. No locks required.
 *
 * The store also exports `SPOKEN_INSTRUCTION`: the prompt instruction
 * appended to the system prompt (or to the chat.message synthetic
 * fallback) when voice mode is on.
 */

export type VoiceModeStoreOptions = {
  /** Maximum number of per-session overrides to retain. Defaults to 256. */
  maxSessions?: number;
};

const DEFAULT_MAX_SESSIONS = 256;

/** Per-session override or global default. */
export type VoiceModeState = {
  global: boolean;
  perSession: Map<string, boolean>;
};

/**
 * Lightweight LRU store for voice-mode enabled flags. Mirrors
 * `ContextStore`'s eviction shape so both modules share a
 * consistent in-memory footprint cap.
 */
export class VoiceModeStore {
  private globalEnabled = false;
  private readonly session = new Map<string, boolean>();
  private readonly maxSessions: number;
  private order: string[] = [];

  constructor(options: VoiceModeStoreOptions = {}) {
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  }

  /**
   * Apply a `voice_mode` payload. A `sessionID` of `undefined` or `null`
   * updates the global default; otherwise it sets / replaces the
   * per-session override.
   */
  apply(update: { sessionID?: string | null; enabled: boolean }): void {
    const enabled = Boolean(update.enabled);
    if (update.sessionID == null) {
      this.globalEnabled = enabled;
      return;
    }
    const id = update.sessionID;
    this.session.set(id, enabled);
    if (!this.order.includes(id)) {
      this.order.push(id);
    }
    this.evictIfNeeded();
  }

  /**
   * Resolve the effective enabled state. A per-session override takes
   * precedence over the global default.
   */
  isEnabled(sessionID: string | undefined): boolean {
    if (sessionID) {
      const v = this.session.get(sessionID);
      if (v !== undefined) return v;
    }
    return this.globalEnabled;
  }

  /** Read-only snapshot of the current state. Test helper. */
  snapshot(): VoiceModeState {
    return { global: this.globalEnabled, perSession: new Map(this.session) };
  }

  /** Discard all stored state. Test helper. */
  clear(): void {
    this.globalEnabled = false;
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

/**
 * Prompt instruction appended to the system prompt (and to the
 * `chat.message` synthetic fallback) when voice mode is enabled.
 * Stable string so tests can assert against it.
 */
export const SPOKEN_INSTRUCTION =
  'Voice mode is active for this conversation. After your normal response, ' +
  'append exactly one fenced code block tagged "spoken" containing a short ' +
  'conversational summary (1-3 sentences) suitable for text-to-speech. The ' +
  'spoken block must be plain prose: no code, no markdown formatting, no URLs, ' +
  'and no lists. Produce no more than one "spoken" block per response.';
