/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { AcpConfigOptionDto, AcpModelInfo } from '@/common/types/platform/acpTypes';
import {
  type AcpConfigOptionsPort,
  type AcpConfigSetStatus,
  type AcpDerivedOption,
  useAcpConfigOptions,
} from './useAcpConfigOptions';
import { useCallback, useEffect, useMemo, useState } from 'react';

type UseAcpModelInfoArgs = {
  conversation_id: string;
  backend?: string;
  initialModelId?: string;
  prepareRuntime?: () => Promise<void>;
  prepareSetRuntime?: () => Promise<void>;
  configOptionsPort?: AcpConfigOptionsPort;
  enabled?: boolean;
  onSelectModelSuccess?: (model_id: string) => void;
  onSelectModelFailed?: (model_id: string, error: unknown) => void;
};

export type UseAcpModelInfoResult = {
  model_info: AcpModelInfo | null;
  isRuntimeReady: boolean;
  canSwitch: boolean;
  isLoading: boolean;
  isSetting: boolean;
  selectModel: (model_id: string) => void;
  thoughtLevel: AcpDerivedOption | null;
  setStatus: AcpConfigSetStatus;
  setConfigOption: (optionId: string, value: string) => Promise<AcpConfigOptionDto[]>;
  isConfigOptionBlocked: (optionId: string) => boolean;
};

function sameModelInfo(a: AcpModelInfo | null, b: AcpModelInfo | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.current_model_id === b.current_model_id &&
    a.current_model_label === b.current_model_label &&
    a.available_models.length === b.available_models.length &&
    a.available_models.every((item, index) => {
      const other = b.available_models[index];
      return other?.id === item.id && other.label === item.label && other.description === item.description;
    })
  );
}

function normalizeInitialModel(info: AcpModelInfo, initialModelId?: string): AcpModelInfo {
  if (!initialModelId || info.current_model_id) return info;
  const match = info.available_models.find((model) => model.id === initialModelId);
  if (!match) return info;
  return {
    ...info,
    current_model_id: initialModelId,
    current_model_label: match.label || initialModelId,
  };
}

export const useAcpModelInfo = ({
  conversation_id,
  backend: _backend,
  initialModelId,
  prepareRuntime,
  prepareSetRuntime,
  configOptionsPort,
  enabled = true,
  onSelectModelSuccess,
  onSelectModelFailed,
}: UseAcpModelInfoArgs): UseAcpModelInfoResult => {
  const runtimeConfig = useAcpConfigOptions({
    conversation_id,
    prepareRuntime,
    prepareSetRuntime,
    configOptionsPort,
    enabled,
  });
  const { model, thoughtLevel, setStatus, setConfigOption, isLoading } = runtimeConfig;
  const isConfigOptionBlocked = runtimeConfig.isConfigOptionBlocked ?? (() => false);
  const [legacyModelInfo, setLegacyModelInfo] = useState<AcpModelInfo | null>(null);

  const configModelInfo = useMemo<AcpModelInfo | null>(() => {
    if (!model) return null;
    const currentModelId = model.currentValue || initialModelId || null;
    return {
      current_model_id: currentModelId,
      current_model_label: model.options.find((item) => item.value === currentModelId)?.label || currentModelId || null,
      available_models: model.options.map((item) => ({
        id: item.value,
        label: item.label,
        description: item.description ?? undefined,
      })),
    };
  }, [initialModelId, model]);
  const persistedModelInfo = useMemo<AcpModelInfo | null>(() => {
    if (!initialModelId) return null;
    return {
      current_model_id: initialModelId,
      current_model_label: initialModelId,
      available_models: [],
    };
  }, [initialModelId]);

  useEffect(() => {
    if (!enabled) {
      setLegacyModelInfo(null);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const handler = (message: IResponseMessage) => {
      if (message.conversation_id !== conversation_id) return;
      if (message.type === 'acp_model_info' && message.data) {
        const incoming = normalizeInitialModel(message.data as AcpModelInfo, initialModelId);
        setLegacyModelInfo((previous) => (sameModelInfo(previous, incoming) ? previous : incoming));
      } else if (message.type === 'codex_model_info' && message.data) {
        const data = message.data as { model?: string };
        if (!data.model) return;
        const incoming: AcpModelInfo = {
          current_model_id: data.model,
          current_model_label: data.model,
          available_models: [],
        };
        setLegacyModelInfo((previous) => (sameModelInfo(previous, incoming) ? previous : incoming));
      }
    };
    return ipcBridge.acpConversation.responseStream.on(handler);
  }, [conversation_id, enabled, initialModelId]);

  const model_info = configModelInfo ?? legacyModelInfo ?? persistedModelInfo;

  const selectModel = useCallback(
    (model_id: string) => {
      if (!enabled || !model) return;
      // Only the switch itself decides success/failure. The rejection handler is
      // passed to `then` rather than chained as `catch` so it can ONLY see a
      // failure from `setConfigOption` — never one from `onSelectModelSuccess`.
      // Once the runtime has switched, reporting a failure would tell the user
      // the opposite of what happened.
      void setConfigOption(model.id, model_id)
        .then(
          () => onSelectModelSuccess?.(model_id),
          (error) => onSelectModelFailed?.(model_id, error)
        )
        // Best-effort: swallow anything the callbacks themselves throw. It cannot
        // change the outcome of a switch that already landed, and letting it
        // escape would surface as an unhandled rejection.
        .catch(() => {});
    },
    [enabled, model, onSelectModelFailed, onSelectModelSuccess, setConfigOption]
  );

  return {
    model_info,
    isRuntimeReady: runtimeConfig.isRuntimeReady,
    canSwitch: Boolean(
      configModelInfo && configModelInfo.available_models.length > 0 && model && !isConfigOptionBlocked(model.id)
    ),
    isLoading: !model_info && isLoading,
    isSetting: setStatus.state === 'setting' && setStatus.optionId === model?.id,
    selectModel,
    thoughtLevel,
    setStatus,
    setConfigOption,
    isConfigOptionBlocked,
  };
};
