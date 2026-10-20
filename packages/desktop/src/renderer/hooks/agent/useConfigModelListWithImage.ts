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

      // Ensure known image providers have a usable fallback model.
      if (nextPlatform.platform === 'gemini' && (!nextPlatform.base_url || nextPlatform.base_url.trim() === '')) {
        // Keep the current recommended Gemini image model available even when
        // the provider's cached model list does not include image models yet.
        const hasGeminiImage = nextPlatform.models.some(
          (m) => m.includes('gemini') && (m.includes('image') || m.includes('imagine'))
        );
        if (!hasGeminiImage) {
          nextPlatform.models = nextPlatform.models.concat(['gemini-3.1-flash-image']);
        }
      } else if (
        nextPlatform.platform === 'OpenRouter' &&
        nextPlatform.base_url &&
        nextPlatform.base_url.includes('openrouter.ai')
      ) {
        // Keep the current OpenRouter Gemini image model available when model
        // discovery has not returned an image model yet.
        const hasOpenRouterImage = nextPlatform.models.some((m) => m.includes('image') || m.includes('imagine'));
        if (!hasOpenRouterImage) {
          nextPlatform.models = nextPlatform.models.concat(['google/gemini-3.1-flash-image']);
        }
      } else if (platformLower.includes('antigravity') && !hasImageModel) {
        // AntigravityTools platform: add common image models
        nextPlatform.models = nextPlatform.models.concat(['gemini-3-pro-image-1x1']);
      }

      return nextPlatform;
    });
  }, [data]);

  return {
    modelListWithImage,
  };
};

export default useConfigModelListWithImage;
