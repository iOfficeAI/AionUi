import { useMemo } from 'react';
import useSWR from 'swr';
import { ipcBridge } from '../../common';

const useConfigModelListWithImage = () => {
  const { data } = useSWR('configModelListWithImage', () => {
    return ipcBridge.mode.getModelConfig.invoke();
  });

  const modelListWithImage = useMemo(() => {
    return (data || []).map((platform) => {
      // 根据不同平台确保有对应的图像模型
      if (platform.platform === 'gemini' && (!platform.baseUrl || platform.baseUrl.trim() === '')) {
        // 原生 Google Gemini 平台（baseUrl 为空）至少要有 gemini-2.5-flash-image-preview
        const hasGeminiImage = platform.model.some((m) => m.includes('gemini') && m.includes('image'));
        if (!hasGeminiImage) {
          platform.model = platform.model.concat(['gemini-2.5-flash-image-preview']);
        }
      } else if (platform.platform === 'OpenRouter' && platform.baseUrl && platform.baseUrl.includes('openrouter.ai')) {
        // 官方 OpenRouter 平台（baseUrl 包含 openrouter.ai）至少要有免费图像模型
        const hasOpenRouterImage = platform.model.some((m) => m.includes('image'));
        if (!hasOpenRouterImage) {
          platform.model = platform.model.concat(['google/gemini-2.5-flash-image-preview']);
        }
      }

      return platform;
    });
  }, [data]);

  return {
    modelListWithImage,
  };
};

export default useConfigModelListWithImage;
