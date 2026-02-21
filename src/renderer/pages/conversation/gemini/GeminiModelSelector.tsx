import type { GeminiModelSelection } from '@/renderer/pages/conversation/gemini/useGeminiModelSelection';
import { usePreviewContext } from '@/renderer/pages/conversation/preview';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';

// Unified model dropdown for chat header, send box, and channel settings
const GeminiModelSelector: React.FC<{
  selection?: GeminiModelSelection;
  disabled?: boolean;
  label?: string;
  variant?: 'header' | 'settings';
}> = ({ selection, disabled = false, label: customLabel, variant = 'header' }) => {
  const { t } = useTranslation();
  const { isOpen: isPreviewOpen } = usePreviewContext();
  const compact = variant === 'header' && isPreviewOpen;

  // Disabled state (non-Gemini Agent): render a simple Tooltip + Button, no Dropdown needed
  if (disabled || !selection) {
    const displayLabel = customLabel || t('conversation.welcome.useCliModel');

    if (variant === 'settings') {
      return <div className='text-14px text-t-secondary min-w-160px'>{displayLabel}</div>;
    }

    return (
      <Tooltip content={t('conversation.welcome.modelSwitchNotSupported')} position='top'>
        <Button className='sendbox-model-btn header-model-btn' shape='round' size='small' style={{ cursor: 'default' }}>
          {displayLabel}
        </Button>
      </Tooltip>
    );
  }

  const { currentModel, providers, geminiModeLookup, getAvailableModels, handleSelectModel, formatModelLabel } = selection;

  // formatModelLabel returns the friendly label for known modes (e.g. 'Auto (Gemini 3)')
  // and falls back to the raw model name for manual sub-model selections.
  const label = customLabel || (currentModel ? formatModelLabel(currentModel, currentModel.useModel) : t('conversation.welcome.selectModel'));

  const triggerButton =
    variant === 'settings' ? (
      <Button type='secondary' className='min-w-160px flex items-center justify-between gap-8px'>
        <span className='truncate'>{label}</span>
        <Down theme='outline' size={14} />
      </Button>
    ) : (
      <Button className={classNames('sendbox-model-btn header-model-btn', compact && '!max-w-[120px]')} shape='round' size='small'>
        <span className={compact ? 'block truncate' : undefined}>{label}</span>
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
                  const isGoogleProvider = provider.platform?.toLowerCase().includes('gemini-with-google-auth');
                  const option = isGoogleProvider ? geminiModeLookup.get(modelName) : undefined;

                  // Manual mode: show submenu with specific models
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
                        {option.subModels.map((subModel) => (
                          <Menu.Item key={`${provider.id}-${subModel.value}`} className={currentModel?.id + currentModel?.useModel === provider.id + subModel.value ? '!bg-2' : ''} onClick={() => void handleSelectModel(provider, subModel.value)}>
                            {subModel.label}
                          </Menu.Item>
                        ))}
                      </Menu.SubMenu>
                    );
                  }

                  // Normal mode: show single item
                  return (
                    <Menu.Item key={`${provider.id}-${modelName}`} onClick={() => void handleSelectModel(provider, modelName)}>
                      {(() => {
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

export default GeminiModelSelector;
