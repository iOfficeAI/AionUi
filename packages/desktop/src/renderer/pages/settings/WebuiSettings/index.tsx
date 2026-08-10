/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import WebuiModalContent from '@/renderer/components/settings/SettingsModal/contents/WebuiModalContent';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Tabs } from '@arco-design/web-react';
import { Communication, History, Peoples, Share, User } from '@icon-park/react';
import type { Icon } from '@icon-park/react/lib/runtime';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SettingsPageHeader from '../components/SettingsPageHeader';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import AccountOverview from './AccountOverview';
import AuditPanel from './AuditPanel';
import CollaborationPanel from './CollaborationPanel';
import UsersPanel from './UsersPanel';

type AccountTab = 'account' | 'users' | 'collaboration' | 'audit' | 'channels';

const TAB_ICON_SIZE = 14;

function tabTitle(IconComponent: Icon, label: string): React.ReactNode {
  return (
    <span className='inline-flex items-center gap-6px'>
      <IconComponent theme='outline' size={TAB_ICON_SIZE} />
      {label}
    </span>
  );
}

const BrowserAccountSettings: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AccountTab>('account');
  const isAdmin = user?.role === 'admin';
  const canCollaborate = Boolean(user);

  useEffect(() => {
    if (!isAdmin && (activeTab === 'users' || activeTab === 'audit')) setActiveTab('account');
    if (!canCollaborate && activeTab === 'collaboration') setActiveTab('account');
  }, [activeTab, canCollaborate, isAdmin]);

  // Only mount the active tab so background panels cannot spam API/rate limits.
  const panel = (() => {
    switch (activeTab) {
      case 'account':
        return <AccountOverview />;
      case 'users':
        return isAdmin ? <UsersPanel /> : null;
      case 'collaboration':
        return canCollaborate ? <CollaborationPanel /> : null;
      case 'audit':
        return isAdmin ? <AuditPanel /> : null;
      case 'channels':
        return <WebuiModalContent />;
      default:
        return null;
    }
  })();

  return (
    <SettingsPageWrapper contentClassName='max-w-960px'>
      <SettingsPageHeader
        title={t('settings.account.title')}
        description={t('settings.account.description')}
        actions={<Peoples theme='outline' size={22} className='text-t-secondary' />}
      />

      <div className='mt-16px rd-12px border border-border-2 bg-bg-2 px-16px pt-8px pb-20px'>
        <Tabs activeTab={activeTab} onChange={(key) => setActiveTab(key as AccountTab)} type='rounded' destroyOnHide>
          <Tabs.TabPane key='account' title={tabTitle(User, t('settings.account.tabs.account'))} />
          {isAdmin ? <Tabs.TabPane key='users' title={tabTitle(Peoples, t('settings.account.tabs.users'))} /> : null}
          {canCollaborate ? (
            <Tabs.TabPane key='collaboration' title={tabTitle(Share, t('settings.account.tabs.collaboration'))} />
          ) : null}
          {isAdmin ? <Tabs.TabPane key='audit' title={tabTitle(History, t('settings.account.tabs.audit'))} /> : null}
          <Tabs.TabPane key='channels' title={tabTitle(Communication, t('settings.account.tabs.channels'))} />
        </Tabs>

        <div className='mt-16px'>{panel}</div>
      </div>
    </SettingsPageWrapper>
  );
};

const WebuiSettings: React.FC = () => {
  if (!isElectronDesktop()) return <BrowserAccountSettings />;
  return (
    <SettingsPageWrapper>
      <WebuiModalContent />
    </SettingsPageWrapper>
  );
};

export default WebuiSettings;
