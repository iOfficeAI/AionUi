/**
 * Public entry point for `@chisl/chisl-opencode-plugin`.
 *
 * Exports the OpenCode `Plugin` factory as both a named export and the
 * default export, plus a handful of lower-level helpers that are
 * useful for tests and advanced consumers.
 */

import type { Plugin } from '@opencode-ai/plugin';

import { createPlugin, DECLARED_HOOKS, detectServerVersion, buildHooks } from './capabilities.js';
import { resolveConfig, buildHelloBody, type PluginMode, type ResolvedConfig } from './config.js';
import {
  AionCoreClient,
  AionCoreHttpError,
  TIMEOUTS,
  OUTPUT_PREVIEW_MAX,
  capPreview,
  parseSseStream,
  connectEvents,
  nextBackoff,
  DEFAULT_BACKOFF,
  type BackoffOptions,
  type SseDispatchEvent,
  type SseDispatcher,
} from './connection.js';
import { ContextStore, formatSystemInjection } from './context.js';
import { createRunShellStreamingTool, type GetAionCoreClient } from './shell.js';
import {
  PROTOCOL_VERSION,
  PLUGIN_VERSION,
  type HelloRequest,
  type HelloResponse,
  type ContextUpdate,
  type ResultRequest,
  type ResultResponse,
  type RunShellStreamingRequest,
  type RunShellStreamEvent,
} from './types.js';

export const ChislPlugin: Plugin = createPlugin;
export default ChislPlugin;

export {
  AionCoreClient,
  AionCoreHttpError,
  ContextStore,
  formatSystemInjection,
  parseSseStream,
  connectEvents,
  nextBackoff,
  DEFAULT_BACKOFF,
  capPreview,
  TIMEOUTS,
  OUTPUT_PREVIEW_MAX,
  resolveConfig,
  buildHelloBody,
  detectServerVersion,
  buildHooks,
  createRunShellStreamingTool,
  DECLARED_HOOKS,
  PROTOCOL_VERSION,
  PLUGIN_VERSION,
};

export type {
  PluginMode,
  ResolvedConfig,
  BackoffOptions,
  SseDispatchEvent,
  SseDispatcher,
  GetAionCoreClient,
  HelloRequest,
  HelloResponse,
  ContextUpdate,
  ResultRequest,
  ResultResponse,
  RunShellStreamingRequest,
  RunShellStreamEvent,
};
