import { ConfigStorage } from '@/common/storage';
import { Message } from '@arco-design/web-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '../../common';

const useDefaultImageGenerationMode = (defaultSetting = true) => {
  const [message, contextHolder] = Message.useMessage();
  const { t } = useTranslation();
  const updateDefaultImageGenerationMode = async () => {
    const modelList = await ipcBridge.mode.getModelConfig.invoke();
    try {
      const config = await ConfigStorage.get('tools.imageGenerationModel');
      if (config?.useModel) {
        return;
      }
      throw new Error('No image generation model found');
    } catch (e) {
      for (const platform of modelList) {
        const { model, ...other } = platform;
        for (const m of model) {
          if (m.includes('image')) {
            await ConfigStorage.set('tools.imageGenerationModel', { useModel: m, ...other, switch: true });
            message.info(t('messages.imageGenerationModelDetected', { platform: other.platform, model: m }));
            return;
          }
        }
      }
      throw new Error('No image generation model found');
    }
  };
  useEffect(() => {
    if (defaultSetting) {
      updateDefaultImageGenerationMode();
    }
  }, [defaultSetting]);
  return { contextHolder, updateDefaultImageGenerationMode };
};

export default useDefaultImageGenerationMode;
