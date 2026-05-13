/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isElectronDesktop } from '@/renderer/utils/platform';
import {
  Cat,
  Communication,
  Computer,
  Earth,
  Gemini,
  Info,
  Lightning,
  LinkCloud,
  Puzzle,
  Robot,
  Speed,
  System,
} from '@icon-park/react';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tooltip } from '@arco-design/web-react';

export const BUILTIN_TAB_IDS = [
  'gemini',
  'apikeys',
  'agent',
  'model',
  'assistants',
  'capabilities',
  'display',
  'webui',
  'pet',
  'providers',
  'system',
  'about',
] as const;

const SettingsSider: React.FC<{ collapsed?: boolean; tooltipEnabled?: boolean }> = ({
  collapsed = false,
  tooltipEnabled = false,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isDesktop = isElectronDesktop();

  const menus = useMemo(() => {
    const builtinMap: Record<string, { id: string; label: string; icon: React.ReactElement; path: string }> = {
      gemini: { id: 'gemini', label: t('settings.gemini'), icon: <Gemini />, path: 'gemini' },
      apikeys: { id: 'apikeys', label: t('settings.apiKey', { defaultValue: 'API Key' }) + 's', icon: <Lightning />, path: 'apikeys' },
      model: { id: 'model', label: t('settings.model'), icon: <LinkCloud />, path: 'model' },
      assistants: { id: 'assistants', label: t('settings.assistants', { defaultValue: 'Assistants' }), icon: <Robot />, path: 'assistants' },
      agent: { id: 'agent', label: t('settings.agents', { defaultValue: 'Agents' }), icon: <Speed />, path: 'agent' },
      capabilities: { id: 'capabilities', label: t('settings.capabilities', { defaultValue: 'Capabilities' }), icon: <Lightning />, path: 'capabilities' },
      display: { id: 'display', label: t('settings.display'), icon: <Computer />, path: 'display' },
      webui: { id: 'webui', label: t('settings.webui'), icon: isDesktop ? <Earth /> : <Communication />, path: 'webui' },
      pet: { id: 'pet', label: t('pet.desktopPet'), icon: <Cat />, path: 'pet' },
      providers: { id: 'providers', label: t('settings.providers', { defaultValue: 'Provider Cockpit' }), icon: <Lightning />, path: 'providers' },
      system: { id: 'system', label: t('settings.system'), icon: <System />, path: 'system' },
      about: { id: 'about', label: t('settings.about'), icon: <Info />, path: 'about' },
    };

    return BUILTIN_TAB_IDS.filter((id) => isDesktop || id !== 'pet').map((id) => builtinMap[id]);
  }, [t, isDesktop]);

  return (
    <div className={classNames('h-full settings-sider flex flex-col gap-2px overflow-y-auto overflow-x-hidden', { 'settings-sider--collapsed': collapsed })}>
      {menus.map((item) => {
        const isSelected = pathname.includes(item.path);
        return (
          <React.Fragment key={item.id}>
            <Tooltip content={item.label} position='right'>
              <div
                data-settings-id={item.id}
                data-settings-path={item.path}
                className={classNames(
                  'settings-sider__item h-40px rd-8px flex items-center gap-8px group cursor-pointer',
                  collapsed ? 'w-full justify-center px-0' : 'justify-start px-10px',
                  { 'hover:bg-[rgba(var(--primary-6),0.14)]': !isSelected, '!bg-active': isSelected }
                )}
                onClick={() => navigate(`/settings/${item.path}`, { replace: true })}
              >
                <span className='w-28px h-28px flex items-center justify-center shrink-0'>
                  {React.cloneElement(item.icon as React.ReactElement, { theme: 'outline', size: '20', strokeWidth: 3, className: 'block leading-none text-t-secondary' })}
                </span>
                <div className='h-24px collapsed-hidden ml-8px'>
                  <div className={classNames('settings-sider__item-label text-nowrap overflow-hidden text-14px', isSelected ? 'text-t-primary font-medium' : 'text-t-primary')}>
                    {item.label}
                  </div>
                </div>
              </div>
            </Tooltip>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default SettingsSider;
