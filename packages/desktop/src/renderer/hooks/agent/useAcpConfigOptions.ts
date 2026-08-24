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
import {
  getConversationRuntimeViewSnapshot,
  subscribeConversationRuntimeView,
} from '@/renderer/pages/conversation/runtime/conversationRuntimeViewStore';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
    // All three mean "the runtime cannot take this change yet, try again":
    // a config update already in flight, a member runtime still starting, or a
    // runtime mid-restart. Matched by CODE only — never by message text, which
    // is free to be reworded or localized.
    if (
      error.code === 'config_update_in_progress' ||
      error.code === 'TEAM_MEMBER_RUNTIME_STARTING' ||
      error.code === 'runtime_restarting'
    ) {
      return 'config_update_in_progress';
    }
  }
  return 'unknown';
}

type AcpConfigOptionsKey = readonly ['acp-config-options', string];

const getRuntimeConfigOptionsKey = (conversation_id: string): AcpConfigOptionsKey =>
  ['acp-config-options', conversation_id] as const;

export function revalidateAcpConfigOptions(conversation_id: string): Promise<AcpConfigOptionDto[] | null | undefined> {
  return swrMutate(getRuntimeConfigOptionsKey(conversation_id));
}

export type AcpConfigOptionLoad = (conversation_id: string) => Promise<AcpConfigOptionDto[] | null | undefined>;

export type AcpConfigOptionSetter = (
  conversation_id: string,
  option_id: string,
  value: string
) => Promise<SetConfigOptionResponse>;

export type AcpConfigOptionBlocker = (conversation_id: string, option_id: string, category: string) => boolean;

/**
 * How a conversation's runtime config options are read, written, and gated.
 *
 * An object rather than a callable with properties bolted on: this carries a
 * write (`setConfigOption`) and a policy decision (`isConfigOptionBlocked`), not
 * just a load, so a bare "loader" function was the wrong shape for it. Team
 * members supply their own implementation so their config traffic goes through
 * the team API instead of the per-conversation one.
 */
export type AcpConfigOptionsPort = {
  load: AcpConfigOptionLoad;
  /** Overrides the per-conversation setter. Team members route through the team API. */
  setConfigOption?: AcpConfigOptionSetter;
  /** Reports an option as temporarily not settable (e.g. runtime still starting). */
  isConfigOptionBlocked?: AcpConfigOptionBlocker;
};

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

/**
 * Values the backend ACCEPTED but has not applied yet, keyed by option id.
 *
 * Conversation-scoped and shared exactly like `setStatus`, so every selector mounted on
 * the same conversation (send box, mobile action sheet) agrees on what is pending.
 *
 * Cleared when the confirmation lands — the pump pushes an `acp_config_option` frame once
 * the agent really applies the value, and the snapshot it carries resolves the entry.
 */
const pendingByConversation = new Map<string, Record<string, string>>();
const pendingListeners = new Map<string, Set<(pending: Record<string, string>) => void>>();

const EMPTY_PENDING: Record<string, string> = {};

function getConversationPending(conversation_id: string): Record<string, string> {
  return pendingByConversation.get(conversation_id) ?? EMPTY_PENDING;
}

function setConversationPending(conversation_id: string, pending: Record<string, string>): void {
  if (Object.keys(pending).length === 0) pendingByConversation.delete(conversation_id);
  else pendingByConversation.set(conversation_id, pending);
  const next = getConversationPending(conversation_id);
  pendingListeners.get(conversation_id)?.forEach((listener) => listener(next));
}

function markPending(conversation_id: string, optionId: string, value: string): void {
  setConversationPending(conversation_id, { ...getConversationPending(conversation_id), [optionId]: value });
}

