/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export {
  CHISL_HTTP_SERVER_REGISTRY_KEY,
  DEFAULT_HTTP_BASIC_USERNAME,
  basicAuthUsername,
  httpServerConnectionKey,
  httpServerDisplayName,
  isHttpServerConnection,
  normalizeServerUrl,
  prepareHttpServerConnectionInput,
  rejectNonHttpServerType,
  toHttpServerConnection,
  toStoredHttpServerRecord,
  type HttpServerConnection,
  type HttpServerHttpBase,
  type HttpServerRegistryInput,
  type HttpServerRegistrySnapshot,
  type HttpServerStoredRecord,
} from './httpServerConnection';
export { HttpServerConnectionKey } from './httpServerConnection';

export { basicAuthToken, httpServerAuthHeaders } from './httpServerAuth';

export {
  HTTP_SERVER_HEALTH_CACHE_MS,
  HTTP_SERVER_HEALTH_POLL_MS,
  HTTP_SERVER_HEALTH_RETRY_COUNT,
  HTTP_SERVER_HEALTH_RETRY_DELAY_MS,
  HTTP_SERVER_HEALTH_TIMEOUT_MS,
  checkHttpServerHealth,
  checkHttpServerHealthCached,
  clearHttpServerHealthCache,
  fetchHttpServerHealth,
  globalHealthUrl,
  httpServerHealthCacheKey,
  mapHealthResponse,
  type CheckHttpServerHealthOptions,
  type HttpServerHealthResult,
  type HttpServerHealthStatus,
} from './httpServerHealth';

export {
  coerceHttpServerConnection,
  filterHttpServerRecords,
  getActiveHttpServerConnection,
  loadHttpServerRegistrySnapshot,
  parseStoredHttpServerRecord,
  removeHttpServerConnection,
  serializeHttpServerRegistry,
  setActiveHttpServerConnection,
  upsertHttpServerConnection,
  type HttpServerRegistryState,
} from './httpServerRegistry';
