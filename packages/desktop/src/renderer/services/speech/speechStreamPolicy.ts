/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SpeechToTextConfig } from '@/common/types/provider/speech';
import { DEEPGRAM_SPEECH_MODEL_PRESETS, OPENAI_SPEECH_MODEL_PRESETS } from './speechModels';

export type StreamCapability = 'supported' | 'unsupported' | 'unknown';

const STORAGE_KEY = 'aionui.sttStreamUnsupported';

// ---------------------------------------------------------------------------
// Capability matrix
// ---------------------------------------------------------------------------

/**
 * Determine statically whether a given (source, model) combination can use the
 * streaming WebSocket endpoint (`/api/stt/stream`).
 *
 * This is a per-option helper used for UI badges. `getStreamCapability` delegates
 * to this function so both share the same logic.
 *
 * @param source - 'openai' (official endpoint), 'deepgram', or 'custom' (openai
 *   with a non-empty base_url).
 * @param model  - The model identifier string.
 *
 * Rules:
 * - custom → always 'unknown' (custom endpoint behaviour varies; must probe)
 * - deepgram preset model → 'supported'; non-preset → 'unknown'
 * - openai official:
 *   - 'whisper-1' → 'unsupported' (file-only API)
 *   - other OPENAI preset → 'supported'
 *   - non-preset model → 'unknown'
 */
export const getModelStreamCapability = (source: 'openai' | 'deepgram' | 'custom', model: string): StreamCapability => {
  if (source === 'custom') {
    return 'unknown';
  }

  if (source === 'deepgram') {
    return DEEPGRAM_SPEECH_MODEL_PRESETS.includes(model) ? 'supported' : 'unknown';
  }

  // openai official endpoint
  if (model === 'whisper-1') {
    return 'unsupported';
  }
  if (OPENAI_SPEECH_MODEL_PRESETS.includes(model)) {
    return 'supported';
  }
  return 'unknown';
};

/**
 * Determine statically whether the given STT config can use the streaming
 * WebSocket endpoint (`/api/stt/stream`).
 *
 * Rules:
 * - deepgram preset model → supported; non-preset → unknown (may be a custom
 *   model that supports streaming; probe at runtime)
 * - openai official (empty / whitespace base_url):
 *   - 'whisper-1' → unsupported (file-only API)
 *   - other OPENAI preset → supported
 *   - non-preset model → unknown
 * - openai with a custom base_url → unknown (custom endpoint behaviour varies)
 */
export const getStreamCapability = (config: SpeechToTextConfig): StreamCapability => {
  if (config.provider === 'deepgram') {
    return getModelStreamCapability('deepgram', config.deepgram?.model ?? '');
  }

  // openai provider
  const baseUrl = config.openai?.base_url?.trim() ?? '';
  const source = baseUrl ? 'custom' : 'openai';
  return getModelStreamCapability(source, config.openai?.model ?? '');
};

// ---------------------------------------------------------------------------
// Failure memory
// ---------------------------------------------------------------------------

/** Derive a stable string key for the active provider sub-config. */
const streamMemoryEntry = (config: SpeechToTextConfig): string => {
  if (config.provider === 'deepgram') {
    return `deepgram||${config.deepgram?.model ?? ''}`;
  }
  return `openai|${config.openai?.base_url ?? ''}|${config.openai?.model ?? ''}`;
};

const readMemory = (): string[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
};

const writeMemory = (entries: string[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Silently no-op (SSR, locked storage, quota exceeded).
  }
};

/**
 * Record that streaming failed for the given config so future calls to
 * `shouldTryStreaming` return false for the same provider/base_url/model
 * combination.
 */
export const rememberStreamUnsupported = (config: SpeechToTextConfig): void => {
  const entry = streamMemoryEntry(config);
  const entries = readMemory();
  if (!entries.includes(entry)) {
    writeMemory([...entries, entry]);
  }
};

/** Clear all failure-memory entries (used in tests and future settings action). */
export const clearStreamMemory = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently no-op.
  }
};

// ---------------------------------------------------------------------------
// Policy decision
// ---------------------------------------------------------------------------

/**
 * Primary decision point: should the next recording attempt use the streaming
 * WebSocket endpoint?
 *
 * Returns false when:
 * - Static capability is 'unsupported' (e.g. whisper-1 on official OpenAI)
 * - A prior streaming attempt failed and was recorded via `rememberStreamUnsupported`
 *
 * Returns true otherwise (supported + no failure memory, or unknown → optimistic probe).
 */
export const shouldTryStreaming = (config: SpeechToTextConfig): boolean => {
  const capability = getStreamCapability(config);
  if (capability === 'unsupported') {
    return false;
  }
  const entry = streamMemoryEntry(config);
  const memory = readMemory();
  return !memory.includes(entry);
};
