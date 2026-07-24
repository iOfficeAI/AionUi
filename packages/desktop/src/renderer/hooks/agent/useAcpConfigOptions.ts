/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type {
  AcpConfigOptionDto,
  AcpConfigSelectOptionDto,
  SetConfigOptionResponse,
} from '@/common/types/platform/acpTypes';
import { ensureConversationRuntime } from '@/renderer/pages/conversation/utils/ensureConversationRuntime';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { mutate as swrMutate } from 'swr';

export type AcpDerivedSelectOption = {
  value: string;
  label: string;
  description?: string | null;
};

export type AcpDerivedOption = {
  id: string;
  category: string;
  currentValue: string | null;
  options: AcpDerivedSelectOption[];
};

export type AcpConfigSetStatus = { state: 'idle' } | { state: 'setting'; optionId: string; requestedValue: string };

export type AcpConfigSetErrorKind =
  | 'command_ack'
  | 'confirmation_timeout'
  | 'config_update_in_progress'
  | 'config_not_observed'
  | 'unknown';

const optionLabel = (option: AcpConfigSelectOptionDto): string => option.name || option.label || option.value;

export function getOptionCurrentValue(option: AcpConfigOptionDto | null | undefined): string | null {
  return option?.current_value ?? null;
}

export function findConfigOption(
  options: AcpConfigOptionDto[] | null | undefined,
  category: string,
  fallbackIds: string[] = []
): AcpConfigOptionDto | null {
  if (!options?.length) return null;
  return (
    options.find((option) => option.category === category) ||
    options.find((option) => fallbackIds.includes(option.id)) ||
    null
  );
}

export function deriveSelectOption(
  options: AcpConfigOptionDto[] | null | undefined,
  category: string,
  fallbackIds: string[] = []
): AcpDerivedOption | null {
  const option = findConfigOption(options, category, fallbackIds);
  if (!option || (option.option_type ?? option.type) !== 'select') return null;
  return {
    id: option.id,
    category,
    currentValue: getOptionCurrentValue(option),
    options: option.options.map((choice) => ({
      value: choice.value,
      label: optionLabel(choice),
      description: choice.description,
    })),
  };
}

/**
 * Fallback option ids for the thought-level axis, matched only when no option
 * carries `category: 'thought_level'` (the category stays authoritative).
 * Covers every id the known backends emit: our Core's `reasoning_effort`, the
 * legacy ACP aliases `effort`/`thinking_budget`, and `thinking` (also the id
 * upstream PR #3597 matches, so the two changes stay compatible).
 */
export const THOUGHT_LEVEL_FALLBACK_IDS = [
  'thought_level',
  'reasoning_effort',
  'effort',
  'thinking',
  'thinking_budget',
];

/**
 * Anti-flicker merge for whole-snapshot replaces (`acp_config_option` push /
 * REST reload): keep a known non-null `current_value` when the incoming frame
 * carries NO current information at all.
 *
 * A frame where EVERY option's `current_value` is null is "informationless" —
 * the backend simply had nothing selected to report yet (e.g. an early catalog
 * push before its currents landed, or an older Core that never stamped
 * currents) — and letting it clobber a current the UI already observed makes
 * the picker flash Model-only. For those frames the previous per-option
 * current is preserved (matched by category, then id).
 *
 * A frame with AT LEAST ONE non-null current is an informed snapshot: its
 * nulls are authoritative and pass through. This is what keeps the Core's
 * reject re-push working — after a backend refuses an effort set, the
 * corrected frame still carries the model current, so its effort null WIPES
 * the stale highlight instead of being "protected".
 */
export function mergeSnapshotPreservingKnownCurrents(
  previous: AcpConfigOptionDto[] | null | undefined,
  next: AcpConfigOptionDto[]
): AcpConfigOptionDto[] {
  if (!previous?.length) return next;
  const informed = next.some((option) => option.current_value != null);
  if (informed) return next;
  return next.map((option) => {
    if (option.current_value != null) return option;
    const prior = previous.find((candidate) =>
      option.category ? candidate.category === option.category : candidate.id === option.id
    );
    if (prior?.current_value == null) return option;
    // Only revive a current the incoming option can still represent — a stale
    // value outside the new choice list would be its own lie.
    const stillSelectable = option.options?.some((choice) => choice.value === prior.current_value);
    return stillSelectable ? { ...option, current_value: prior.current_value } : option;
  });
}

