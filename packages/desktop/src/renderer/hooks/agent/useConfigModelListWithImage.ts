import { useMemo } from 'react';
import { MINIMAX_DEFAULT_IMAGE_MODEL } from '@/common/config/constants';
import { isMinimaxImageApiHost } from '@/common/utils/imageModelAllowlist';
import { useProvidersQuery } from './useModelProviderList';

const useConfigModelListWithImage = () => {
  const { data } = useProvidersQuery();

  const modelListWithImage = useMemo(() => {
    return (data || []).map((platform) => {
      const nextPlatform = {
        ...platform,
        models: [...platform.models],
      };
      const platformLower = platform.platform?.toLowerCase() || '';
      const hasImageModel = nextPlatform.models.some((m) => {
        const name = m.toLowerCase();
        return name.includes('image') || name.includes('imagine');
      });

      // 根据不同平台确保有对应的图像模型
      if (nextPlatform.platform === 'gemini' && (!nextPlatform.base_url || nextPlatform.base_url.trim() === '')) {
        // 原生 Google Gemini 平台（base_url 为空）至少要有 gemini-2.5-flash-image-preview
        const hasGeminiImage = nextPlatform.models.some(
          (m) => m.includes('gemini') && (m.includes('image') || m.includes('imagine'))
        );
        if (!hasGeminiImage) {
          nextPlatform.models = nextPlatform.models.concat(['gemini-2.5-flash-image-preview']);
        }
      } else if (
        nextPlatform.platform === 'OpenRouter' &&
        nextPlatform.base_url &&
        nextPlatform.base_url.includes('openrouter.ai')
      ) {
        // 官方 OpenRouter 平台（base_url 包含 openrouter.ai）至少要有免费图像模型
        const hasOpenRouterImage = nextPlatform.models.some((m) => m.includes('image') || m.includes('imagine'));
        if (!hasOpenRouterImage) {
          nextPlatform.models = nextPlatform.models.concat(['google/gemini-2.5-flash-image-preview']);
        }
      } else if (platformLower.includes('antigravity') && !hasImageModel) {
        // AntigravityTools 平台：添加常用图像模型
        // AntigravityTools platform: add common image models
        nextPlatform.models = nextPlatform.models.concat(['gemini-3-pro-image-1x1']);
      } else if (isMinimaxImageApiHost(nextPlatform.base_url) && !hasImageModel) {
        // MiniMax 平台：图像模型不在对话模型列表里返回，补上默认图像模型
        // MiniMax platform: image models are not returned by the chat model list,
        // so the default image model is supplemented here
        nextPlatform.models = nextPlatform.models.concat([MINIMAX_DEFAULT_IMAGE_MODEL]);
      }

      return nextPlatform;
    });
  }, [data]);

  return {
    modelListWithImage,
  };
};

export default useConfigModelListWithImage;
