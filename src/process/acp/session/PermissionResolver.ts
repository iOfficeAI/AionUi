// src/process/acp/session/PermissionResolver.ts

import type { RequestPermissionRequest, RequestPermissionResponse } from '@agentclientprotocol/sdk';
import type { PermissionUIData } from '@process/acp/types';

// ─── ApprovalCache (previously in ApprovalCache.ts) ─────────────

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
  private readonly autoApproveAll: boolean;
  private readonly cache: ApprovalCache;
  private readonly pending = new Map<string, PendingPermissionWithContext>();

  constructor(config: PermissionResolverConfig) {
    this.autoApproveAll = config.autoApproveAll;
    this.cache = new ApprovalCache(config.cacheMaxSize ?? 500);
  }

  get hasPending(): boolean {
    return this.pending.size > 0;
  }

  async evaluate(
    request: RequestPermissionRequest,
    uiCallback: (data: PermissionUIData) => void
  ): Promise<RequestPermissionResponse> {
    // Level 1: YOLO mode
    if (this.autoApproveAll) {
      const allowOption = request.options.find((o) => o.kind.startsWith('allow_'));
      const optionId = allowOption?.optionId ?? request.options[0].optionId;
      return { outcome: { outcome: 'selected', optionId } };
    }

    // Level 2: Cache hit
    const cacheKey = this.buildCacheKey(request);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { outcome: { outcome: 'selected', optionId: cached } };
    }

    // Level 3: UI delegation
    const callId = request.toolCall.toolCallId;
    return new Promise<RequestPermissionResponse>((resolve, reject) => {
      this.pending.set(callId, { callId, resolve, reject, createdAt: Date.now(), cacheKey });
      uiCallback({
        callId,
        title: request.toolCall.title ?? '',
        description: '',
        options: request.options.map((o) => ({
          optionId: o.optionId,
          label: o.name,
          kind: o.kind,
        })),
      });
    });
  }

  resolve(callId: string, optionId: string): void {
    const entry = this.pending.get(callId);
    if (!entry) return;
    this.pending.delete(callId);

    // Cache "always" decisions
    if (optionId.includes('always') || optionId === 'always') {
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

  private buildCacheKey(request: RequestPermissionRequest): string {
    const toolName = request.toolCall.title ?? 'unknown';
    return `${toolName}`;
  }
}
