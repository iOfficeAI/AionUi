import { ConfigStorage, type IConfigStorageRefer } from '@/common/storage';
import { Collapse, Form, Select, Switch } from '@arco-design/web-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useConfigModelListWithImage from '../../hooks/useConfigModelListWithImage';
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
          return model.toLocaleLowerCase().includes('image');
        });
        return filteredModels.length > 0;
      })
      .map((v) => ({
        ...v,
        model: v.model.filter((model) => {
          return model.toLocaleLowerCase().includes('image');
        }),
      }));
  }, [data]);

  useEffect(() => {
    ConfigStorage.get('tools.imageGenerationModel').then((data) => {
      if (!data) return;
      // Handle backward compatibility: useModel -> selectedModel (read only)
      if (data && 'useModel' in data && !data.selectedModel) {
        const compatData = { ...data, selectedModel: (data as any).useModel };
        setImageGenerationModel(compatData);
      } else {
        setImageGenerationModel(data);
      }
    });
  }, []);

  const handleImageGenerationModelChange = (value: Partial<IConfigStorageRefer['tools.imageGenerationModel']>) => {
    setImageGenerationModel((prev) => {
      const newImageGenerationModel = { ...prev, ...value };
      ConfigStorage.set('tools.imageGenerationModel', newImageGenerationModel);
      return newImageGenerationModel;
    });
  };

  return (
    <SettingContainer title={t('settings.tools')} bodyContainer>
      <Collapse defaultActiveKey={['image-generation']}>
        <Collapse.Item
          className={' [&_div.arco-collapse-item-header-title]:flex-1'}
          header={
            <div className='flex items-center justify-between'>
              Image Generation
              <Switch disabled={!imageGenerationModelList.length || !imageGenerationModel?.selectedModel} checked={imageGenerationModel?.switch} onChange={(checked) => handleImageGenerationModelChange({ switch: checked })} onClick={(e) => e.stopPropagation()}></Switch>
            </div>
          }
          name={'image-generation'}
        >
          <div>
            <Form className={'mt-10px'}>
              <Form.Item label={t('settings.imageGenerationModel')}>
                {imageGenerationModelList.length > 0 ? (
                  <Select value={imageGenerationModel?.selectedModel}>
                    {imageGenerationModelList.map(({ model, ...platform }) => {
                      return (
                        <Select.OptGroup label={platform.name} key={platform.id}>
                          {model.map((model) => {
                            return (
                              <Select.Option
                                onClick={() => {
                                  handleImageGenerationModelChange({ ...platform, selectedModel: model });
                                }}
                                key={platform.platform + model}
                                value={model}
                              >
                                {model}
                              </Select.Option>
                            );
                          })}
                        </Select.OptGroup>
                      );
                    })}
                  </Select>
                ) : (
                  <div className='text-gray-400'>{t('settings.noAvailable')}</div>
                )}
              </Form.Item>
            </Form>
            <div className='mt-3 text-sm text-gray-500'>
              <span className='mr-1'>👉</span>
              <a href='https://github.com/iOfficeAI/AionUi/wiki/OpenRouter-Setup-and-Image-Generation' target='_blank' rel='noopener noreferrer' className='text-blue-500 hover:text-blue-600 underline'>
                {t('settings.imageGenerationGuide')}
              </a>
            </div>
          </div>
        </Collapse.Item>
      </Collapse>
    </SettingContainer>
  );
};

export default ToolsSettings;
