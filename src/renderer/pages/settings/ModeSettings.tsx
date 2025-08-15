import { ipcBridge } from '@/common';
import { IModel } from '@/common/storage';
import { Button, Collapse, Divider, Message, Popconfirm } from '@arco-design/web-react';
import { DeleteFour, Minus, Plus, Write } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import AddModelModal from './components/AddModelModal';
import AddPlatformModal from './components/AddPlatformModal';
import EditModeModal from './components/EditModeModal';
import SettingContainer from './components/SettingContainer';

const ModelSettings: React.FC = () => {
  const { t } = useTranslation();
  const [cacheKey, setCacheKey] = useState('model.config');
  const [collapseKey, setCollapseKey] = useState<Record<string, boolean>>({});
  const { data } = useSWR(cacheKey, () => {
    return ipcBridge.mode.getModelConfig.invoke().then((data) => {
      if (!data) return [];
      return data;
    });
  });
  const [message, messageContext] = Message.useMessage();

  const saveModelConfig = (newData: IModel[], success?: () => void) => {
    ipcBridge.mode.saveModelConfig.invoke(newData).then((data) => {
      if (data.success) {
        setCacheKey('model.config' + Date.now());
        success?.();
      } else {
        message.error(data.msg);
      }
    });
  };

  const updatePlatform = (platform: IModel, success: () => void) => {
    let newData = [...(data || [])];
    const originData = newData.find((item) => item.id === platform.id);
    if (originData) {
      Object.assign(originData, platform);
    } else {
      newData.push(platform);
    }
    saveModelConfig(newData, success);
  };

  const removePlatform = (id: string) => {
    const newData = data.filter((item) => item.id !== id);
    saveModelConfig(newData);
  };

  const [addPlatformModalCtrl, addPlatformModalContext] = AddPlatformModal.useModal({
    onSubmit(platform) {
      updatePlatform(platform, () => addPlatformModalCtrl.close());
    },
  });

  const [addModelModalCtrl, addModelModalContext] = AddModelModal.useModal({
    onSubmit(platform) {
      updatePlatform(platform, () => {
        addModelModalCtrl.close();
      });
    },
  });

  const [editModalCtrl, editModalContext] = EditModeModal.useModal({
    onChange(platform) {
      updatePlatform(platform, () => editModalCtrl.close());
    },
  });

  return (
    <SettingContainer
      title={
        <div className='flex items-center justify-between'>
          {t('settings.model')}
          <Button size='mini' onClick={() => addPlatformModalCtrl.open()}>
            {t('settings.addModel')}
          </Button>
        </div>
      }
    >
      {addPlatformModalContext}
      {editModalContext}
      {addModelModalContext}
      {messageContext}
      {(data || []).map((platform, index) => {
        const key = platform.id;
        return (
          <Collapse
            activeKey={collapseKey[key] ? ['1'] : []}
            onChange={() => {
              setCollapseKey({ ...collapseKey, [key]: !collapseKey[key] });
            }}
            style={{ maxWidth: 1180 }}
            className={'mb-20px'}
            key={key}
          >
            <Collapse.Item
              header={
                <div className='flex items-center justify-between'>
                  {platform.name}
                  <div className='flex items-center gap-10px' onClick={(e) => e.stopPropagation()}>
                    <span className='text-12px'>
                      {t('settings.modelCount')}（{platform.model.length}）
                    </span>
                    <Button
                      size='mini'
                      icon={<Plus size={'14'} className=''></Plus>}
                      onClick={(e) => {
                        addModelModalCtrl.open({ data: platform });
                      }}
                    ></Button>
                    <Popconfirm
                      title={t('settings.deleteAllModelConfirm')}
                      onOk={() => {
                        removePlatform(platform.id);
                      }}
                    >
                      <Button size='mini' icon={<Minus size={'14'} />}></Button>
                    </Popconfirm>
                    <Button
                      size='mini'
                      icon={<Write size={'14'}></Write>}
                      onClick={(e) => {
                        editModalCtrl.open({ data: platform });
                      }}
                    ></Button>
                  </div>
                </div>
              }
              name='1'
              className={'[&_div.arco-collapse-item-content-box]:py-10px [&_div.arco-collapse-item-header-title]:flex-1'}
            >
              {platform.model.map((model, index, arr) => {
                return (
                  <div key={model}>
                    <div className='flex items-center justify-between'>
                      <span>{model}</span>
                      <Popconfirm
                        title={t('settings.deleteModelConfirm')}
                        onOk={() => {
                          const newModels = platform.model.filter((item) => item !== model);
                          updatePlatform({ ...platform, model: newModels }, () => {
                            setCacheKey('model.config' + Date.now());
                          });
                        }}
                      >
                        <Button icon={<DeleteFour theme='outline' size='20' strokeWidth={2} />}></Button>
                      </Popconfirm>
                    </div>
                    {index < arr.length - 1 && <Divider className='!my-10px'></Divider>}
                  </div>
                );
              })}
            </Collapse.Item>
          </Collapse>
        );
      })}
    </SettingContainer>
  );
};

export default ModelSettings;
