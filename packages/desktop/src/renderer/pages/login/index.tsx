/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import loginLogo from '@renderer/assets/logos/brand/app.png';
import AppLoader from '@renderer/components/layout/AppLoader';
import LanguageSwitcher from '@renderer/components/settings/LanguageSwitcher';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { readRememberedLogin, writeRememberedLogin } from '@/renderer/hooks/context/AuthContext/authStorage';
import { Alert, Button, Checkbox, Form, Input, Typography } from '@arco-design/web-react';
import { Lock, User } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import './LoginPage.css';

type LoginFormValues = {
  username: string;
  password: string;
  rememberMe: boolean;
};

const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, user, login } = useAuth();
  const [form] = Form.useForm<LoginFormValues>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('login-page-active');
    return () => {
      document.body.classList.remove('login-page-active');
    };
  }, []);

  useEffect(() => {
    document.title = t('login.pageTitle');
  }, [t]);

  useEffect(() => {
    const remembered = readRememberedLogin();
    form.setFieldsValue({
      username: remembered.username ?? '',
      password: '',
      rememberMe: remembered.remember,
    });
  }, [form]);

  useEffect(() => {
    if (status === 'authenticated') {
      void navigate(user?.must_change_password ? '/login/change-password' : '/guid', { replace: true });
    }
  }, [navigate, status, user?.must_change_password]);

  const handleSubmit = useCallback(
    async (values: LoginFormValues) => {
      const trimmedUsername = values.username.trim();
      if (!trimmedUsername || !values.password) {
        setError(t('login.errors.empty'));
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await login({
          username: trimmedUsername,
          password: values.password,
          remember: Boolean(values.rememberMe),
        });

        if (result.success) {
          writeRememberedLogin(trimmedUsername, Boolean(values.rememberMe));
          void navigate(result.user?.must_change_password ? '/login/change-password' : '/guid', { replace: true });
          return;
        }

        const errorText = (() => {
          switch (result.code) {
            case 'invalidCredentials':
              return t('login.errors.invalidCredentials');
            case 'tooManyAttempts':
              return t('login.errors.tooManyAttempts');
            case 'networkError':
              return t('login.errors.networkError');
            case 'serverError':
              return t('login.errors.serverError');
            case 'unknown':
            default:
              return t('login.errors.unknown');
          }
        })();
        setError(errorText);
      } catch (submitError) {
        console.error('Login flow failed:', submitError);
        setError(t('login.errors.networkError'));
      } finally {
        setLoading(false);
      }
    },
    [login, navigate, t]
  );

  if (status === 'checking') {
    return <AppLoader />;
  }

  return (
    <div className='login-page'>
      <div className='login-page__shell'>
        <div className='login-page__card'>
          <div className='login-page__toolbar'>
            <LanguageSwitcher />
          </div>

          <header className='login-page__header'>
            <img src={loginLogo} alt='' className='login-page__logo' width={48} height={48} />
            <h1 className='login-page__title'>{t('login.brand')}</h1>
            <p className='login-page__subtitle'>{t('login.subtitle')}</p>
          </header>

          {error ? (
            <Alert className='login-page__alert' type='error' content={error} closable onClose={() => setError(null)} />
          ) : null}

          <Form
            className='login-page__form'
            form={form}
            layout='vertical'
            size='large'
            autoComplete='on'
            requiredSymbol={false}
            onSubmit={handleSubmit}
          >
            <Form.Item
              field='username'
              label={t('login.username')}
              rules={[{ required: true, message: t('login.errors.empty') }]}
            >
              <Input
                prefix={<User theme='outline' size={16} />}
                placeholder={t('login.usernamePlaceholder')}
                autoComplete='username'
                autoFocus
              />
            </Form.Item>

            <Form.Item
              field='password'
              label={t('login.password')}
              rules={[{ required: true, message: t('login.errors.empty') }]}
            >
              <Input.Password
                prefix={<Lock theme='outline' size={16} />}
                placeholder={t('login.passwordPlaceholder')}
                autoComplete='current-password'
                visibilityToggle
              />
            </Form.Item>

            <div className='login-page__meta'>
              <Form.Item field='rememberMe' triggerPropName='checked' noStyle>
                <Checkbox>{t('login.rememberMe')}</Checkbox>
              </Form.Item>
            </div>

            <Button type='primary' htmlType='submit' long loading={loading}>
              {loading ? t('login.submitting') : t('login.submit')}
            </Button>
          </Form>
        </div>

        <Typography.Paragraph className='login-page__footer-note'>{t('login.footerPrimary')}</Typography.Paragraph>
      </div>
    </div>
  );
};

export default LoginPage;
