// src/process/acp/session/PermissionResolver.ts

import type { RequestPermissionRequest, RequestPermissionResponse } from '@agentclientprotocol/sdk';
import type { PermissionUIData } from '@process/acp/types';

// ─── ApprovalCache (LRU eviction, stores optionId by serialized key) ──

export class ApprovalCache {
  private cache = new Map<string, string>();

  constructor(public readonly maxSize: number = 500) {}

  get size(): number {
    return this.cache.size;
  }

  get(key: string): string | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Refresh LRU order: delete and re-insert
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, optionId: string): void {
    // Delete first to reset insertion order
    this.cache.delete(key);
    this.cache.set(key, optionId);

    // Evict oldest if over limit
    if (this.cache.size > this.maxSize) {
      const oldest = this.cache.keys().next().value!;
      this.cache.delete(oldest);
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

// ─── Cache key builder ──────────────────────────────────────────

/**
 * Build a cache key from kind + title + operation-identifying fields in rawInput.
 *
 * Matches the semantics of AcpApprovalStore: users approve commands/paths,
 * not descriptions — so we only include operation-identifying fields
 * (command, path, file_path) from rawInput.
 */
function buildCacheKey(request: RequestPermissionRequest): string {
  const { kind, title, rawInput } = request.toolCall;

  const normalizedInput: Record<string, unknown> = {};
  if (rawInput && typeof rawInput === 'object') {
    const input = rawInput as Record<string, unknown>;
    if (input.command) normalizedInput.command = input.command;
    if (input.path) normalizedInput.path = input.path;
    if (input.file_path) normalizedInput.file_path = input.file_path;
  }

  return JSON.stringify({
    kind: kind ?? 'unknown',
    title: title ?? '',
    rawInput: normalizedInput,
  });
}

// ─── PermissionResolver ─────────────────────────────────────────

type PendingPermission = {
  callId: string;
  resolve: (response: RequestPermissionResponse) => void;
  reject: (error: Error) => void;
  createdAt: number;
};

type PermissionResolverConfig = {
  autoApproveAll: boolean;
  cacheMaxSize?: number;
};

type PendingPermissionWithContext = PendingPermission & {
  cacheKey: string;
};

export class PermissionResolver {
  private readonly yoloMode: boolean;
  private readonly cache: ApprovalCache;
  private readonly pending = new Map<string, PendingPermissionWithContext>();

  constructor(config: PermissionResolverConfig) {
    this.yoloMode = config.autoApproveAll;
    this.cache = new ApprovalCache(config.cacheMaxSize ?? 500);
  }

  get hasPending(): boolean {
    return this.pending.size > 0;
  }

  async evaluate(
    request: RequestPermissionRequest,
    uiCallback: (data: PermissionUIData) => void
  ): Promise<RequestPermissionResponse> {
    // Level 1: YOLO mode — auto-approve everything (client-side fallback)
    if (this.yoloMode) {
      const allowOption = request.options.find((o) => o.kind.startsWith('allow_'));
      const optionId = allowOption?.optionId ?? request.options[0].optionId;
      return { outcome: { outcome: 'selected', optionId } };
    }

    // Level 2: Cache hit (session-level "always allow" memory)
    const cacheKey = buildCacheKey(request);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { outcome: { outcome: 'selected', optionId: cached } };
    }

    // Level 3: UI delegation
    const { toolCall } = request;
    const callId = toolCall.toolCallId;
    return new Promise<RequestPermissionResponse>((resolve, reject) => {
      this.pending.set(callId, { callId, resolve, reject, createdAt: Date.now(), cacheKey });
      uiCallback({
        callId,
        title: toolCall.title ?? '',
        description: '',
        kind: toolCall.kind ?? undefined,
        options: request.options.map((o) => ({
          optionId: o.optionId,
          label: o.name,
          kind: o.kind,
        })),
        locations: toolCall.locations?.map((l) => ({
          path: l.path,
          range: l.line != null ? { startLine: l.line } : undefined,
        })),
        rawInput: toolCall.rawInput,
      });
    });
  }

  resolve(callId: string, optionId: string): void {
    const entry = this.pending.get(callId);
    if (!entry) return;
    this.pending.delete(callId);

    // Cache "allow always" decisions for future auto-approval (never cache deny)
    if (optionId.startsWith('allow_') && optionId.includes('always')) {
      this.cache.set(entry.cacheKey, optionId);
    }

    entry.resolve({ outcome: { outcome: 'selected', optionId } });
  }

  rejectAll(error: Error): void {
    for (const entry of this.pending.values()) {
      entry.reject(error);
    }
    this.pending.clear();
  }
}
