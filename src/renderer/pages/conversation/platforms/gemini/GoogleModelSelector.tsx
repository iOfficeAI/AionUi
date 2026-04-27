import type { GoogleModelSelection } from '@/renderer/pages/conversation/platforms/gemini/useGoogleModelSelection';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { IProvider } from '@/common/config/storage';

// Unified model dropdown for chat header, send box, and channel settings
const GoogleModelSelector: React.FC<{
  selection?: GoogleModelSelection;
  disabled?: boolean;
  label?: string;
  variant?: 'header' | 'settings';
}> = ({ selection, disabled = false, label: customLabel, variant = 'header' }) => {
  const { t } = useTranslation();
  const { isOpen: isPreviewOpen } = usePreviewContext();
  const layout = useLayoutContext();
  const compact = variant === 'header' && (isPreviewOpen || layout?.isMobile);
  const isMobileHeaderCompact = variant === 'header' && Boolean(layout?.isMobile);
  const defaultModelLabel = t('common.defaultModel');

  // 获取模型配置数据（包含健康状态）
  const { data: modelConfig } = useSWR<IProvider[]>('providers', () => ipcBridge.mode.listProviders.invoke());

  // 获取当前模型的健康状态 (must be called before any early return to keep hooks count stable)
  const current_model = selection?.current_model;
  const current_modelHealth = React.useMemo(() => {
    if (!current_model || !modelConfig) return { status: 'unknown', color: 'bg-gray-400' };
    const matchedProvider = modelConfig.find((p) => p.id === current_model.id);
    const healthStatus = matchedProvider?.model_health?.[current_model.useModel]?.status || 'unknown';
    const healthColor =
      healthStatus === 'healthy' ? 'bg-green-500' : healthStatus === 'unhealthy' ? 'bg-red-500' : 'bg-gray-400';
    return { status: healthStatus, color: healthColor };
  }, [current_model, modelConfig]);

  // Disabled state (non-Gemini Agent): render a simple Tooltip + Button, no Dropdown needed
  if (disabled || !selection) {
    const display_label = customLabel || t('conversation.welcome.useCliModel');

    if (variant === 'settings') {
      return <div className='text-14px text-t-secondary min-w-160px'>{display_label}</div>;
    }

    return (
      <Tooltip content={t('conversation.welcome.modelSwitchNotSupported')} position='top'>
        <Button
          className={classNames(
            'sendbox-model-btn header-model-btn',
            compact && '!max-w-[120px]',
            isMobileHeaderCompact && '!max-w-[160px]'
          )}
          shape='round'
          size='small'
          style={{ cursor: 'default' }}
        >
          <span className='flex items-center gap-6px min-w-0'>
            <span className={compact ? 'block truncate' : undefined}>{display_label}</span>
          </span>
        </Button>
      </Tooltip>
    );
  }

  const { providers, getAvailableModels, handleSelectModel, formatModelLabel } = selection;

  // formatModelLabel returns the friendly label for known modes (e.g. 'Auto (Gemini 3)')
  // and falls back to the raw model name for manual sub-model selections.
  const rawLabel = current_model ? formatModelLabel(current_model, current_model.useModel) : '';
  const label =
    customLabel ||
    getModelDisplayLabel({
      selected_value: current_model?.useModel,
      selectedLabel: rawLabel,
      defaultModelLabel,
      fallbackLabel: t('conversation.welcome.selectModel'),
    });

  const triggerButton =
    variant === 'settings' ? (
      <Button type='secondary' className='min-w-160px flex items-center justify-between gap-8px'>
        <div className='flex items-center gap-8px min-w-0'>
          {current_modelHealth.status !== 'unknown' && (
            <div className={`w-6px h-6px rounded-full shrink-0 ${current_modelHealth.color}`} />
          )}
          <span className='truncate'>{label}</span>
        </div>
        <Down theme='outline' size={14} />
      </Button>
    ) : (
      <Button
        className={classNames(
          'sendbox-model-btn header-model-btn',
          compact && '!max-w-[120px]',
          isMobileHeaderCompact && '!max-w-[160px]'
        )}
        shape='round'
        size='small'
        data-testid='chat-model-selector'
      >
        <span className='flex items-center gap-6px min-w-0'>
          {current_modelHealth.status !== 'unknown' && (
            <div className={`w-6px h-6px rounded-full shrink-0 ${current_modelHealth.color}`} />
          )}
          <span className={compact ? 'block truncate' : undefined}>{label}</span>
          <Down theme='outline' size={12} className='shrink-0' />
        </span>
      </Button>
    );

  return (
    <Dropdown
      trigger='click'
      position={variant === 'settings' ? 'br' : undefined}
      droplist={
        <Menu>
          {providers.map((provider) => {
            const models = getAvailableModels(provider);
            if (!models.length) return null;

            return (
              <Menu.ItemGroup title={provider.name} key={provider.id}>
                {models.map((modelName) => {
                  // 获取模型健康状态
                  const matchedProvider = modelConfig?.find((p) => p.id === provider.id);
                  const healthStatus = matchedProvider?.model_health?.[modelName]?.status || 'unknown';
                  const healthColor =
                    healthStatus === 'healthy'
                      ? 'bg-green-500'
                      : healthStatus === 'unhealthy'
                        ? 'bg-red-500'
                        : 'bg-gray-400';

                  return (
                    <Menu.Item
                      key={`${provider.id}-${modelName}`}
                      onClick={() => void handleSelectModel(provider, modelName)}
                    >
                      <div className='flex items-center gap-8px w-full'>
                        {healthStatus !== 'unknown' && (
                          <div className={`w-6px h-6px rounded-full shrink-0 ${healthColor}`} />
                        )}
                        <span>{modelName}</span>
                      </div>
                    </Menu.Item>
                  );
                })}
              </Menu.ItemGroup>
            );
          })}
        </Menu>
      }
    >
      {triggerButton}
    </Dropdown>
  );
};

export default GoogleModelSelector;
