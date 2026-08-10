/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import loginLogo from '@renderer/assets/logos/brand/app.png';
import AppLoader from '@renderer/components/layout/AppLoader';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { Alert, Button, Form, Input, Message, Space } from '@arco-design/web-react';
import { Lock } from '@icon-park/react';
import React, { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import './LoginPage.css';

type PasswordFormValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type ChangePasswordLocationState = {
  returnTo?: string;
};

const ChangePasswordPage: React.FC = () => {
  const { t } = useTranslation();
  const { status, user, changePassword, logout } = useAuth();
  const [form] = Form.useForm<PasswordFormValues>();
  const [message, messageContext] = Message.useMessage();
  const navigate = useNavigate();
  const location = useLocation();
  const forced = Boolean(user?.must_change_password);
  const state = location.state as ChangePasswordLocationState | null;
  const returnTo = state?.returnTo === '/settings/webui' ? state.returnTo : '/guid';

  useEffect(() => {
    document.body.classList.add('login-page-active');
    return () => {
      document.body.classList.remove('login-page-active');
    };
  }, []);

  useEffect(() => {
    document.title = t('login.changePassword.pageTitle');
  }, [t]);

  const handleSubmit = useCallback(
    async (values: PasswordFormValues) => {
      try {
        const nextUser = await changePassword({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        });
        message.success(t('login.changePassword.success'));
        form.resetFields();
        void navigate(nextUser.must_change_password ? '/login/change-password' : returnTo, { replace: true });
      } catch (error) {
        const errorKeys: Record<string, string> = {
          INVALID_CURRENT_PASSWORD: 'login.changePassword.errors.invalidCurrent',
          PASSWORD_TOO_SHORT: 'login.changePassword.errors.tooShort',
          PASSWORD_TOO_LONG: 'login.changePassword.errors.tooLong',
          PASSWORD_TOO_COMMON: 'login.changePassword.errors.tooCommon',
          PASSWORD_REUSED: 'login.changePassword.errors.reused',
        };
        const key = isBackendHttpError(error) ? errorKeys[error.code] : undefined;
        message.error(
          isBackendHttpError(error) && error.status === 404
            ? t('settings.account.errors.featureUnavailable')
            : key
              ? t(key)
              : t('login.changePassword.errors.failed')
        );
      }
    },
    [changePassword, form, message, navigate, returnTo, t]
  );

  if (status === 'checking') return <AppLoader />;
  if (status !== 'authenticated') return <Navigate to='/login' replace />;
  if (!user) return <Navigate to='/guid' replace />;

  return (
    <div className='login-page'>
      {messageContext}
      <div className='login-page__shell'>
        <div className='login-page__card'>
          <header className='login-page__header'>
            <img src={loginLogo} alt='' className='login-page__logo' width={48} height={48} />
            <h1 className='login-page__title'>{t('login.changePassword.title')}</h1>
            <p className='login-page__subtitle'>
              {forced ? t('login.changePassword.forcedDescription') : t('login.changePassword.description')}
            </p>
          </header>

          {forced ? (
            <Alert className='login-page__alert' type='warning' content={t('login.changePassword.forcedNotice')} />
          ) : null}

          <Form
            className='login-page__form'
            form={form}
            layout='vertical'
            size='large'
            autoComplete='off'
            requiredSymbol={false}
            onSubmit={handleSubmit}
          >
            <Form.Item
              field='currentPassword'
              label={t('login.changePassword.currentPassword')}
              rules={[{ required: true, message: t('login.changePassword.errors.currentRequired') }]}
            >
              <Input.Password
                prefix={<Lock theme='outline' size={16} />}
                placeholder={t('login.changePassword.currentPasswordPlaceholder')}
                autoComplete='current-password'
              />
            </Form.Item>
            <Form.Item
              field='newPassword'
              label={t('login.changePassword.newPassword')}
              rules={[
                { required: true, message: t('login.changePassword.errors.newRequired') },
                { minLength: 8, message: t('login.changePassword.errors.tooShort') },
                {
                  validator: (value, callback) => {
                    if (value && value === form.getFieldValue('currentPassword')) {
                      callback(t('login.changePassword.errors.samePassword'));
                      return;
                    }
                    callback();
                  },
                },
              ]}
            >
              <Input.Password
                prefix={<Lock theme='outline' size={16} />}
                placeholder={t('login.changePassword.newPasswordPlaceholder')}
                autoComplete='new-password'
              />
            </Form.Item>
            <Form.Item
              field='confirmPassword'
              label={t('login.changePassword.confirmPassword')}
              rules={[
                { required: true, message: t('login.changePassword.errors.confirmRequired') },
                {
                  validator: (value, callback) => {
                    if (value !== form.getFieldValue('newPassword')) {
                      callback(t('login.changePassword.errors.mismatch'));
                      return;
                    }
                    callback();
                  },
                },
              ]}
            >
              <Input.Password
                prefix={<Lock theme='outline' size={16} />}
                placeholder={t('login.changePassword.confirmPasswordPlaceholder')}
                autoComplete='new-password'
              />
            </Form.Item>

            <Space direction='vertical' className='w-full' size={10}>
              <Button type='primary' htmlType='submit' long>
                {t('login.changePassword.submit')}
              </Button>
              {forced ? (
                <Button type='text' long onClick={() => void logout()}>
                  {t('login.changePassword.signOut')}
                </Button>
              ) : (
                <Button type='text' long onClick={() => void navigate(returnTo, { replace: true })}>
                  {t('common.cancel')}
                </Button>
              )}
            </Space>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default ChangePasswordPage;
