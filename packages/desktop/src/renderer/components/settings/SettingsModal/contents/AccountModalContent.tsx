/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Account settings tab (browser-loopback auth, P1).
 *
 * Shows the signed-in account (name / email / company, read from the LOCAL
 * registration-status bridge — no tokens) and a Logout button. Per founder
 * decision, logout removes the login from this Mac but KEEPS the local
 * entitlement + license wire so Command EVE stays usable offline. When not
 * signed in, offers a Sign-in button that triggers the web-login flow.
 *
 * Mirrors the Billing settings panel structure (Card + bridge wiring); the
 * decisions all live in the main process — this is presentation only.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { commandEve, type ICommandEveRegistrationStatusResult } from '@/common/adapter/ipcBridge';

const AccountModalContent: React.FC = () => {
  const { t } = useTranslation();
  const [info, setInfo] = useState<ICommandEveRegistrationStatusResult | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await commandEve.registrationStatus.invoke();
      if (response.data?.ok) setInfo(response.data);
    } catch {
      // self-quiet
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      const response = await commandEve.authLogout.invoke();
      if (response.data?.ok) {
        await refresh();
      } else {
        Message.error(t('settings.accountPanel.logout'));
      }
    } catch {
      Message.error(t('settings.accountPanel.logout'));
    } finally {
      setLoggingOut(false);
    }
  }, [refresh, t]);

  const handleLogin = useCallback(async () => {
    setLoggingIn(true);
    try {
      await commandEve.authWebLogin.invoke({ intent: 'login' });
      await refresh();
    } catch {
      // self-quiet; the gate / avatar reflect the real state
    } finally {
      setLoggingIn(false);
    }
  }, [refresh]);

  const signedIn = Boolean(info?.has_session);

  return (
    <div className='flex flex-col gap-16px max-w-640px' data-testid='account-settings'>
      <Card title={t('settings.accountPanel.title', { defaultValue: 'Account' })}>
        {signedIn ? (
          <div className='flex flex-col gap-12px'>
            <div className='text-13px text-t-tertiary'>{t('settings.accountPanel.signedInAs')}</div>
            {info?.name ? (
              <div className='flex justify-between gap-8px'>
                <span className='text-t-tertiary'>{t('settings.accountPanel.name')}</span>
                <span className='text-t-primary font-[500]' data-testid='account-name'>
                  {info.name}
                </span>
              </div>
            ) : null}
            {info?.email ? (
              <div className='flex justify-between gap-8px'>
                <span className='text-t-tertiary'>{t('settings.accountPanel.email')}</span>
                <span className='text-t-primary font-[500]' data-testid='account-email'>
                  {info.email}
                </span>
              </div>
            ) : null}
            {info?.company ? (
              <div className='flex justify-between gap-8px'>
                <span className='text-t-tertiary'>{t('settings.accountPanel.company')}</span>
                <span className='text-t-primary font-[500]'>{info.company}</span>
              </div>
            ) : null}

            <Button
              status='danger'
              shape='round'
              loading={loggingOut}
              onClick={() => void handleLogout()}
              data-testid='account-logout'
            >
              {loggingOut ? t('settings.accountPanel.loggingOut') : t('settings.accountPanel.logout')}
            </Button>
            <span className='text-12px text-t-tertiary'>{t('settings.accountPanel.logoutHint')}</span>
          </div>
        ) : (
          <div className='flex flex-col gap-12px'>
            <div className='text-13px text-t-tertiary' data-testid='account-not-signed-in'>
              {t('settings.accountPanel.notSignedIn')}
            </div>
            {info?.email ? (
              <div className='flex justify-between gap-8px'>
                <span className='text-t-tertiary'>{t('settings.accountPanel.email')}</span>
                <span className='text-t-primary font-[500]'>{info.email}</span>
              </div>
            ) : null}
            <Button
              type='primary'
              shape='round'
              loading={loggingIn}
              onClick={() => void handleLogin()}
              data-testid='account-login'
            >
              {t('settings.accountPanel.login')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AccountModalContent;
