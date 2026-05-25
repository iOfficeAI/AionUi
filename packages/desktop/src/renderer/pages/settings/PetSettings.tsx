/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Radio, Switch } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { systemSettings, type INotchTaskboxStatus } from '@/common/adapter/ipcBridge';
import { configService } from '@/common/config/configService';
import { isElectronDesktop, isMacOS, isWindows } from '@/renderer/utils/platform';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import PreferenceRow from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent/PreferenceRow';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { useSettingsViewMode } from '@/renderer/components/settings/SettingsModal/settingsViewContext';

const DEFAULT_NOTCH_TASKBOX_STATUS: INotchTaskboxStatus = {
  enabled: false,
  open: false,
  hardwareNotch: false,
};

const PetSettings: React.FC = () => {
  const [enabled, setEnabled] = useState(true);
  const [size, setSize] = useState(280);
  const [dnd, setDnd] = useState(false);
  const [confirmEnabled, setConfirmEnabled] = useState(true);
  const [notchTaskboxStatus, setNotchTaskboxStatus] = useState<INotchTaskboxStatus>(DEFAULT_NOTCH_TASKBOX_STATUS);
  const [notchTaskboxLoading, setNotchTaskboxLoading] = useState(false);
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const isDesktop = isElectronDesktop();
  const supportsHardwareNotch = isDesktop && isMacOS();
  const supportsNotchTaskbox = supportsHardwareNotch || (isDesktop && isWindows());

  useEffect(() => {
    if (!isDesktop) return;
    setEnabled(configService.get('pet.enabled') ?? true);
    setSize(configService.get('pet.size') ?? 280);
    setDnd(configService.get('pet.dnd') ?? false);
    setConfirmEnabled(configService.get('pet.confirmEnabled') ?? true);
    if (!supportsNotchTaskbox) return;
    setNotchTaskboxStatus({
      enabled: configService.get('notchTaskbox.enabled') ?? false,
      open: false,
      hardwareNotch: configService.get('notchTaskbox.hardwareNotch') ?? false,
    });
    systemSettings.getNotchTaskboxStatus
      .invoke()
      .then((status) => {
        setNotchTaskboxStatus(status);
        configService.setLocal('notchTaskbox.enabled', status.enabled);
        configService.setLocal('notchTaskbox.hardwareNotch', status.hardwareNotch);
      })
      .catch(() => {
        setNotchTaskboxStatus(DEFAULT_NOTCH_TASKBOX_STATUS);
      });
  }, [isDesktop, supportsNotchTaskbox]);

  const handleEnabledChange = useCallback(
    (checked: boolean) => {
      const previousEnabled = enabled;
      const previousNotchTaskboxStatus = notchTaskboxStatus;
      setEnabled(checked);
      configService.setLocal('pet.enabled', checked);
      if (checked) {
        setNotchTaskboxStatus((status) => ({ ...status, enabled: false, open: false }));
        configService.setLocal('notchTaskbox.enabled', false);
      }
      systemSettings.setPetEnabled.invoke({ enabled: checked }).catch(() => {
        setEnabled(previousEnabled);
        configService.setLocal('pet.enabled', previousEnabled);
        setNotchTaskboxStatus(previousNotchTaskboxStatus);
        configService.setLocal('notchTaskbox.enabled', previousNotchTaskboxStatus.enabled);
      });
    },
    [enabled, notchTaskboxStatus]
  );

  const handleNotchTaskboxEnabledChange = useCallback(
    (checked: boolean) => {
      const previousStatus = notchTaskboxStatus;
      const previousPetEnabled = enabled;
      setNotchTaskboxLoading(true);
      setNotchTaskboxStatus((status) => ({ ...status, enabled: checked, open: checked ? status.open : false }));
      configService.setLocal('notchTaskbox.enabled', checked);
      if (checked) {
        setEnabled(false);
        configService.setLocal('pet.enabled', false);
      }
      systemSettings.setNotchTaskboxEnabled
        .invoke({ enabled: checked })
        .then((status) => {
          setNotchTaskboxStatus(status);
          configService.setLocal('notchTaskbox.enabled', status.enabled);
          configService.setLocal('notchTaskbox.hardwareNotch', status.hardwareNotch);
          if (checked && !status.enabled) {
            setEnabled(previousPetEnabled);
            configService.setLocal('pet.enabled', previousPetEnabled);
          }
        })
        .catch(() => {
          setNotchTaskboxStatus(previousStatus);
          configService.setLocal('notchTaskbox.enabled', previousStatus.enabled);
          if (checked) {
            setEnabled(previousPetEnabled);
            configService.setLocal('pet.enabled', previousPetEnabled);
          }
        })
        .finally(() => {
          setNotchTaskboxLoading(false);
        });
    },
    [enabled, notchTaskboxStatus]
  );

  const handleNotchTaskboxHardwareNotchChange = useCallback(
    (checked: boolean) => {
      const previousStatus = notchTaskboxStatus;
      setNotchTaskboxStatus((status) => ({ ...status, hardwareNotch: checked }));
      configService.setLocal('notchTaskbox.hardwareNotch', checked);
      systemSettings.setNotchTaskboxHardwareNotch
        .invoke({ hardwareNotch: checked })
        .then((status) => {
          setNotchTaskboxStatus(status);
          configService.setLocal('notchTaskbox.hardwareNotch', status.hardwareNotch);
        })
        .catch(() => {
          setNotchTaskboxStatus(previousStatus);
          configService.setLocal('notchTaskbox.hardwareNotch', previousStatus.hardwareNotch);
        });
    },
    [notchTaskboxStatus]
  );

  const handleSizeChange = useCallback(
    (val: number) => {
      const prevSize = size;
      setSize(val);
      configService.setLocal('pet.size', val);
      systemSettings.setPetSize.invoke({ size: val }).catch(() => {
        setSize(prevSize);
        configService.setLocal('pet.size', prevSize);
      });
    },
    [size]
  );

  const handleDndChange = useCallback((checked: boolean) => {
    setDnd(checked);
    configService.setLocal('pet.dnd', checked);
    systemSettings.setPetDnd.invoke({ dnd: checked }).catch(() => {
      setDnd(!checked);
      configService.setLocal('pet.dnd', !checked);
    });
  }, []);

  const handleConfirmEnabledChange = useCallback((checked: boolean) => {
    setConfirmEnabled(checked);
    configService.setLocal('pet.confirmEnabled', checked);
    systemSettings.setPetConfirmEnabled.invoke({ enabled: checked }).catch(() => {
      setConfirmEnabled(!checked);
      configService.setLocal('pet.confirmEnabled', !checked);
    });
  }, []);

  if (!isDesktop) {
    return (
      <SettingsPageWrapper>
        <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
          <div className='space-y-16px'>
            <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px'>
              <p className='m-0 text-13px text-t-secondary'>{t('pet.desktopOnly')}</p>
            </div>
          </div>
        </AionScrollArea>
      </SettingsPageWrapper>
    );
  }

  const preferenceItems = [
    ...(supportsNotchTaskbox
      ? [
          {
            key: 'notchTaskbox',
            label: supportsHardwareNotch ? t('pet.notchTaskbox') : t('pet.topTaskbox'),
            description: supportsHardwareNotch ? t('pet.notchTaskboxDescription') : t('pet.topTaskboxDescription'),
            component: (
              <Switch
                checked={notchTaskboxStatus.enabled}
                loading={notchTaskboxLoading}
                onChange={handleNotchTaskboxEnabledChange}
              />
            ),
          },
          ...(supportsHardwareNotch
            ? [
                {
                  key: 'notchTaskboxHardwareNotch',
                  label: t('pet.notchTaskboxHardwareNotch'),
                  description: t('pet.notchTaskboxHardwareNotchDescription'),
                  component: (
                    <Switch
                      checked={notchTaskboxStatus.hardwareNotch}
                      disabled={!notchTaskboxStatus.enabled || notchTaskboxLoading}
                      onChange={handleNotchTaskboxHardwareNotchChange}
                    />
                  ),
                },
              ]
            : []),
        ]
      : []),
    {
      key: 'enabled',
      label: t('pet.enable'),
      description: notchTaskboxStatus.enabled ? t('pet.desktopPetDisabledByNotchTaskbox') : undefined,
      component: <Switch checked={enabled} disabled={notchTaskboxStatus.enabled} onChange={handleEnabledChange} />,
    },
    {
      key: 'size',
      label: t('pet.size'),
      component: (
        <Radio.Group value={size} onChange={handleSizeChange} disabled={!enabled || notchTaskboxStatus.enabled}>
          <Radio value={200}>{t('pet.sizeSmall', { px: 200 })}</Radio>
          <Radio value={280}>{t('pet.sizeMedium', { px: 280 })}</Radio>
          <Radio value={360}>{t('pet.sizeLarge', { px: 360 })}</Radio>
        </Radio.Group>
      ),
    },
    {
      key: 'dnd',
      label: t('pet.dnd'),
      description: t('pet.dndDescription'),
      component: <Switch checked={dnd} onChange={handleDndChange} disabled={!enabled || notchTaskboxStatus.enabled} />,
    },
    {
      key: 'confirmBubble',
      label: t('pet.confirmBubble'),
      description: t('pet.confirmBubbleDescription'),
      component: (
        <Switch
          checked={confirmEnabled}
          onChange={handleConfirmEnabledChange}
          disabled={!enabled || notchTaskboxStatus.enabled}
        />
      ),
    },
  ];

  return (
    <SettingsPageWrapper>
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-12px'>
            <div className='w-full flex flex-col divide-y divide-border-2'>
              {preferenceItems.map((item) => (
                <PreferenceRow key={item.key} label={item.label} description={item.description}>
                  {item.component}
                </PreferenceRow>
              ))}
            </div>
          </div>
        </div>
      </AionScrollArea>
    </SettingsPageWrapper>
  );
};

export default PetSettings;
