/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isElectronDesktop } from '@/renderer/utils/platform';
import React from 'react';
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
  System,
} from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { SettingsViewModeProvider } from '@/renderer/components/settings/SettingsModal/settingsViewContext';

interface SettingsPageWrapperProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

type NavItem = { label: string; icon: React.ReactElement; path: string; id: string };

type TranslateFn = (key: string, options?: { defaultValue?: string }) => string;

export function getBuiltinSettingsNavItems(isDesktop: boolean, t: TranslateFn): NavItem[] {
  const builtinMap: Record<string, NavItem> = {
    gemini: { id: 'gemini', label: t('settings.gemini'), icon: <Gemini theme='outline' size='16' />, path: 'gemini' },
    apikeys: { id: 'apikeys', label: `${t('settings.apiKey', { defaultValue: 'API Key' })}s`, icon: <Lightning theme='outline' size='16' />, path: 'apikeys' },
    model: { id: 'model', label: t('settings.model'), icon: <LinkCloud theme='outline' size='16' />, path: 'model' },
    assistants: { id: 'assistants', label: t('settings.assistants', { defaultValue: 'Assistants' }), icon: <Robot theme='outline' size='16' />, path: 'assistants' },
    agent: { id: 'agent', label: t('settings.agents', { defaultValue: 'Agents' }), icon: <Robot theme='outline' size='16' />, path: 'agent' },
    capabilities: { id: 'capabilities', label: t('settings.capabilities', { defaultValue: 'Capabilities' }), icon: <Lightning theme='outline' size='16' />, path: 'capabilities' },
    display: { id: 'display', label: t('settings.display'), icon: <Computer theme='outline' size='16' />, path: 'display' },
    webui: { id: 'webui', label: t('settings.webui'), icon: isDesktop ? <Earth theme='outline' size='16' /> : <Communication theme='outline' size='16' />, path: 'webui' },
    pet: { id: 'pet', label: t('pet.desktopPet'), icon: <Cat theme='outline' size='16' />, path: 'pet' },
    providers: { id: 'providers', label: t('settings.providers', { defaultValue: 'Provider Cockpit' }), icon: <Lightning theme='outline' size='16' />, path: 'providers' },
    system: { id: 'system', label: t('settings.system'), icon: <System theme='outline' size='16' />, path: 'system' },
    about: { id: 'about', label: t('settings.about'), icon: <Info theme='outline' size='16' />, path: 'about' },
  };

  return Object.values(builtinMap);
}

const SettingsPageWrapper: React.FC<SettingsPageWrapperProps> = ({ children, className, contentClassName }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isDesktop = isElectronDesktop();
  const navItems = getBuiltinSettingsNavItems(isDesktop, t);

  const containerClass = `settings-page-wrapper w-full min-h-full box-border overflow-y-auto px-12px md:px-40px py-32px ${className || ''}`;
  const contentClass = `settings-page-content mx-auto w-full md:max-w-1024px ${contentClassName || ''}`;

  return (
    <SettingsViewModeProvider value='page'>
      <div className={containerClass}>
        <div className='flex flex-col md:flex-row gap-16px'>
          <div className='md:w-1/5 hidden md:block'>
            {navItems.map((item) => (
              <button
                key={item.id}
                type='button'
                className='settings-sider__item h-40px rd-8px flex items-center gap-8px justify-start px-10px mb-4px hover:bg-[rgba(var(--primary-6),0.14)] w-full'
                onClick={() => navigate(`/settings/${item.path}`, { replace: true })}
              >
                <span className='w-28px h-28px flex items-center justify-center shrink-0'>
                  {React.cloneElement(item.icon as React.ReactElement, { theme: 'outline', size: '20', strokeWidth: 3, className: 'block leading-none text-t-secondary' })}
                </span>
                <span className='text-14px text-t-primary font-medium'>{item.label}</span>
              </button>
            ))}
          </div>
          <div className='flex-1'>
            <div className={contentClass}>{children}</div>
          </div>
        </div>
      </div>
    </SettingsViewModeProvider>
  );
};

export default SettingsPageWrapper;