export function hasObservedValue(
  response: SetConfigOptionResponse,
  optionId: string,
  requestedValue: string
): response is SetConfigOptionResponse & { config_options: AcpConfigOptionDto[] } {
  if (response.confirmation !== 'observed') return false;
  const option = response.config_options?.find((candidate) => candidate.id === optionId);
  return getOptionCurrentValue(option) === requestedValue;
}

export function classifyConfigSetError(error: unknown): AcpConfigSetErrorKind {
  if (error instanceof Error) {
    if (error.message.includes('command_ack')) return 'command_ack';
    if (error.message.includes('config_update_in_progress')) return 'config_update_in_progress';
    if (error.message.includes('config_not_observed')) return 'config_not_observed';
  }
  if (isBackendHttpError(error)) {
    if (error.code === 'confirmation_timeout') return 'confirmation_timeout';
    if (error.code === 'config_update_in_progress') return 'config_update_in_progress';
  }
  return 'unknown';
}

type AcpConfigOptionsKey = readonly ['acp-config-options', string];

const getRuntimeConfigOptionsKey = (conversation_id: string): AcpConfigOptionsKey =>
  ['acp-config-options', conversation_id] as const;

export function revalidateAcpConfigOptions(conversation_id: string): Promise<AcpConfigOptionDto[] | null | undefined> {
  return swrMutate(getRuntimeConfigOptionsKey(conversation_id));
}

export type AcpConfigOptionsLoader = (conversation_id: string) => Promise<AcpConfigOptionDto[] | null | undefined>;

const statusByConversation = new Map<string, AcpConfigSetStatus>();
const statusListeners = new Map<string, Set<(status: AcpConfigSetStatus) => void>>();

function getConversationSetStatus(conversation_id: string): AcpConfigSetStatus {
  return statusByConversation.get(conversation_id) ?? { state: 'idle' };
}

function setConversationSetStatus(conversation_id: string, status: AcpConfigSetStatus): void {
  statusByConversation.set(conversation_id, status);
  statusListeners.get(conversation_id)?.forEach((listener) => listener(status));
}

function subscribeConversationSetStatus(
  conversation_id: string,
  listener: (status: AcpConfigSetStatus) => void
): () => void {
  const listeners = statusListeners.get(conversation_id) ?? new Set<(status: AcpConfigSetStatus) => void>();
  listeners.add(listener);
  statusListeners.set(conversation_id, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) statusListeners.delete(conversation_id);
  };
}

const ensureRuntimeConfigOptions: AcpConfigOptionsLoader = async (conversation_id: string) =>
  (await ensureConversationRuntime(conversation_id)).config_options;

const configOptionsInFlight = new Map<string, Promise<AcpConfigOptionDto[] | null>>();

function fetchConfigOptionsOnce(
  key: AcpConfigOptionsKey,
  loadConfigOptions: AcpConfigOptionsLoader
): Promise<AcpConfigOptionDto[] | null> {
  const [, conversation_id] = key;
  const existing = configOptionsInFlight.get(conversation_id);
  if (existing) return existing;

  const promise = loadConfigOptions(conversation_id)
    .then((options) => options ?? null)
    .finally(() => {
      if (configOptionsInFlight.get(conversation_id) === promise) {
        configOptionsInFlight.delete(conversation_id);
      }
    });
  configOptionsInFlight.set(conversation_id, promise);
  return promise;
}

