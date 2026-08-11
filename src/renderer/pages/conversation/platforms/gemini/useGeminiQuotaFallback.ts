import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import type { GeminiModeOption } from '@/renderer/hooks/agent/useModeModeList';
import { isApiErrorMessage, isQuotaErrorMessage } from '@/renderer/utils/model/errorDetection';
import { resolveFallbackTarget } from '@/renderer/utils/model/modelFallback';
import { Message } from '@arco-design/web-react';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

type UseGeminiQuotaFallbackParams = {
  currentModel: TProviderWithModel | undefined;
  providers: IProvider[];
  geminiModeLookup: Map<string, GeminiModeOption>;
  getAvailableModels: (provider: IProvider) => string[];
  handleSelectModel: (provider: IProvider, modelName: string) => Promise<void>;
};

/**
 * Handles quota-exceeded errors by auto-switching to a fallback model.
 * Returns a callback suitable for passing to useGeminiMessage's onError param.
 */
export const useGeminiQuotaFallback = ({
  currentModel,
  providers,
  geminiModeLookup,
  getAvailableModels,
  handleSelectModel,
}: UseGeminiQuotaFallbackParams) => {
  const { t } = useTranslation();
  const quotaPromptedRef = useRef<string | null>(null);
  const exhaustedModelsRef = useRef(new Set<string>());

  const handleGeminiError = useCallback(
    (message: IResponseMessage) => {
      // Handle quota-like capacity errors first. Some providers return them as HTTP 403
      // while still being recoverable by switching to another configured model.
      const isQuotaError = isQuotaErrorMessage(message.data);
      if (!isQuotaError) {
        if (isApiErrorMessage(message.data)) {
          console.info('API error detected. Not triggering agent detection.');
        }
        return;
      }
      const msgId = message.msg_id || 'unknown';
      if (quotaPromptedRef.current === msgId) return;
      quotaPromptedRef.current = msgId;

      if (currentModel?.useModel) {
        exhaustedModelsRef.current.add(currentModel.useModel);
      }
      const fallbackTarget = resolveFallbackTarget({
        currentModel,
        providers,
        geminiModeLookup,
        getAvailableModels,
        exhaustedModels: exhaustedModelsRef.current,
      });
      if (!fallbackTarget || !currentModel || fallbackTarget.model === currentModel.useModel) {
        Message.warning(
          t('conversation.chat.quotaExceededNoFallback', {
            defaultValue: 'Model quota reached. Please switch to another available model.',
          })
        );
        return;
      }

      void handleSelectModel(fallbackTarget.provider, fallbackTarget.model).then(() => {
        Message.success(
          t('conversation.chat.quotaSwitched', {
            defaultValue: `Switched to ${fallbackTarget.model}.`,
            model: fallbackTarget.model,
          })
        );
      });
    },
    [currentModel, providers, geminiModeLookup, getAvailableModels, handleSelectModel, t]
  );

  return { handleGeminiError };
};
