import { Alert, Button, Spin } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import styles from './index.module.css';

type Status = 'starting' | 'waitingForDeepLink' | 'error';

const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { completeExternalLogin } = useAuth();
  const [status, setStatus] = useState<Status>('starting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const unsubscribe = ipcBridge.auth.externalLoginCompleted.on((payload) => {
      if (!active) return;
      completeExternalLogin(payload.token, { id: payload.user.id, username: payload.user.username });
      navigate('/guid', { replace: true });
    });

    (async () => {
      try {
        const result = await ipcBridge.auth.startExternalLogin.invoke();
        if (!active) return;
        if (result.success) {
          setStatus('waitingForDeepLink');
        } else {
          setStatus('error');
          setErrorMessage(result.message ?? t('login.errors.unknown'));
        }
      } catch (err) {
        if (!active) return;
        setStatus('error');
        setErrorMessage((err as Error).message ?? t('login.errors.unknown'));
      }
    })();

    return () => {
      active = false;
      unsubscribe();
    };
  }, [completeExternalLogin, navigate, t]);

  const handleCancel = (): void => {
    window.close();
  };

  return (
    <div className={styles.center}>
      {status === 'error' ? (
        <>
          <Alert type='error' content={errorMessage ?? t('login.errors.unknown')} />
          <Button className={styles.cancelButton} onClick={handleCancel}>
            {t('login.cancel')}
          </Button>
        </>
      ) : (
        <div className={styles.spinnerBlock}>
          <Spin size={32} />
          <p className={styles.opening}>{t('login.opening')}</p>
          <Button className={styles.cancelButton} onClick={handleCancel}>
            {t('login.cancel')}
          </Button>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
