import { useMemo } from 'react';
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

      if (nextPlatform.platform === 'gemini' && (!nextPlatform.base_url || nextPlatform.base_url.trim() === '')) {
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
        const hasOpenRouterImage = nextPlatform.models.some((m) => m.includes('image') || m.includes('imagine'));
        if (!hasOpenRouterImage) {
          nextPlatform.models = nextPlatform.models.concat(['google/gemini-2.5-flash-image-preview']);
        }
      } else if (platformLower.includes('antigravity') && !hasImageModel) {
        nextPlatform.models = nextPlatform.models.concat(['gemini-3-pro-image-1x1']);
      } else if (platformLower.includes('dashscope') && !hasImageModel) {
        nextPlatform.models = nextPlatform.models.concat(['wanx2.2-t2i-turbo']);
      }

      return nextPlatform;
    });
  }, [data]);

  return {
    modelListWithImage,
  };
};

export default useConfigModelListWithImage;