/** Drop any pending entry whose value the snapshot now reports as current. */
function resolvePendingFromSnapshot(conversation_id: string, options: AcpConfigOptionDto[]): void {
  const pending = getConversationPending(conversation_id);
  const ids = Object.keys(pending);
  if (ids.length === 0) return;
  const next = { ...pending };
  let changed = false;
  for (const id of ids) {
    const option = options.find((candidate) => candidate.id === id);
    if (option && getOptionCurrentValue(option) === pending[id]) {
      delete next[id];
      changed = true;
    }
  }
  if (changed) setConversationPending(conversation_id, next);
}

function subscribeConversationPending(
  conversation_id: string,
  listener: (pending: Record<string, string>) => void
): () => void {
  const listeners = pendingListeners.get(conversation_id) ?? new Set<(pending: Record<string, string>) => void>();
  listeners.add(listener);
  pendingListeners.set(conversation_id, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) pendingListeners.delete(conversation_id);
  };
}

/** Default port: talks to the conversation's own runtime. */
const conversationConfigOptionsPort: AcpConfigOptionsPort = {
  load: async (conversation_id: string) => (await ensureConversationRuntime(conversation_id)).config_options,
};

const configOptionsInFlight = new Map<string, Promise<AcpConfigOptionDto[] | null>>();

