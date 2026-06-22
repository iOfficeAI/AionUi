/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { AcpConfigOptionDto, AcpModelInfo } from '@/common/types/platform/acpTypes';
import { type AcpConfigSetStatus, type AcpDerivedOption, useAcpConfigOptions } from './useAcpConfigOptions';
import { useCallback, useEffect, useMemo, useState } from 'react';

type UseAcpModelInfoArgs = {
  conversation_id: string;
  backend?: string;
  initialModelId?: string;
  prepareRuntime?: () => Promise<void>;
  enabled?: boolean;
  onSelectModelSuccess?: (model_id: string) => void;
  onSelectModelFailed?: (model_id: string, error: unknown) => void;
};

export type UseAcpModelInfoResult = {
  model_info: AcpModelInfo | null;
  canSwitch: boolean;
  isSetting: boolean;
  selectModel: (model_id: string) => void;
  thoughtLevel: AcpDerivedOption | null;
  setStatus: AcpConfigSetStatus;
  setConfigOption: (optionId: string, value: string) => Promise<AcpConfigOptionDto[]>;
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
      return other?.id === item.id && other.label === item.label;
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
  enabled = true,
  onSelectModelSuccess,
  onSelectModelFailed,
}: UseAcpModelInfoArgs): UseAcpModelInfoResult => {
  const { model, thoughtLevel, setStatus, setConfigOption } = useAcpConfigOptions({
    conversation_id,
    prepareRuntime,
    enabled,
  });
  const [legacyModelInfo, setLegacyModelInfo] = useState<AcpModelInfo | null>(null);

  const configModelInfo = useMemo<AcpModelInfo | null>(() => {
    if (!model) return null;
    const currentModelId = model.currentValue || initialModelId || null;
    return {
      current_model_id: currentModelId,
      current_model_label: model.options.find((item) => item.value === currentModelId)?.label || currentModelId || null,
      available_models: model.options.map((item) => ({ id: item.value, label: item.label })),
    };
  }, [initialModelId, model]);

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

  const model_info = configModelInfo ?? legacyModelInfo;

  const selectModel = useCallback(
    (model_id: string) => {
      if (!enabled || !model) return;
      void setConfigOption(model.id, model_id)
        .then(async () => {
          onSelectModelSuccess?.(model_id);
        })
        .catch((error) => {
          onSelectModelFailed?.(model_id, error);
        });
    },
    [enabled, model, onSelectModelFailed, onSelectModelSuccess, setConfigOption]
  );

  return {
    model_info,
    canSwitch: Boolean(configModelInfo && configModelInfo.available_models.length > 0),
    isSetting: setStatus.state === 'setting' && setStatus.optionId === model?.id,
    selectModel,
    thoughtLevel,
    setStatus,
    setConfigOption,
  };
};
