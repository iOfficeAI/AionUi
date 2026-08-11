/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend, AcpSessionConfigOption } from '@/common/types/acpTypes';
import { Button, Dropdown, Menu } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type GuidAcpConfigSelectorProps = {
  backend?: AcpBackend;
  configOptions: AcpSessionConfigOption[];
  selectedValues: Record<string, string>;
  onSelectOption: (configId: string, value: string) => void;
};

const GuidAcpConfigSelector: React.FC<GuidAcpConfigSelectorProps> = ({
  backend: _backend,
  configOptions,
  selectedValues,
  onSelectOption,
}) => {
  const { t } = useTranslation();

  const selectOptions = configOptions.filter(
    (option) =>
      option.type === 'select' &&
      option.options &&
      option.options.length > 1 &&
      option.category !== 'model' &&
      option.category !== 'mode'
  );
  if (selectOptions.length === 0) {
    return null;
  }

  return (
    <>
      {selectOptions.map((option) => {
        const currentValue = selectedValues[option.id] || option.currentValue || option.selectedValue;
        const currentLabel =
          option.options?.find((choice) => choice.value === currentValue)?.name ||
          option.options?.find((choice) => choice.value === currentValue)?.label ||
          currentValue ||
          t('acp.config.default', { defaultValue: 'Default' });

        return (
          <Dropdown
            key={option.id}
            trigger='click'
            droplist={
              <Menu>
                <Menu.ItemGroup
                  title={t(`acp.config.${option.id}`, { defaultValue: option.name || option.label || 'Options' })}
                >
                  {option.options?.map((choice) => (
                    <Menu.Item
                      key={choice.value}
                      className={choice.value === currentValue ? 'bg-2!' : ''}
                      onClick={() => onSelectOption(option.id, choice.value)}
                    >
                      <div className='flex items-center gap-8px'>
                        {choice.value === currentValue && <span className='text-primary'>✓</span>}
                        <span className={choice.value !== currentValue ? 'ml-16px' : ''}>
                          {choice.name || choice.label || choice.value}
                        </span>
                      </div>
                    </Menu.Item>
                  ))}
                </Menu.ItemGroup>
              </Menu>
            }
          >
            <Button className='sendbox-model-btn agent-mode-compact-pill' shape='round' size='small'>
              <span className='flex items-center gap-6px min-w-0 leading-none'>
                <span className='block truncate leading-none'>{currentLabel}</span>
                <Down size={12} className='text-t-tertiary shrink-0' />
              </span>
            </Button>
          </Dropdown>
        );
      })}
    </>
  );
};

export default GuidAcpConfigSelector;
