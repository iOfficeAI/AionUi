/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, Button, Input, Message, Spin, Typography } from '@arco-design/web-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import type { GeaEnvironmentStatus, LarkAuthErrorCode, LarkQrLoginSession } from '@/common/types/platform/larkAuth';
import { useAuth } from '@renderer/hooks/context/AuthContext';

const POLL_INTERVAL_MS = 1500;

type LoginPhase = 'environmentLoading' | 'ready' | 'loading' | 'waiting' | 'expired' | 'error';
type EnvironmentError = 'invalidAddress' | 'loadFailed' | 'saveFailed' | null;

const LarkQrLogin = () => {
  const { t } = useTranslation();
  const { getGeaEnvironment, pollLarkQrLogin, startLarkQrLogin, updateGeaEnvironment } = useAuth();
  const [environment, setEnvironment] = useState<GeaEnvironmentStatus | null>(null);
  const [environmentAddress, setEnvironmentAddress] = useState('');
  const [environmentError, setEnvironmentError] = useState<EnvironmentError>(null);
  const [session, setSession] = useState<LarkQrLoginSession | null>(null);
  const [phase, setPhase] = useState<LoginPhase>('environmentLoading');
  const [errorCode, setErrorCode] = useState<LarkAuthErrorCode>('networkError');
  const requestVersionRef = useRef(0);

  const startLogin = useCallback(async (): Promise<void> => {
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setSession(null);
    setEnvironmentError(null);
    setPhase('loading');

    try {
      const result = await startLarkQrLogin();
      if (requestVersionRef.current !== requestVersion) return;
      if (result.success === false) {
        setErrorCode(result.code);
        setPhase('error');
        return;
      }
      setSession(result.data);
      setPhase('waiting');
    } catch {
      if (requestVersionRef.current === requestVersion) {
        setErrorCode('networkError');
        setPhase('error');
      }
    }
  }, [startLarkQrLogin]);

  const loadEnvironment = useCallback(async (): Promise<void> => {
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setPhase('environmentLoading');
    setEnvironmentError(null);
    try {
      const result = await getGeaEnvironment();
      if (requestVersionRef.current !== requestVersion) return;
      if (result.success === false) {
        setEnvironmentError('loadFailed');
        setPhase('error');
        return;
      }
      setEnvironment(result.data);
      setEnvironmentAddress(result.data.baseUrl);
      setPhase('ready');
    } catch {
      if (requestVersionRef.current === requestVersion) {
        setEnvironmentError('loadFailed');
        setPhase('error');
      }
    }
  }, [getGeaEnvironment]);

  useEffect(() => {
    void loadEnvironment();
    return () => {
      requestVersionRef.current += 1;
    };
  }, [loadEnvironment]);

  useEffect(() => {
    if (!session || phase !== 'waiting') return;

    let cancelled = false;
    let timer: number | undefined;
    const poll = async (): Promise<void> => {
      try {
        const result = await pollLarkQrLogin(session.qrcodeId);
        if (cancelled) return;
        if (result.success === false) {
          setErrorCode(result.code);
          setPhase('error');
          return;
        }
        if (result.data.status === 'expired') {
          setPhase('expired');
          return;
        }
        if (result.data.status === 'pending') {
          timer = window.setTimeout((): void => {
            void poll();
          }, POLL_INTERVAL_MS);
        }
        if (result.data.status === 'authenticated' && result.data.personalModelSync) {
          const sync = result.data.personalModelSync;
          if (sync.status === 'unavailable') {
            Message.warning(t('login.lark.personalModels.unavailable'));
          } else if (sync.reason === 'credentialRecoveryRequired') {
            Message.warning(t('settings.personalModelCredentialRecoveryRequired'));
          } else if (sync.status === 'partial') {
            Message.warning(t('login.lark.personalModels.partial'));
          } else if (sync.configured > 0) {
            Message.success(t('login.lark.personalModels.configured', { count: sync.configured }));
          }
        }
      } catch {
        if (!cancelled) {
          setErrorCode('networkError');
          setPhase('error');
        }
      }
    };

    timer = window.setTimeout((): void => {
      void poll();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [phase, pollLarkQrLogin, session, t]);

  const applyEnvironment = useCallback(async (): Promise<void> => {
    if (!environment?.editable || environmentAddress.trim() === environment.baseUrl) return;
    const requestVersion = ++requestVersionRef.current;
    setSession(null);
    setEnvironmentError(null);
    setPhase('loading');
    try {
      const result = await updateGeaEnvironment(environmentAddress);
      if (requestVersionRef.current !== requestVersion) return;
      if (result.success === false) {
        setEnvironmentError(result.code === 'invalidResponse' ? 'invalidAddress' : 'saveFailed');
        setPhase('error');
        return;
      }
      setEnvironment(result.data.environment);
      setEnvironmentAddress(result.data.environment.baseUrl);
      await startLogin();
    } catch {
      setEnvironmentError('saveFailed');
      setPhase('error');
    }
  }, [environment, environmentAddress, startLogin, updateGeaEnvironment]);

  const errorMessage =
    environmentError === 'invalidAddress'
      ? t('login.lark.environment.errors.invalidAddress')
      : environmentError === 'loadFailed'
        ? t('login.lark.environment.errors.loadFailed')
        : environmentError === 'saveFailed'
          ? t('login.lark.environment.errors.saveFailed')
          : errorCode === 'secureStorageUnavailable'
            ? t('login.lark.errors.secureStorageUnavailable')
            : errorCode === 'invalidResponse'
              ? t('login.lark.errors.invalidResponse')
              : errorCode === 'serverError'
                ? t('login.lark.errors.serverError')
                : t('login.lark.errors.networkError');

  const environmentChanged = Boolean(environment?.editable && environmentAddress.trim() !== environment.baseUrl);

  return (
    <div className='flex flex-col items-center gap-16px py-8px'>
      <div className='text-center'>
        <Typography.Title heading={6} className='!mb-4px'>
          {t('login.lark.title')}
        </Typography.Title>
        <Typography.Text type='secondary'>{t('login.lark.instruction')}</Typography.Text>
      </div>

      <div className='w-full flex flex-col gap-8px'>
        <Typography.Text className='font-500'>{t('login.lark.environment.label')}</Typography.Text>
        <Input
          aria-label={t('login.lark.environment.label')}
          disabled={!environment?.editable || phase === 'environmentLoading' || phase === 'loading'}
          maxLength={2048}
          onChange={(value) => {
            requestVersionRef.current += 1;
            setEnvironmentAddress(value);
            setSession(null);
            setEnvironmentError(null);
            setPhase('ready');
          }}
          placeholder={t('login.lark.environment.placeholder')}
          size='large'
          value={environmentAddress}
        />
        {environment && !environment.editable && (
          <Typography.Text type='secondary' className='text-12px'>
            {t('login.lark.environment.managed')}
          </Typography.Text>
        )}
        {environment && (phase === 'ready' || (phase === 'error' && environmentError)) && (
          <Button long onClick={() => void (environmentChanged ? applyEnvironment() : startLogin())} type='primary'>
            {environmentChanged ? t('login.lark.environment.apply') : t('login.lark.environment.continue')}
          </Button>
        )}
      </div>

      {(phase === 'environmentLoading' || phase === 'loading') && (
        <div className='h-184px flex items-center justify-center'>
          <Spin
            tip={
              phase === 'environmentLoading'
                ? t('login.lark.environment.loading')
                : environmentChanged
                  ? t('login.lark.environment.saving')
                  : t('login.lark.loading')
            }
          />
        </div>
      )}

      {session && phase !== 'loading' && (
        <div className='p-12px rd-8px shadow-sm' aria-label={t('login.lark.qrCodeLabel')}>
          <QRCodeSVG value={session.loginUrl} size={184} level='M' title={t('login.lark.qrCodeLabel')} />
        </div>
      )}

      {phase === 'waiting' && <Typography.Text type='secondary'>{t('login.lark.waiting')}</Typography.Text>}

      {phase === 'expired' && <Alert type='warning' content={t('login.lark.expired')} className='w-full' showIcon />}

      {phase === 'error' && <Alert type='error' content={errorMessage} className='w-full' showIcon />}

      {(phase === 'expired' || phase === 'error') && !environmentChanged && (
        <Button type='primary' onClick={() => void (environmentError ? loadEnvironment() : startLogin())}>
          {environmentError ? t('login.lark.environment.retry') : t('login.lark.refresh')}
        </Button>
      )}
    </div>
  );
};

export default LarkQrLogin;
