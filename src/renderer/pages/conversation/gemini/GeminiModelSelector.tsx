import type { GeminiModelSelection } from '@/renderer/pages/conversation/gemini/useGeminiModelSelection';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

// 统一的模型下拉，供会话头部使用
// Unified model dropdown rendered in the chat header
const GeminiModelSelector: React.FC<{ selection: GeminiModelSelection }> = ({ selection }) => {
  const { t } = useTranslation();
  const { currentModel, providers, geminiModeLookup, getAvailableModels, handleSelectModel, formatModelLabel } = selection;

  const label = currentModel ? formatModelLabel(currentModel, currentModel.useModel) : t('conversation.welcome.selectModel');

  return (
    <Dropdown
      trigger='click'
      droplist={
        <Menu>
          {providers.map((provider) => {
            const models = getAvailableModels(provider);
            if (!models.length) return null;
            return (
              <Menu.ItemGroup title={provider.name} key={provider.id}>
                {models.map((modelName) => (
                  <Menu.Item key={`${provider.id}-${modelName}`} onClick={() => void handleSelectModel(provider, modelName)}>
                    {(() => {
                      const isGoogleProvider = provider.platform?.toLowerCase().includes('gemini-with-google-auth');
                      const option = isGoogleProvider ? geminiModeLookup.get(modelName) : undefined;
                      if (!option) {
                        return modelName;
                      }
                      return (
                        <Tooltip
                          position='right'
                          trigger='hover'
                          content={
                            <div className='max-w-240px space-y-6px'>
                              <div className='text-12px text-t-tertiary leading-5'>{option.description}</div>
                              {option.modelHint && <div className='text-11px text-t-tertiary'>{option.modelHint}</div>}
                            </div>
                          }
                        >
                          <div className='flex items-center justify-between gap-12px w-full'>
                            <span>{option.label}</span>
                          </div>
                        </Tooltip>
                      );
                    })()}
                  </Menu.Item>
                ))}
              </Menu.ItemGroup>
            );
          })}
        </Menu>
      }
    >
      <Button className='sendbox-model-btn header-model-btn' shape='round' size='small'>
        {label}
      </Button>
    </Dropdown>
  );
};

export default GeminiModelSelector;
