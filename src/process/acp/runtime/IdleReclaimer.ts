// src/process/acp/runtime/IdleReclaimer.ts

import type { SessionEntry } from '@process/acp/types';

/** Minimal session interface used by IdleReclaimer to avoid importing AcpSession directly. */
type SuspendableSession = {
  readonly status: string;
  suspend(): Promise<void>;
};

export class IdleReclaimer {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly sessions: Map<string, SessionEntry>,
    private readonly idleTimeoutMs: number,
    private readonly checkIntervalMs: number
  ) {}

  start(): void {
    this.intervalId = setInterval(() => this.scan(), this.checkIntervalMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private scan(): void {
    const now = Date.now();
    for (const [_, entry] of this.sessions) {
      const session = entry.session as SuspendableSession;
      if (session.status === 'active' && now - entry.lastActiveAt > this.idleTimeoutMs) {
        session.suspend().catch((err) => console.warn('[IdleReclaimer] suspend failed:', err));
      }
    }
  }
}