export function useAcpConfigOptions({
  conversation_id,
  prepareRuntime,
  prepareSetRuntime,
  loadConfigOptions = ensureRuntimeConfigOptions,
  enabled = true,
}: {
  conversation_id: string;
  prepareRuntime?: () => Promise<void>;
  prepareSetRuntime?: () => Promise<void>;
  loadConfigOptions?: AcpConfigOptionsLoader;
  enabled?: boolean;
}) {
  const [setStatus, setSetStatus] = useState<AcpConfigSetStatus>(() => getConversationSetStatus(conversation_id));
  const [isReloading, setIsReloading] = useState(false);
  const optionsRef = useRef<AcpConfigOptionDto[] | null>(null);
  const key = useMemo(() => getRuntimeConfigOptionsKey(conversation_id), [conversation_id]);
  const {
    data: snapshotData,
    mutate,
    isLoading,
  } = useSWR<AcpConfigOptionDto[] | null, unknown, AcpConfigOptionsKey | null>(
    enabled ? key : null,
    (runtimeKey) => fetchConfigOptionsOnce(runtimeKey, loadConfigOptions),
    {
      revalidateOnMount: false,
    }
  );
  const configOptions = enabled ? (snapshotData ?? null) : null;

  useEffect(() => {
    optionsRef.current = configOptions;
  }, [configOptions]);

  useEffect(() => {
    setSetStatus(getConversationSetStatus(conversation_id));
    return subscribeConversationSetStatus(conversation_id, setSetStatus);
  }, [conversation_id]);

  const replaceSnapshot = useCallback(
    (next: AcpConfigOptionDto[]) => {
      const merged = mergeSnapshotPreservingKnownCurrents(optionsRef.current, next);
      optionsRef.current = merged;
      void mutate(merged, false);
    },
    [mutate]
  );

  const reload = useCallback(async () => {
    setIsReloading(true);
    try {
      await prepareRuntime?.();
      const next = await fetchConfigOptionsOnce(key, loadConfigOptions);
      if (next) replaceSnapshot(next);
      setIsReloading(false);
      return next;
    } catch (error) {
      setIsReloading(false);
      throw error;
    }
  }, [key, loadConfigOptions, prepareRuntime, replaceSnapshot]);

  const setConfigOption = useCallback(
    async (optionId: string, value: string) => {
      if (getConversationSetStatus(conversation_id).state === 'setting') {
        throw new Error('config_update_in_progress');
      }
      setConversationSetStatus(conversation_id, { state: 'setting', optionId, requestedValue: value });
      try {
        await (prepareSetRuntime ?? prepareRuntime)?.();
        const beforeSet = await fetchConfigOptionsOnce(key, loadConfigOptions);
        if (beforeSet) replaceSnapshot(beforeSet);
        const response = await ipcBridge.acpConversation.setConfigOption.invoke({
          conversation_id,
          option_id: optionId,
          value,
        });
        const confirmation = response.confirmation;
        if (!hasObservedValue(response, optionId, value)) {
          throw new Error(confirmation === 'command_ack' ? 'command_ack' : 'config_not_observed');
        }
        replaceSnapshot(response.config_options);
        return response.config_options;
      } finally {
        setConversationSetStatus(conversation_id, { state: 'idle' });
      }
    },
    [conversation_id, key, loadConfigOptions, prepareRuntime, prepareSetRuntime, replaceSnapshot]
  );

  useEffect(() => {
    if (!enabled) return;
    void reload().catch(() => {});
  }, [enabled, reload]);

  useEffect(() => {
    if (!enabled) return;
    const handler = (message: IResponseMessage) => {
      if (message.conversation_id !== conversation_id) return;
      if (message.type === 'acp_config_option' && message.data) {
        const optionPayload = message.data as { config_options?: AcpConfigOptionDto[] } | AcpConfigOptionDto[];
        const next = Array.isArray(optionPayload) ? optionPayload : optionPayload.config_options;
        if (Array.isArray(next)) replaceSnapshot(next);
      }
      if (message.type === 'agent_status') {
        const statusPayload = message.data as { status?: string } | undefined;
        if (statusPayload?.status === 'session_active') void reload().catch(() => {});
      }
    };
    return ipcBridge.acpConversation.responseStream.on(handler);
  }, [conversation_id, enabled, reload, replaceSnapshot]);

  return {
    configOptions,
    isLoading: enabled && !configOptions && (isLoading || isReloading),
    setStatus,
    mode: deriveSelectOption(configOptions, 'mode', ['mode']),
    model: deriveSelectOption(configOptions, 'model', ['model']),
    thoughtLevel: deriveSelectOption(configOptions, 'thought_level', THOUGHT_LEVEL_FALLBACK_IDS),
    reload,
    setConfigOption,
  };
}
