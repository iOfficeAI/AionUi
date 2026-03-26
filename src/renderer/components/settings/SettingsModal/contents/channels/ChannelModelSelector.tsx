import { ipcBridge } from '@/common';
import type { IProvider } from '@/common/config/storage';
import type { GeminiModelSelection } from '@/renderer/pages/conversation/platforms/gemini/useGeminiModelSelection';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

const ChannelModelSelector: React.FC<{
  selection?: GeminiModelSelection;
  disabled?: boolean;
  label?: string;
}> = ({ selection, disabled = false, label: customLabel }) => {
  const { t } = useTranslation();
  const defaultModelLabel = t('common.defaultModel');

  const { data: modelConfig } = useSWR<IProvider[]>('model.config', () => ipcBridge.mode.getModelConfig.invoke());

  const currentModel = selection?.currentModel;
  const currentModelHealth = React.useMemo(() => {
    if (!currentModel || !modelConfig) return { status: 'unknown', color: 'bg-gray-400' };
    const matchedProvider = modelConfig.find((provider) => provider.id === currentModel.id);
    const healthStatus = matchedProvider?.modelHealth?.[currentModel.useModel]?.status || 'unknown';
    const healthColor =
      healthStatus === 'healthy' ? 'bg-green-500' : healthStatus === 'unhealthy' ? 'bg-red-500' : 'bg-gray-400';
    return { status: healthStatus, color: healthColor };
  }, [currentModel, modelConfig]);

  if (disabled || !selection) {
    return (
      <div className='text-14px text-t-secondary min-w-160px'>
        {customLabel || t('conversation.welcome.useCliModel')}
      </div>
    );
  }

  const {
    providers = [],
    geminiModeLookup = new Map(),
    getAvailableModels,
    handleSelectModel,
    formatModelLabel,
  } = selection;
  const safeGetAvailableModels =
    getAvailableModels ?? ((_: IProvider): string[] => []);
  const safeHandleSelectModel =
    handleSelectModel ?? (async (): Promise<boolean> => false);
  const safeFormatModelLabel =
    formatModelLabel ??
    ((provider: IProvider, modelName: string): string => provider.name || modelName);
  const rawLabel = currentModel ? safeFormatModelLabel(currentModel, currentModel.useModel) : '';
  const label =
    customLabel ||
    getModelDisplayLabel({
      selectedValue: currentModel?.useModel,
      selectedLabel: rawLabel,
      defaultModelLabel,
      fallbackLabel: t('conversation.welcome.selectModel'),
    });

  return (
    <Dropdown
      trigger='click'
      position='br'
      droplist={
        <Menu>
          {providers.map((provider) => {
            const models = safeGetAvailableModels(provider);
            if (!models.length) return null;

            return (
              <Menu.ItemGroup title={provider.name} key={provider.id}>
                {models.map((modelName) => {
                  const isGoogleProvider = provider.platform?.toLowerCase().includes('gemini-with-google-auth');
                  const option = isGoogleProvider ? geminiModeLookup.get(modelName) : undefined;

                  if (option?.subModels && option.subModels.length > 0) {
                    return (
                      <Menu.SubMenu
                        key={`${provider.id}-${modelName}`}
                        title={
                          <div className='flex items-center justify-between gap-12px w-full'>
                            <span>{option.label}</span>
                          </div>
                        }
                      >
                        {option.subModels.map((subModel: { label: string; value: string }) => (
                          <Menu.Item
                            key={`${provider.id}-${subModel.value}`}
                            className={
                              currentModel?.id + currentModel?.useModel === provider.id + subModel.value ? '!bg-2' : ''
                            }
                            onClick={() => void safeHandleSelectModel(provider, subModel.value)}
                          >
                            {subModel.label}
                          </Menu.Item>
                        ))}
                      </Menu.SubMenu>
                    );
                  }

                  const matchedProvider = modelConfig?.find((item) => item.id === provider.id);
                  const healthStatus = matchedProvider?.modelHealth?.[modelName]?.status || 'unknown';
                  const healthColor =
                    healthStatus === 'healthy'
                      ? 'bg-green-500'
                      : healthStatus === 'unhealthy'
                        ? 'bg-red-500'
                        : 'bg-gray-400';

                  return (
                    <Menu.Item
                      key={`${provider.id}-${modelName}`}
                      onClick={() => void safeHandleSelectModel(provider, modelName)}
                    >
                      {!option ? (
                        <div className='flex items-center gap-8px w-full'>
                          {healthStatus !== 'unknown' && (
                            <div className={`w-6px h-6px rounded-full shrink-0 ${healthColor}`} />
                          )}
                          <span>{modelName}</span>
                        </div>
                      ) : (
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
                          <div className='flex items-center gap-8px w-full'>
                            {healthStatus !== 'unknown' && (
                              <div className={`w-6px h-6px rounded-full shrink-0 ${healthColor}`} />
                            )}
                            <span>{option.label}</span>
                          </div>
                        </Tooltip>
                      )}
                    </Menu.Item>
                  );
                })}
              </Menu.ItemGroup>
            );
          })}
        </Menu>
      }
    >
      <Button type='secondary' className='min-w-160px flex items-center justify-between gap-8px'>
        <div className='flex items-center gap-8px min-w-0'>
          {currentModelHealth.status !== 'unknown' && (
            <div className={`w-6px h-6px rounded-full shrink-0 ${currentModelHealth.color}`} />
          )}
          <span className='truncate'>{label}</span>
        </div>
        <Down theme='outline' size={14} />
      </Button>
    </Dropdown>
  );
};

export default ChannelModelSelector;
