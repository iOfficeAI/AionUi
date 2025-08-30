import { ipcBridge, type IManagedKey } from '@/common';
import { KeyStatus } from '@/common/keyManager';
import type { IModel } from '@/common/storage';
import { Badge, Button, Collapse, Divider, Message, Popconfirm, Tag, Input } from '@arco-design/web-react';
import { DeleteFour, Minus, Plus, Write } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import useDefaultImageGenerationMode from '../../hooks/useDefaultImageGenerationMode';
import AddApiKeyModal from './components/AddApiKeyModal';
import SettingContainer from './components/SettingContainer';

const GeminiSettings: React.FC = () => {
  const { t } = useTranslation();
  const [cacheKey, setCacheKey] = useState('model.config');
  const [collapseKey, setCollapseKey] = useState<Record<string, boolean>>({});
  const { updateDefaultImageGenerationMode, contextHolder: defaultImageGenerationModeContext } = useDefaultImageGenerationMode(false);
  const { data } = useSWR(cacheKey, () => {
    return ipcBridge.mode.getModelConfig.invoke().then((data) => {
      if (!data) return [];
      return data;
    });
  });
  const { data: keyStatus, mutate: mutateKeyStatus } = useSWR('gemini.key.status', () => {
    return ipcBridge.gemini.getKeyStatus.invoke();
  });
  const [message, messageContext] = Message.useMessage();

  useEffect(() => {
    const interval = setInterval(() => {
      mutateKeyStatus();
    }, 5000); // refresh every 5 seconds
    const off = ipcBridge.gemini.keyRotated.on(({ newApiKey }) => {
      message.info(`Key rotated to: ${newApiKey.slice(0, 8)}...`);
      mutateKeyStatus();
    });
    return () => {
      clearInterval(interval);
      off();
    };
  }, [mutateKeyStatus]);

  const saveModelConfig = (newData: IModel[], success?: () => void) => {
    ipcBridge.mode.saveModelConfig.invoke(newData).then((data) => {
      if (data.success) {
        setCacheKey('model.config' + Date.now());
        updateDefaultImageGenerationMode();
        success?.();
      } else {
        message.error(data.msg);
      }
    });
  };

  const updatePlatform = (platform: IModel, success: () => void) => {
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
    const geminiKeys = (data || []).filter(p => p.platform === 'gemini');
    const otherKeys = (data || []).filter(p => p.platform !== 'gemini');
    const newGeminiKeys = geminiKeys.filter((item) => item.id !== id);
    saveModelConfig([...newGeminiKeys, ...otherKeys]);
  };

  const [addApiKeyModalCtrl, addApiKeyModalContext] = AddApiKeyModal.useModal({
    onSubmit(platform) {
      updatePlatform(platform, () => addApiKeyModalCtrl.close());
    },
  });

  const [editedApiKeys, setEditedApiKeys] = useState<Record<string, string>>({});

  const handleApiKeyChange = (id: string, newApiKey: string) => {
    setEditedApiKeys(prev => ({ ...prev, [id]: newApiKey }));
  };

  const handleSaveApiKey = (id: string) => {
    const platform = (data || []).find(p => p.id === id);
    if (platform && editedApiKeys[id]) {
      const updatedPlatform = { ...platform, apiKey: editedApiKeys[id] };
      updatePlatform(updatedPlatform, () => {
        setEditedApiKeys(prev => {
          const newEdited = { ...prev };
          delete newEdited[id];
          return newEdited;
        });
        message.success('API Key saved');
      });
    }
  };

  const geminiModels = (data || []).filter(p => p.platform === 'gemini');

  return (
    <SettingContainer
      title={
        <div className='flex items-center justify-between'>
          {t('Gemini API Keys')}
          <Button size='mini' type='outline' icon={<Plus size={'14'} className=''></Plus>} shape='round'
            onClick={() => addApiKeyModalCtrl.open()}
            disabled={geminiModels.length >= 5}
          >
            {t('Add API Key')}
          </Button>
        </div>
      }
    >
      {addApiKeyModalContext}
      {messageContext}
      {defaultImageGenerationModeContext}
      {geminiModels.map((platform, index) => {
        const key = platform.id;
        const currentKeyStatus = keyStatus?.find(k => k.key.apiKey === platform.apiKey);
        return (
          <div key={key} className="flex items-center gap-10px mb-10px">
            <Input
              value={editedApiKeys[key] ?? platform.apiKey}
              onChange={(value) => handleApiKeyChange(key, value)}
            />
            {editedApiKeys[key] && (
              <Button size='mini' type='primary' onClick={() => handleSaveApiKey(key)}>Save</Button>
            )}
            {currentKeyStatus && (
              <Badge
                status={currentKeyStatus.status === KeyStatus.Active ? 'success' : currentKeyStatus.status === KeyStatus.RateLimited ? 'warning' : 'error'}
                text={currentKeyStatus.status}
              />
            )}
            {currentKeyStatus?.status === KeyStatus.RateLimited && currentKeyStatus.resetTime && (
                <Tag color='arcoblue'>
                    Resets in {Math.ceil((currentKeyStatus.resetTime - Date.now()) / 1000)}s
                </Tag>
            )}
            <Button
              size='mini'
              onClick={() => {
                ipcBridge.gemini.setActiveKey.invoke({ apiKey: platform.apiKey });
                message.success('Active key set');
              }}
              disabled={currentKeyStatus?.status !== KeyStatus.Active}
            >
              Set Active
            </Button>
            {index > 0 && (
              <Popconfirm
                title={t('settings.deleteModelConfirm')}
                onOk={() => {
                  removePlatform(platform.id);
                }}
              >
                <Button icon={<DeleteFour theme='outline' size='20' strokeWidth={2} />}></Button>
              </Popconfirm>
            )}
          </div>
        );
      })}
    </SettingContainer>
  );
};

export default GeminiSettings;
