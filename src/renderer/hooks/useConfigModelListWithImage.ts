import { useMemo } from 'react';
import useSWR from 'swr';
import { ipcBridge } from '../../common';

const useConfigModelListWithImage = () => {
  const { data } = useSWR('configModelListWithImage', async () => {
    return ipcBridge.mode.getModelConfig.invoke();
  });

  const modelListWithImage = useMemo(() => {
    return (data || []).map((platform) => {
      if (platform.platform !== 'OpenRouter') return platform;
      const hasFreeImage = platform.model.some((m) => m.includes('image') && m.includes('free'));
      if (hasFreeImage) return platform;
      platform.model = platform.model.concat(['google/gemini-2.5-flash-image-preview:free']);
      return platform;
    });
  }, [data]);

  return {
    modelListWithImage,
  };
};

export default useConfigModelListWithImage;
