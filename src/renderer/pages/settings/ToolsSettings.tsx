import { ConfigStorage, type IConfigStorageRefer } from '@/common/storage';
import { Collapse, Form, Select, Switch, Tooltip } from '@arco-design/web-react';
import { Help } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useConfigModelListWithImage from '../../hooks/useConfigModelListWithImage';
import McpManagement from '@renderer/pages/settings/McpManagement';
import SettingContainer from './components/SettingContainer';

const ToolsSettings: React.FC = () => {
  const { t } = useTranslation();
  const [imageGenerationModel, setImageGenerationModel] = useState<IConfigStorageRefer['tools.imageGenerationModel'] | undefined>();
  const { modelListWithImage: data } = useConfigModelListWithImage();
  const imageGenerationModelList = useMemo(() => {
    if (!data) return [];
    return (data || [])
      .filter((v) => {
        const filteredModels = v.model.filter((model) => {
          return model.toLowerCase().includes('image');
        });
        return filteredModels.length > 0;
      })
      .map((v) => ({
        ...v,
        model: v.model.filter((model) => {
          return model.toLowerCase().includes('image');
        }),
      }));
  }, [data]);

  useEffect(() => {
    ConfigStorage.get('tools.imageGenerationModel')
      .then((data) => {
        if (!data) return;
        setImageGenerationModel(data);
      })
      .catch((error) => {
        console.error('Failed to load image generation model config:', error);
      });
  }, []);

  // Sync imageGenerationModel apiKey when provider apiKey changes
  useEffect(() => {
    if (!imageGenerationModel || !data) return;

    // Find the corresponding provider
    const currentProvider = data.find((p) => p.id === imageGenerationModel.id);

    if (currentProvider && currentProvider.apiKey !== imageGenerationModel.apiKey) {
      // Only update apiKey, keep other settings unchanged
      const updatedModel = {
        ...imageGenerationModel,
        apiKey: currentProvider.apiKey,
      };

      setImageGenerationModel(updatedModel);
      ConfigStorage.set('tools.imageGenerationModel', updatedModel).catch((error) => {
        console.error('Failed to save image generation model config:', error);
      });
    } else if (!currentProvider) {
      // Provider was deleted, clear the setting
      setImageGenerationModel(undefined);
      ConfigStorage.remove('tools.imageGenerationModel').catch((error) => {
        console.error('Failed to remove image generation model config:', error);
      });
    }
  }, [data, imageGenerationModel?.id, imageGenerationModel?.apiKey]);

  const handleImageGenerationModelChange = (value: Partial<IConfigStorageRefer['tools.imageGenerationModel']>) => {
    setImageGenerationModel((prev) => {
      const newImageGenerationModel = { ...prev, ...value };
      ConfigStorage.set('tools.imageGenerationModel', newImageGenerationModel).catch((error) => {
        console.error('Failed to update image generation model config:', error);
      });
      return newImageGenerationModel;
    });
  };

  return (
    <SettingContainer title={t('settings.tools')} bodyContainer>
      <Collapse defaultActiveKey={['image-generation', 'mcp-servers']}>
        <McpManagement />
        <Collapse.Item
          className={' [&_div.arco-collapse-item-header-title]:flex-1'}
          header={
            <div className='flex items-center justify-between'>
              Image Generation
              <Switch disabled={!imageGenerationModelList.length || !imageGenerationModel?.useModel} checked={imageGenerationModel?.switch} onChange={(checked) => handleImageGenerationModelChange({ switch: checked })} onClick={(e) => e.stopPropagation()}></Switch>
            </div>
          }
          name={'image-generation'}
        >
          <div>
            <Form className={'mt-10px'}>
              <Form.Item label={t('settings.imageGenerationModel')}>
                {imageGenerationModelList.length > 0 ? (
                  <Select
                    value={imageGenerationModel?.useModel}
                    onChange={(value) => {
                      // value 现在是 platform.id|model 格式
                      const [platformId, modelName] = value.split('|');
                      const platform = imageGenerationModelList.find((p) => p.id === platformId);
                      if (platform) {
                        handleImageGenerationModelChange({ ...platform, useModel: modelName });
                      }
                    }}
                  >
                    {imageGenerationModelList.map(({ model, ...platform }) => {
                      return (
                        <Select.OptGroup label={platform.name} key={platform.id}>
                          {model.map((model) => {
                            return (
                              <Select.Option key={platform.id + model} value={platform.id + '|' + model}>
                                {model}
                              </Select.Option>
                            );
                          })}
                        </Select.OptGroup>
                      );
                    })}
                  </Select>
                ) : (
                  <div className='text-t-secondary flex items-center'>
                    {t('settings.noAvailable')}
                    <Tooltip
                      content={
                        <div>
                          {t('settings.needHelpTooltip')}
                          <a href='https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide' target='_blank' rel='noopener noreferrer' className='text-blue-600 hover:text-blue-800 underline ml-4px' onClick={(e) => e.stopPropagation()}>
                            {t('settings.configGuide')}
                          </a>
                        </div>
                      }
                    >
                      <a href='https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide' target='_blank' rel='noopener noreferrer' className='ml-8px text-blue-600 hover:text-blue-800 cursor-pointer' onClick={(e) => e.stopPropagation()}>
                        <Help theme='outline' size='14' />
                      </a>
                    </Tooltip>
                  </div>
                )}
              </Form.Item>
            </Form>
          </div>
        </Collapse.Item>
      </Collapse>
    </SettingContainer>
  );
};

export default ToolsSettings;
