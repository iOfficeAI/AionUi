/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Message, Radio, Switch } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { systemSettings, type INotchTaskboxStatus } from '@/common/adapter/ipcBridge';
import { configService } from '@/common/config/configService';
import { isElectronDesktop, isMacOS } from '@/renderer/utils/platform';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import PreferenceRow from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent/PreferenceRow';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { useSettingsViewMode } from '@/renderer/components/settings/SettingsModal/settingsViewContext';

const PetSettings: React.FC = () => {
  const [enabled, setEnabled] = useState(true);
  const [size, setSize] = useState(280);
  const [dnd, setDnd] = useState(false);
  const [confirmEnabled, setConfirmEnabled] = useState(true);
  const [taskboxStatus, setTaskboxStatus] = useState<INotchTaskboxStatus | null>(null);
  const [taskboxLoading, setTaskboxLoading] = useState(false);
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const isDesktop = isElectronDesktop();
  const showHardwareNotch = isMacOS();

  useEffect(() => {
    if (!isDesktop) return;
    setEnabled(configService.get('pet.enabled') ?? true);
    setSize(configService.get('pet.size') ?? 280);
    setDnd(configService.get('pet.dnd') ?? false);
    setConfirmEnabled(configService.get('pet.confirmEnabled') ?? true);
    systemSettings.getNotchTaskboxStatus
      .invoke()
      .then((status) => {
        setTaskboxStatus(status);
        if (status.enabled) {
          setEnabled(false);
          configService.setLocal('pet.enabled', false);
        }
      })
      .catch(() => {});
  }, [isDesktop]);

  const handleEnabledChange = useCallback(
    (checked: boolean) => {
      const previousEnabled = enabled;
      const previousTaskboxStatus = taskboxStatus;
      setEnabled(checked);
      configService.setLocal('pet.enabled', checked);
      if (checked && taskboxStatus) {
        setTaskboxStatus({ ...taskboxStatus, enabled: false });
      }
      systemSettings.setPetEnabled.invoke({ enabled: checked }).catch(() => {
        setEnabled(previousEnabled);
        configService.setLocal('pet.enabled', previousEnabled);
        setTaskboxStatus(previousTaskboxStatus);
        Message.error(t('pet.desktopPetUpdateFailed'));
      });
    },
    [enabled, taskboxStatus, t]
  );

  const handleTaskboxEnabledChange = useCallback(
    (checked: boolean) => {
      const previousEnabled = enabled;
      const previousTaskboxStatus = taskboxStatus;
      if (taskboxStatus) setTaskboxStatus({ ...taskboxStatus, enabled: checked });
      if (checked) {
        setEnabled(false);
        configService.setLocal('pet.enabled', false);
      }
      setTaskboxLoading(true);
      systemSettings.setNotchTaskboxEnabled
        .invoke({ enabled: checked })
        .then((status) => {
          setTaskboxStatus(status);
          if (status.enabled) {
            setEnabled(false);
            configService.setLocal('pet.enabled', false);
          } else if (checked) {
            setEnabled(previousEnabled);
            configService.setLocal('pet.enabled', previousEnabled);
          }
          Message.success(status.enabled ? t('pet.notchTaskboxEnabled') : t('pet.notchTaskboxDisabled'));
        })
        .catch(() => {
          setEnabled(previousEnabled);
          configService.setLocal('pet.enabled', previousEnabled);
          setTaskboxStatus(previousTaskboxStatus);
          Message.error(t('pet.notchTaskboxUpdateFailed'));
        })
        .finally(() => {
          setTaskboxLoading(false);
        });
    },
    [enabled, taskboxStatus, t]
  );

  const handleHardwareNotchChange = useCallback(
    (checked: boolean) => {
      const previousTaskboxStatus = taskboxStatus;
      if (taskboxStatus) setTaskboxStatus({ ...taskboxStatus, hardwareNotch: checked });
      setTaskboxLoading(true);
      systemSettings.setNotchTaskboxHardwareNotch
        .invoke({ hardwareNotch: checked })
        .then((status) => {
          setTaskboxStatus(status);
        })
        .catch(() => {
          setTaskboxStatus(previousTaskboxStatus);
          Message.error(t('pet.notchTaskboxHardwareNotchUpdateFailed'));
        })
        .finally(() => {
          setTaskboxLoading(false);
        });
    },
    [taskboxStatus, t]
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

  const taskboxEnabled = taskboxStatus?.enabled ?? false;
  const hardwareNotch = taskboxStatus?.hardwareNotch ?? false;

  const preferenceItems = [
    {
      key: 'notchTaskbox',
      label: t('pet.notchTaskbox'),
      description: t('pet.notchTaskboxDescription'),
      component: <Switch checked={taskboxEnabled} loading={taskboxLoading} onChange={handleTaskboxEnabledChange} />,
    },
    ...(showHardwareNotch
      ? [
          {
            key: 'notchTaskboxHardwareNotch',
            label: t('pet.notchTaskboxHardwareNotch'),
            description: t('pet.notchTaskboxHardwareNotchDescription'),
            component: <Switch checked={hardwareNotch} loading={taskboxLoading} onChange={handleHardwareNotchChange} />,
          },
        ]
      : []),
    {
      key: 'enabled',
      label: t('pet.enable'),
      description: taskboxEnabled ? t('pet.desktopPetDisabledByNotchTaskbox') : undefined,
      component: <Switch checked={enabled} onChange={handleEnabledChange} disabled={taskboxEnabled} />,
    },
    {
      key: 'size',
      label: t('pet.size'),
      component: (
        <Radio.Group value={size} onChange={handleSizeChange} disabled={!enabled || taskboxEnabled}>
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
      component: <Switch checked={dnd} onChange={handleDndChange} disabled={!enabled || taskboxEnabled} />,
    },
    {
      key: 'confirmBubble',
      label: t('pet.confirmBubble'),
      description: t('pet.confirmBubbleDescription'),
      component: (
        <Switch checked={confirmEnabled} onChange={handleConfirmEnabledChange} disabled={!enabled || taskboxEnabled} />
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
