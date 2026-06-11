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
  BG_OUTPUT_MAX,
  createBgListTool,
  createBgReadTool,
  createBgStartTool,
  createBgStopTool,
  createBgTailTool,
  createBgTools,
  type BgTools,
} from './bg.js';
import { SPOKEN_INSTRUCTION, VoiceModeStore, type VoiceModeState } from './voice.js';
import {
  PROTOCOL_VERSION,
  PLUGIN_VERSION,
  type HelloRequest,
  type HelloResponse,
  type ContextUpdate,
  type VoiceModeUpdate,
  type ResultRequest,
  type ResultResponse,
  type RunShellStreamingRequest,
  type RunShellStreamEvent,
  type BgProcessInfo,
  type BgProcessStatus,
  type BgRequest,
  type BgResponse,
  type BgStartRequest,
  type BgStopRequest,
  type BgListRequest,
  type BgReadRequest,
  type BgSuccessResponse,
  type BgTailRequest,
  type BgTailStreamEvent,
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
  // v0.2.0
  VoiceModeStore,
  SPOKEN_INSTRUCTION,
  createBgStartTool,
  createBgStopTool,
  createBgListTool,
  createBgReadTool,
  createBgTailTool,
  createBgTools,
  BG_OUTPUT_MAX,
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
  VoiceModeUpdate,
  VoiceModeState,
  ResultRequest,
  ResultResponse,
  RunShellStreamingRequest,
  RunShellStreamEvent,
  BgTools,
  BgProcessInfo,
  BgProcessStatus,
  BgRequest,
  BgResponse,
  BgStartRequest,
  BgStopRequest,
  BgListRequest,
  BgReadRequest,
  BgSuccessResponse,
  BgTailRequest,
  BgTailStreamEvent,
};
