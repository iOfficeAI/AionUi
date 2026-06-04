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