function fetchConfigOptionsOnce(
  key: AcpConfigOptionsKey,
  port: AcpConfigOptionsPort
): Promise<AcpConfigOptionDto[] | null> {
  const [, conversation_id] = key;
  const existing = configOptionsInFlight.get(conversation_id);
  if (existing) return existing;

  const promise = port
    .load(conversation_id)
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
  configOptionsPort = conversationConfigOptionsPort,
  enabled = true,
}: {
  conversation_id: string;
  prepareRuntime?: () => Promise<void>;
  prepareSetRuntime?: () => Promise<void>;
  configOptionsPort?: AcpConfigOptionsPort;
  enabled?: boolean;
}) {
  const [setStatus, setSetStatus] = useState<AcpConfigSetStatus>(() => getConversationSetStatus(conversation_id));
  const [pendingValues, setPendingValues] = useState<Record<string, string>>(() =>
    getConversationPending(conversation_id)
  );
  const [isReloading, setIsReloading] = useState(false);
  const runtimeIdentity = enabled ? conversation_id : null;
  const runtimeIdentityRef = useRef(runtimeIdentity);
  const runtimeGenerationRef = useRef(0);
  if (runtimeIdentityRef.current !== runtimeIdentity) {
    runtimeIdentityRef.current = runtimeIdentity;
    runtimeGenerationRef.current += 1;
  }
  const [loadedRuntimeGeneration, setLoadedRuntimeGeneration] = useState<number | null>(null);
  const optionsRef = useRef<AcpConfigOptionDto[] | null>(null);
  const getRuntimeSnapshot = useCallback(() => getConversationRuntimeViewSnapshot(conversation_id), [conversation_id]);
  const runtimeView = useSyncExternalStore(subscribeConversationRuntimeView, getRuntimeSnapshot, getRuntimeSnapshot);
  const key = useMemo(() => getRuntimeConfigOptionsKey(conversation_id), [conversation_id]);
  const {
    data: snapshotData,
    mutate,
    isLoading,
  } = useSWR<AcpConfigOptionDto[] | null, unknown, AcpConfigOptionsKey | null>(
    enabled ? key : null,
    (runtimeKey) => fetchConfigOptionsOnce(runtimeKey, configOptionsPort),
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

  useEffect(() => {
    setPendingValues(getConversationPending(conversation_id));
    return subscribeConversationPending(conversation_id, setPendingValues);
  }, [conversation_id]);

  const replaceSnapshot = useCallback(
    (next: AcpConfigOptionDto[]) => {
      optionsRef.current = next;
      void mutate(next, false);
    },
    [mutate]
  );

  const isConfigOptionBlocked = useCallback(
    (optionId: string) => {
      if (runtimeView.state === 'restarting') return true;
      const option = optionsRef.current?.find((candidate) => candidate.id === optionId);
      return Boolean(
        configOptionsPort.isConfigOptionBlocked?.(conversation_id, optionId, option?.category ?? optionId)
      );
    },
    [conversation_id, configOptionsPort, runtimeView.state]
  );

  const reload = useCallback(async () => {
    const runtimeGeneration = runtimeGenerationRef.current;
    setIsReloading(true);
    try {
      await prepareRuntime?.();
      const next = await fetchConfigOptionsOnce(key, configOptionsPort);
      if (next) {
        replaceSnapshot(next);
        if (runtimeGenerationRef.current === runtimeGeneration) {
          setLoadedRuntimeGeneration(runtimeGeneration);
        }
      }
      setIsReloading(false);
      return next;
    } catch (error) {
      setIsReloading(false);
      throw error;
    }
  }, [key, configOptionsPort, prepareRuntime, replaceSnapshot]);

  const setConfigOption = useCallback(
    async (optionId: string, value: string) => {
      if (getConversationSetStatus(conversation_id).state === 'setting' || isConfigOptionBlocked(optionId)) {
        throw new Error('config_update_in_progress');
      }
      setConversationSetStatus(conversation_id, { state: 'setting', optionId, requestedValue: value });
      try {
        await (prepareSetRuntime ?? prepareRuntime)?.();
        if (isConfigOptionBlocked(optionId)) throw new Error('config_update_in_progress');
        const beforeSet = await fetchConfigOptionsOnce(key, configOptionsPort);
        if (beforeSet) replaceSnapshot(beforeSet);
        if (isConfigOptionBlocked(optionId)) throw new Error('config_update_in_progress');
        const response = configOptionsPort.setConfigOption
          ? await configOptionsPort.setConfigOption(conversation_id, optionId, value)
          : await ipcBridge.acpConversation.setConfigOption.invoke({
              conversation_id,
              option_id: optionId,
              value,
            });
        const confirmation = response.confirmation;
        // Accepted, but the agent applies it only from the next turn. NOT an error: the
        // request landed, it just is not governing yet. Record it as pending so the
        // picker can show the target alongside the mode still in force, and keep the
        // snapshot the backend returned — which deliberately still reports the OLD value.
        if (confirmation === 'pending_next_turn') {
          markPending(conversation_id, optionId, value);
          if (response.config_options) replaceSnapshot(response.config_options);
          return response.config_options;
        }
        if (!hasObservedValue(response, optionId, value)) {
          throw new Error(confirmation === 'command_ack' ? 'command_ack' : 'config_not_observed');
        }
        // A switch that landed supersedes any pending entry for the same option.
        resolvePendingFromSnapshot(conversation_id, response.config_options);
        replaceSnapshot(response.config_options);
        return response.config_options;
      } finally {
        setConversationSetStatus(conversation_id, { state: 'idle' });
      }
    },
    [conversation_id, isConfigOptionBlocked, key, configOptionsPort, prepareRuntime, prepareSetRuntime, replaceSnapshot]
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
        if (Array.isArray(next)) {
          // This frame is the agent's own confirmation (the pump re-projects the whole
          // snapshot when it sees `ConfigChanged`), so anything it now reports as current
          // is no longer pending.
          resolvePendingFromSnapshot(conversation_id, next);
          replaceSnapshot(next);
        }
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
    isRuntimeReady: enabled && loadedRuntimeGeneration === runtimeGenerationRef.current,
    isLoading: enabled && !configOptions && (isLoading || isReloading),
    setStatus,
    pendingValues,
    mode: deriveSelectOption(configOptions, 'mode', ['mode']),
    model: deriveSelectOption(configOptions, 'model', ['model']),
    thoughtLevel: deriveSelectOption(configOptions, 'thought_level', ['thought_level', 'reasoning_effort']),
    reload,
    setConfigOption,
    isConfigOptionBlocked,
  };
}
