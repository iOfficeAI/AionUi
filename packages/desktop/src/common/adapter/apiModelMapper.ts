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

function hasCompleteModelIdentity(
  model?: TProviderWithModel
): model is TProviderWithModel & { id: string; use_model: string } {
  return Boolean(
    model &&
    typeof model.id === 'string' &&
    model.id.trim().length > 0 &&
    typeof model.use_model === 'string' &&
    model.use_model.trim().length > 0
  );
}

// ── Frontend → Backend ──────────────────────────────────────────────────

export function toApiModel(m: TProviderWithModel): ApiProviderWithModel {
  return {
    provider_id: m.id,
    model: m.use_model,
  };
}

export function toApiModelOptional(m?: TProviderWithModel): ApiProviderWithModel | undefined {
  return hasCompleteModelIdentity(m) ? toApiModel(m) : undefined;
}

/** Minimal shape of a create-conversation request consumed by the body builder. */
export type CreateConversationBodyInput = {
  type?: 'acp' | 'aionrs';
  id?: string;
  name?: string;
  model?: TProviderWithModel;
  assistant?: unknown;
  extra?: unknown;
};

/**
 * Build the HTTP body for `POST /api/conversations`.
 *
 * Top-level `model` is aionrs-only on the backend (spec 2026-05-12); other
 * agent types carry model info via `extra`. Assistant-first creates omit the
 * explicit `type`, so we must NOT gate the top-level `model` on `type ===
 * 'aionrs'`. Instead we forward the model whenever it carries a complete
 * identity: only aionrs flows produce a complete top-level model
 * (`useGuidModelSelection` is aionrs-only), while ACP flows pass an empty
 * placeholder that `toApiModelOptional` filters out. This keeps ACP creates
 * free of a top-level model (which the backend would reject) without dropping
 * the aionrs model the user actually selected.
 */
export function buildCreateConversationBody(p: CreateConversationBodyInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    type: p.type,
    id: p.id,
    name: p.name,
    assistant: p.assistant,
    extra: p.extra,
  };
  const model = toApiModelOptional(p.model);
  if (model) body.model = model;
  return body;
}

// ── Backend → Frontend ──────────────────────────────────────────────────

export function fromApiModel(raw: ApiProviderWithModel): TProviderWithModel {
  return {
    id: raw.provider_id,
    platform: '',
    name: '',
    base_url: '',
    api_key: '',
    use_model: raw.use_model ?? raw.model,
  };
}

function fromApiModelOptional(raw?: ApiProviderWithModel | null): TProviderWithModel | undefined {
  return raw ? fromApiModel(raw) : undefined;
}

export function fromApiConversation<T>(raw: T): T {
  if (!raw || typeof raw !== 'object') return raw;

  const r = raw as T & {
    model?: ApiProviderWithModel | null;
    extra?: Record<string, unknown> | null;
  };
  const next = { ...r } as unknown as T & {
    model?: TProviderWithModel;
    extra?: Record<string, unknown> | null;
  };

  if ('model' in r) {
    next.model = fromApiModelOptional(r.model);
  }

  const extra = r.extra;
  if (extra && typeof extra === 'object' && !('custom_workspace' in extra)) {
    const workspace = typeof extra.workspace === 'string' ? extra.workspace : '';
    const isTemporary = extra.is_temporary_workspace === true;
    next.extra = {
      ...extra,
      custom_workspace: workspace.length > 0 && !isTemporary,
    };
  }

  return next;
}

export function fromApiPaginatedConversations<T>(result: { items: T[]; total: number; has_more: boolean }): {
  items: T[];
  total: number;
  has_more: boolean;
} {
  return {
    ...result,
    items: result.items.map(fromApiConversation),
  };
}
