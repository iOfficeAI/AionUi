/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '../config/storage';

export type ApiProviderWithModel = {
  provider_id: string;
  model: string;
  use_model?: string;
};

// ── Frontend → Backend ──────────────────────────────────────────────────

export function toApiModel(m: TProviderWithModel): ApiProviderWithModel {
  return {
    provider_id: m.id,
    model: m.useModel,
  };
}

export function toApiModelOptional(m?: TProviderWithModel): ApiProviderWithModel | undefined {
  return m ? toApiModel(m) : undefined;
}

// ── Backend → Frontend ──────────────────────────────────────────────────

export function fromApiModel(raw: ApiProviderWithModel): TProviderWithModel {
  return {
    id: raw.provider_id,
    platform: '',
    name: '',
    base_url: '',
    api_key: '',
    useModel: raw.use_model ?? raw.model,
  };
}

function fromApiModelOptional(raw?: ApiProviderWithModel | null): TProviderWithModel | undefined {
  return raw ? fromApiModel(raw) : undefined;
}

export function fromApiConversation<T>(raw: T): T {
  if (!raw || typeof raw !== 'object' || !('model' in raw)) return raw;
  const r = raw as T & { model?: ApiProviderWithModel | null };
  return {
    ...r,
    model: fromApiModelOptional(r.model),
  };
}

export function fromApiPaginatedConversations<T>(result: { items: T[]; total: number; hasMore: boolean }): {
  items: T[];
  total: number;
  hasMore: boolean;
} {
  return {
    ...result,
    items: result.items.map(fromApiConversation),
  };
}
