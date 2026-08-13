import { Alert, Spin } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import styles from './index.module.css';

const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { completeExternalLogin } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const result = await ipcBridge.auth.startExternalLogin.invoke();
        if (!active) return;
        if (result.success) {
          completeExternalLogin(result.token, { id: result.user.id, username: result.user.username });
          navigate('/guid', { replace: true });
        } else {
          setErrorMessage(result.message ?? t('login.errors.unknown'));
        }
      } catch (err) {
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