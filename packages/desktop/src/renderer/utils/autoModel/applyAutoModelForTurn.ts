/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IProvider, TChatConversation, TProviderWithModel } from '@/common/config/storage';
import {
  decideAutoModelPhase,
  readAutoModelSettings,
  resolveAutoModel,
  type AutoModelPhase,
} from '@/renderer/utils/autoModel';

export type ApplyAutoModelForTurnInput = {
  conversationId: string;
  userInput: string;
  hasPriorUserTurns: boolean;
  consecutiveWorkerFailures?: number;
  currentModel: TProviderWithModel | undefined;
  providers: IProvider[];
  getAvailableModels: (provider: IProvider) => string[];
  /** Same-provider hot-swap via config-options/model. */
  setConfigOption: (optionId: string, value: string) => Promise<unknown>;
  /** Persist conversation.model + extra.auto_model (merge). Returns false on failure. */
  persistModel: (model: TProviderWithModel, phase: AutoModelPhase) => Promise<boolean>;
};

export type ApplyAutoModelForTurnResult = {
  phase: AutoModelPhase;
  model: TProviderWithModel;
  hotSwapped: boolean;
};

/**
 * Resolve Auto phase model for this turn and apply it.
 * Same provider → config-option hot-swap + persist (no stop).
 * Cross provider → persist only (Core may rebuild); caller should still send.
 */
export const applyAutoModelForTurn = async (
  input: ApplyAutoModelForTurnInput
): Promise<ApplyAutoModelForTurnResult> => {
  const phase = decideAutoModelPhase({
    hasPriorUserTurns: input.hasPriorUserTurns,
    userInput: input.userInput,
    consecutiveWorkerFailures: input.consecutiveWorkerFailures,
  });
  const resolved = resolveAutoModel({
    phase,
    settings: readAutoModelSettings(),
    providers: input.providers,
    getAvailableModels: input.getAvailableModels,
  });
  const model = resolved.model;
  const sameProvider = Boolean(input.currentModel?.id && input.currentModel.id === model.id);
  const modelName = model.use_model;
  const alreadyOnModel = sameProvider && input.currentModel?.use_model === modelName;

  if (sameProvider && !alreadyOnModel) {
    try {
      await input.setConfigOption('model', modelName);
    } catch (error) {
      // Older Core builds reject aionrs `model` config options — fall through to
      // conversation.update persistence (may rebuild until Core hot-swap lands).
      console.warn('[applyAutoModelForTurn] model hot-swap unavailable, persisting only:', error);
    }
  }

  const ok = await input.persistModel(model, phase);
  if (!ok) {
    throw new Error('Failed to persist Auto model for turn');
  }

  return { phase, model, hotSwapped: sameProvider && !alreadyOnModel };
};

export const persistAutoModelConversationState = async (
  conversationId: string,
  model: TProviderWithModel,
  phase: AutoModelPhase
): Promise<boolean> => {
  return Boolean(
    await ipcBridge.conversation.update.invoke({
      id: conversationId,
      updates: {
        model,
        extra: {
          auto_model: {
            enabled: true,
            phase,
            last_resolved: {
              provider_id: model.id,
              model: model.use_model,
              slot: phase,
            },
          },
        } as TChatConversation['extra'],
      },
      merge_extra: true,
    })
  );
};
