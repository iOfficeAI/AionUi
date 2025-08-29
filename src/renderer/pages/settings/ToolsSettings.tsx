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
    return (data || []).filter((v) => {
      v.model = v.model.filter((model) => {
        return model.toLocaleLowerCase().includes('image');
      });
      return v.model.length > 0;
    });
  }, [data]);

  useEffect(() => {
    ConfigStorage.get('tools.imageGenerationModel').then((data) => {
      if (!data) return;
      setImageGenerationModel(data);
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
              <Switch disabled={!imageGenerationModelList.length || !imageGenerationModel?.useModel} checked={imageGenerationModel?.switch} onChange={(checked) => handleImageGenerationModelChange({ switch: checked })} onClick={(e) => e.stopPropagation()}></Switch>
            </div>
          }
          name={'image-generation'}
        >
          <div>
            <Form className={'mt-10px'}>
              <Form.Item label={t('settings.imageGenerationModel')}>
                <Select value={imageGenerationModel?.useModel}>
                  {imageGenerationModelList.map(({ model, ...platform }) => {
                    return (
                      <Select.OptGroup label={platform.name} key={platform.id}>
                        {model.map((model) => {
                          return (
                            <Select.Option
                              onClick={() => {
                                handleImageGenerationModelChange({ ...platform, useModel: model });
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
              </Form.Item>
            </Form>
          </div>
        </Collapse.Item>
      </Collapse>
    </SettingContainer>
  );
};

export default ToolsSettings;
