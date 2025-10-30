import { ipcBridge } from '@/common';
import type { IProvider } from '@/common/storage';
import { Button, Collapse, Divider, Message, Popconfirm } from '@arco-design/web-react';
import { DeleteFour, Info, Minus, Plus, Write } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import AddModelModal from './components/AddModelModal';
import AddPlatformModal from './components/AddPlatformModal';
import EditModeModal from './components/EditModeModal';
import SettingContainer from './components/SettingContainer';

// Calculate API Key count
const getApiKeyCount = (apiKey: string): number => {
  if (!apiKey) return 0;
  return apiKey.split(/[,\n]/).filter((k) => k.trim().length > 0).length;
};

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

  const saveModelConfig = (newData: IProvider[], success?: () => void) => {
    ipcBridge.mode.saveModelConfig
      .invoke(newData)
      .then((data) => {
        if (data.success) {
          setCacheKey('model.config' + Date.now());
          success?.();
        } else {
          message.error(data.msg);
        }
      })
      .catch((error) => {
        console.error('Failed to save model config:', error);
        message.error('Failed to save model configuration');
      });
  };

  const updatePlatform = (platform: IProvider, success: () => void) => {
    const newData = [...(data || [])];
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
          <Button size='mini' type='outline' icon={<Plus size={'14'} className=''></Plus>} shape='round' onClick={() => addPlatformModalCtrl.open()}>
            {t('settings.addModel')}
          </Button>
        </div>
      }
    >
      {addPlatformModalContext}
      {editModalContext}
      {addModelModalContext}
      {messageContext}
      {!data || data.length === 0 ? (
        <div className='flex flex-col items-center justify-center py-20px'>
          <Info theme='outline' size='48' className='text-t-secondary mb-16px' />
          <h3 className='text-18px font-medium text-t-primary mb-8px'>{t('settings.noConfiguredModels')}</h3>
          <p className='text-14px text-t-secondary text-center'>
            {t('settings.needHelpConfigGuide')}
            <a href='https://github.com/iOfficeAI/AionUi/wiki/LLM-Configuration' target='_blank' rel='noopener noreferrer' className='text-blue-600 hover:text-blue-800 underline ml-4px'>
              {t('settings.configGuide')}
            </a>
            {t('settings.configGuideSuffix')}
          </p>
        </div>
      ) : (
        (data || []).map((platform, index) => {
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
                        {t('settings.modelCount')}（{platform.model.length}）| {t('settings.apiKeyCount')}（{getApiKeyCount(platform.apiKey)}）
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
        })
      )}
    </SettingContainer>
  );
};

export default ModelSettings;
