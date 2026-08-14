import { Alert, Spin } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import type { ExternalLoginOutcome } from '@/process/auth';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import styles from './index.module.css';

const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { completeExternalLogin } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    console.log('[LoginPage] mount, calling startExternalLogin');

    (async () => {
      try {
        const result: ExternalLoginOutcome = await ipcBridge.auth.startExternalLogin.invoke();
        console.log('[LoginPage] startExternalLogin resolved', result);
        if (!active) return;
        if (result.success) {
          completeExternalLogin(result.token, { id: result.user.id, username: result.user.username });
          navigate('/guid', { replace: true });
        } else {
          const errorResult = result as Extract<ExternalLoginOutcome, { success: false }>;
          setErrorMessage(errorResult.message ?? t('login.errors.unknown'));
        }
      } catch (err) {
        console.log('[LoginPage] startExternalLogin rejected', err);
        if (!active) return;
        setErrorMessage((err as Error).message ?? t('login.errors.unknown'));
      }
    })();

    return () => {
      active = false;
    };
  }, [completeExternalLogin, navigate, t]);

  return (
    <div className={styles.center}>
      {errorMessage ? (
        <Alert type='error' content={errorMessage} />
      ) : (
        <div className={styles.spinnerBlock}>
          <Spin size={32} />
          <p className={styles.opening}>{t('login.opening')}</p>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
