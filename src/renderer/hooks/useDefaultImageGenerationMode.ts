import { ConfigStorage } from '@/common/storage';
import { Message } from '@arco-design/web-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import useConfigModelListWithImage from './useConfigModelListWithImage';

const useDefaultImageGenerationMode = (defaultSetting = true) => {
  const [message, contextHolder] = Message.useMessage();
  const { t } = useTranslation();
  const { modelListWithImage } = useConfigModelListWithImage();
  const updateDefaultImageGenerationMode = async () => {
    try {
      const config = await ConfigStorage.get('tools.imageGenerationModel');
      if (config?.useModel) {
        return;
      }
      throw new Error('No image generation model found');
    } catch (e) {
      for (const platform of modelListWithImage) {
        const { model, ...other } = platform;
        for (const m of model) {
          if (other.platform.includes('OpenRouter') && m.includes('image') && m.includes('free')) {
            await ConfigStorage.set('tools.imageGenerationModel', { useModel: m, ...other, switch: true });
            message.info(t('messages.imageGenerationModelDetected', { platform: other.platform, model: m }));
            return;
          }
        }
      }
    }
  };
  useEffect(() => {
    if (modelListWithImage?.length > 0 && defaultSetting) {
      updateDefaultImageGenerationMode();
    }
  }, [modelListWithImage, defaultSetting]);
  return { contextHolder, updateDefaultImageGenerationMode };
};

export default useDefaultImageGenerationMode;
