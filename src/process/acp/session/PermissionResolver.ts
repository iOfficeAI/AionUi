// src/process/acp/session/PermissionResolver.ts

import type { PermissionUIData, RequestPermissionRequest, RequestPermissionResponse, PendingPermission } from '../types';
import { ApprovalCache } from './ApprovalCache';

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
      return { optionId: allowOption?.optionId ?? request.options[0].optionId };
    }

    // Level 2: Cache hit
    const cacheKey = this.buildCacheKey(request);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { optionId: cached };
    }

    // Level 3: UI delegation
    const callId = request.toolCall.id;
    return new Promise<RequestPermissionResponse>((resolve, reject) => {
      this.pending.set(callId, { callId, resolve, reject, createdAt: Date.now(), cacheKey });
      uiCallback({
        callId,
        title: request.title ?? '',
        description: request.description ?? '',
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

    entry.resolve({ optionId });
  }

  rejectAll(error: Error): void {
    for (const entry of this.pending.values()) {
      entry.reject(error);
    }
    this.pending.clear();
  }

  private buildCacheKey(request: RequestPermissionRequest): string {
    return `${request.toolCall.name ?? 'unknown'}:${request.description ?? ''}`;
  }
}
