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
      // 优先选择 Gemini 平台的图像模型
      for (const platform of modelListWithImage) {
        const { model, ...other } = platform;
        if (other.platform === 'gemini' && (!other.baseUrl || other.baseUrl.trim() === '')) {
          for (const m of model) {
            if (m.includes('gemini') && m.includes('image')) {
              await ConfigStorage.set('tools.imageGenerationModel', { useModel: m, ...other, switch: true });
              // message.info(t('messages.imageGenerationModelDetected', { platform: other.platform, model: m }));
              return;
            }
          }
        }
      }

      // 如果没有找到 Gemini 图像模型，回退到 OpenRouter 免费图像模型
      for (const platform of modelListWithImage) {
        const { model, ...other } = platform;
        for (const m of model) {
          if (other.platform.includes('OpenRouter') && m.includes('image') && m.includes('free')) {
            await ConfigStorage.set('tools.imageGenerationModel', { useModel: m, ...other, switch: true });
            // message.info(t('messages.imageGenerationModelDetected', { platform: other.platform, model: m }));
            return;
          }
        }
      }
    }
  };
  // useEffect(() => {
  //   if (modelListWithImage?.length > 0 && defaultSetting) {
  //     updateDefaultImageGenerationMode();
  //   }
  // }, [modelListWithImage, defaultSetting]);
  return { contextHolder, updateDefaultImageGenerationMode };
};

export default useDefaultImageGenerationMode;
