import { Alert } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { EXTERNAL_LOGIN_ALLOWED_ORIGINS, EXTERNAL_LOGIN_URL } from '@/renderer/api';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import styles from './index.module.css';

interface ExternalLoginSuccessMessage {
  type: 'external-login-success';
  token: string;
  user: { id: string; username: string };
}

function isAllowedOrigin(origin: string): boolean {
  return EXTERNAL_LOGIN_ALLOWED_ORIGINS.includes(origin);
}

function isValidMessage(data: unknown): data is ExternalLoginSuccessMessage {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as Partial<ExternalLoginSuccessMessage>;
  if (candidate.type !== 'external-login-success') return false;
  if (typeof candidate.token !== 'string' || candidate.token.length === 0) return false;
  if (!candidate.user || typeof candidate.user !== 'object') return false;
  const { id, username } = candidate.user as { id?: unknown; username?: unknown };
  if (typeof id !== 'string' || typeof username !== 'string') return false;
  return true;
}

const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, completeExternalLogin } = useAuth();
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!isAllowedOrigin(event.origin)) {
        console.warn('[LoginPage] postMessage from disallowed origin:', event.origin);
        return;
      }
      if (!isValidMessage(event.data)) {
        console.warn('[LoginPage] postMessage payload invalid:', event.data);
        return;
      }
      completeExternalLogin(event.data.token, {
        id: event.data.user.id,
        username: event.data.user.username,
      });
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
    };
  }, [completeExternalLogin]);

  useEffect(() => {
    if (status === 'authenticated') {
      void navigate('/guid', { replace: true });
    }
  }, [status, navigate]);

  return (
    <div className={styles.fullscreen}>
      <iframe
        className={styles.iframe}
        src={EXTERNAL_LOGIN_URL}
        sandbox='allow-scripts allow-same-origin allow-forms'
        referrerPolicy='no-referrer'
        title={t('login.externalTitle')}
      />
      {errorKey ? (
        <div className={styles.errorBanner}>
          <Alert type='error' content={t(errorKey)} />
        </div>
      ) : null}
    </div>
  );
};

export default LoginPage;
