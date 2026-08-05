/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, Button, Message, Spin, Typography } from '@arco-design/web-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import type { LarkAuthErrorCode, LarkQrLoginSession } from '@/common/types/platform/larkAuth';
import { useAuth } from '@renderer/hooks/context/AuthContext';

const POLL_INTERVAL_MS = 1500;

type LoginPhase = 'loading' | 'waiting' | 'expired' | 'error';

const LarkQrLogin = () => {
  const { t } = useTranslation();
  const { pollLarkQrLogin, startLarkQrLogin } = useAuth();
  const [session, setSession] = useState<LarkQrLoginSession | null>(null);
  const [phase, setPhase] = useState<LoginPhase>('loading');
  const [errorCode, setErrorCode] = useState<LarkAuthErrorCode>('networkError');
  const requestVersionRef = useRef(0);

  const startLogin = useCallback(async (): Promise<void> => {
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setSession(null);
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

  useEffect(() => {
    void startLogin();
    return () => {
      requestVersionRef.current += 1;
    };
  }, [startLogin]);

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

  const errorMessage =
    errorCode === 'invalidResponse'
      ? t('login.lark.errors.invalidResponse')
      : errorCode === 'serverError'
        ? t('login.lark.errors.serverError')
        : t('login.lark.errors.networkError');

  return (
    <div className='flex flex-col items-center gap-16px py-8px'>
      <div className='text-center'>
        <Typography.Title heading={6} className='!mb-4px'>
          {t('login.lark.title')}
        </Typography.Title>
        <Typography.Text type='secondary'>{t('login.lark.instruction')}</Typography.Text>
      </div>

      {phase === 'loading' && (
        <div className='h-184px flex items-center justify-center'>
          <Spin tip={t('login.lark.loading')} />
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

      {(phase === 'expired' || phase === 'error') && (
        <Button type='primary' onClick={() => void startLogin()}>
          {t('login.lark.refresh')}
        </Button>
      )}
    </div>
  );
};

export default LarkQrLogin;
