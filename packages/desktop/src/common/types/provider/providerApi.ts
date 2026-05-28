/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Wire-contract types for `/api/providers/*`.
 *
 * Direct mirror of the Rust types in
 * `crates/aionui-api-types/src/provider.rs`. Keep in sync with the
 * backend spec.
 */

import type { IProvider, ModelCapability } from '@/common/config/storage';

export interface CreateProviderRequest {
  /**
   * Optional caller-supplied id. When omitted, the server generates one.
   * Validated leniently (any non-empty string) to accept the frontend's
   * 8-char `uuid()` helper output.
   */
  id?: string;
  platform: string;
  name: string;
  base_url: string;
  api_key: string;
  models?: string[];
  enabled?: boolean;
  capabilities?: ModelCapability[];
  context_limit?: number;
  model_protocols?: Record<string, string>;
  model_enabled?: Record<string, boolean>;
  model_health?: IProvider['model_health'];
  bedrock_config?: IProvider['bedrock_config'];
  is_full_url?: boolean;
}

/**
 * Partial-update shape for `PUT /api/providers/:id`.
 * Every field is optional — only fields sent are updated.
 */
export interface UpdateProviderRequest {
  platform?: string;
  name?: string;
  base_url?: string;
  api_key?: string;
  models?: string[];
  enabled?: boolean;
  capabilities?: ModelCapability[];
  context_limit?: number;
  model_protocols?: Record<string, string>;
  model_enabled?: Record<string, boolean>;
  model_health?: IProvider['model_health'];
  bedrock_config?: IProvider['bedrock_config'];
  is_full_url?: boolean;
}

/**
 * Response for `POST /api/providers/:id/models` and
 * `POST /api/providers/fetch-models`.
 */
export interface FetchModelsResponse {
  /** Mixed-shape array: bare id strings or `{ id, name }` pairs. */
  models: Array<string | { id: string; name: string }>;
  /** Present when backend auto-corrected the provider's base_url. */
  fixed_base_url?: string;
}

/**
 * Anonymous fetch-models request used by the pre-create form flow.
 * No provider row needs to exist yet — credentials travel in the body.
 */
export interface FetchModelsAnonymousRequest {
  platform: string;
  base_url?: string;
  api_key: string;
  bedrock_config?: IProvider['bedrock_config'];
  try_fix?: boolean;
}

export type ProviderHealthCheckErrorKind =
  | 'timeout'
  | 'invalid_authorization_header'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'insufficient_quota'
  | 'aws_credentials'
  | 'invalid_request'
  | 'rate_limited'
  | 'connection_error'
  | 'api_error'
  | 'unknown';

export interface ProviderHealthCheckRequest {
  provider_id: string;
  model: string;
}

export interface ProviderHealthCheckResponse {
  provider_id: string;
  platform: string;
  model: string;
  status: 'unknown' | 'healthy' | 'unhealthy';
  elapsed_ms: number;
  message?: string;
  error_kind?: ProviderHealthCheckErrorKind;
  http_status?: number;
  timeout_stage?: string;
}
