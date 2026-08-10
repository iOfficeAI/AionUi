/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { Button, Tag } from '@arco-design/web-react';
import { Lock, Logout } from '@icon-park/react';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

const AccountOverview: React.FC = () => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const signOut = useCallback(async () => {
    await logout();
    void navigate('/login', { replace: true });
  }, [logout, navigate]);

  if (!user) {
    return (
      <div className='rd-12px border border-border-2 bg-fill-1 px-16px py-20px text-t-secondary'>
        {t('settings.account.errors.featureUnavailable')}
      </div>
    );
  }

  return (
    <div className='rd-12px border border-border-2 bg-fill-1 px-20px py-18px'>
      <div className='flex flex-col gap-16px sm:flex-row sm:items-center sm:justify-between'>
        <div className='min-w-0'>
          <div className='text-18px font-600 text-t-primary'>{user.username}</div>
          <div className='mt-8px flex flex-wrap gap-8px'>
            <Tag color={user.role === 'admin' ? 'arcoblue' : 'gray'}>{t(`settings.account.roles.${user.role}`)}</Tag>
            <Tag color={user.status === 'active' ? 'green' : 'red'}>
              {t(`settings.account.statuses.${user.status}`)}
            </Tag>
          </div>
        </div>
        <div className='flex flex-wrap gap-8px'>
          <Button
            type='primary'
            icon={<Lock theme='outline' size={16} />}
            onClick={() => void navigate('/login/change-password', { state: { returnTo: '/settings/webui' } })}
          >
            {t('settings.account.changePassword')}
          </Button>
          <Button icon={<Logout theme='outline' size={16} />} onClick={() => void signOut()}>
            {t('settings.account.signOut')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AccountOverview;
