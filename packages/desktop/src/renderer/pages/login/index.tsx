import { Alert, Button, Checkbox, Input, Modal } from '@arco-design/web-react';
import { BookOpen, Eye, EyeOff, HelpCircle, Lock, Mail } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import AppLoader from '@renderer/components/layout/AppLoader';
import { useAuth } from '../../hooks/context/AuthContext';
import './LoginPage.css';

type MessageState = { type: 'error' | 'success'; text: string };
type AuthMode = 'login' | 'register';

const REMEMBER_ME_KEY = 'rememberMe';
const REMEMBERED_USERNAME_KEY = 'rememberedUsername';

const obfuscateUsername = (text: string): string => {
  const encoded = btoa(encodeURIComponent(text));
  return encoded.split('').toReversed().join('');
};

const deobfuscateUsername = (text: string): string => {
  try {
    const reversed = text.split('').toReversed().join('');
    return decodeURIComponent(atob(reversed));
  } catch {
    return '';
  }
};

const LoginPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { status, login, register, sendEmailVerification } = useAuth();

  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [rememberMe] = useState(true);
  const [agreedTerms, setAgreedTerms] = useState(true);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [awaitingTwoFactor, setAwaitingTwoFactor] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [loading, setLoading] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const [messageTimer, setMessageTimer] = useState<number | undefined>(undefined);

  useEffect(() => {
    document.body.classList.add('login-page-active');
    return () => {
      document.body.classList.remove('login-page-active');
      window.clearTimeout(messageTimer);
    };
  }, [messageTimer]);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    const isRememberMe = localStorage.getItem(REMEMBER_ME_KEY) === 'true';
    localStorage.removeItem('rememberedPassword');
    if (isRememberMe) {
      const storedUsername = localStorage.getItem(REMEMBERED_USERNAME_KEY);
      if (storedUsername) setUsername(deobfuscateUsername(storedUsername));
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') void navigate('/guid', { replace: true });
  }, [navigate, status]);

  const showMessage = useCallback(
    (next: MessageState) => {
      setMessage(next);
      window.clearTimeout(messageTimer);
      const timer = window.setTimeout(() => setMessage(null), 5000);
      setMessageTimer(timer);
    },
    [messageTimer]
  );

  const handleSendVerificationCode = useCallback(async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showMessage({ type: 'error', text: t('login.errors.emptyEmail') });
      return;
    }
    setSendingCode(true);
    const result = await sendEmailVerification(trimmedEmail);
    setSendingCode(false);
    showMessage(
      result.success
        ? { type: 'success', text: t('login.verificationSent') }
        : {
            type: 'error',
            text: result.message ?? t('login.errors.verificationFailed'),
          }
    );
  }, [email, showMessage, sendEmailVerification, t]);

  const saveRememberedCredentials = useCallback(
    (trimmedUsername: string) => {
      if (rememberMe) {
        localStorage.setItem(REMEMBER_ME_KEY, 'true');
        localStorage.setItem(REMEMBERED_USERNAME_KEY, obfuscateUsername(trimmedUsername));
      } else {
        localStorage.removeItem(REMEMBER_ME_KEY);
        localStorage.removeItem(REMEMBERED_USERNAME_KEY);
      }
    },
    [rememberMe]
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const trimmedUsername = username.trim();

      if (!agreedTerms) {
        showMessage({ type: 'error', text: t('login.errors.termsRequired') });
        return;
      }
      if (!awaitingTwoFactor && (!trimmedUsername || !password)) {
        showMessage({ type: 'error', text: t('login.errors.empty') });
        return;
      }
      if (authMode === 'register' && password.length < 6) {
        showMessage({ type: 'error', text: t('login.errors.passwordTooShort') });
        return;
      }
      if (awaitingTwoFactor && !totpCode) {
        showMessage({ type: 'error', text: t('login.errors.emptyTotpCode') });
        return;
      }

      setLoading(true);
      setMessage(null);

      if (authMode === 'register') {
        const registration = await register({
          username: trimmedUsername,
          password,
          ...(email.trim() ? { email: email.trim() } : {}),
          ...(verificationCode.trim() ? { verificationCode: verificationCode.trim() } : {}),
        });
        if (!registration.success) {
          setLoading(false);
          showMessage({
            type: 'error',
            text: registration.message ?? t('login.errors.registrationFailed'),
          });
          return;
        }
      }

      const result = await login({
        username: trimmedUsername,
        password,
        remember: rememberMe,
        ...(awaitingTwoFactor ? { totpCode } : {}),
      });

      if (result.twoFactorRequired) {
        setAwaitingTwoFactor(true);
        setTotpCode('');
        showMessage({ type: 'success', text: t('login.twoFactorPrompt') });
        setLoading(false);
        return;
      }

      if (result.success) {
        saveRememberedCredentials(trimmedUsername);
        showMessage({
          type: 'success',
          text: authMode === 'register' ? t('login.registerSuccess') : t('login.success'),
        });
        window.setTimeout(async (): Promise<void> => {
          await navigate('/guid', { replace: true });
        }, 600);
      } else {
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
            default:
              return result.message ?? t('login.errors.unknown');
          }
        })();
        showMessage({ type: 'error', text: errorText });
      }

      setLoading(false);
    },
    [
      agreedTerms,
      authMode,
      awaitingTwoFactor,
      login,
      navigate,
      password,
      register,
      rememberMe,
      saveRememberedCredentials,
      showMessage,
      t,
      totpCode,
      username,
    ]
  );

  if (status === 'checking') return <AppLoader />;

  return (
    <div className='login-page'>
      {message?.type === 'success' && (
        <div className='login-page__toast' role='status'>
          <span className='login-page__toast-dot' />
          {message.text}
        </div>
      )}

      <header className='login-page__header-bar'>
        <Button
          type='text'
          className='login-page__help-button'
          onClick={() =>
            Modal.info({
              title: t('login.supportTitle'),
              content: t('login.supportContent'),
            })
          }
        >
          <HelpCircle size={16} />
          <span>{t('login.helpSupport')}</span>
        </Button>
      </header>

      <main className='login-page__main'>
        <div className='login-page__card'>
          <div className='login-page__header'>
            <div>
              <h2 className='login-page__title'>
                {authMode === 'login' ? t('login.welcomeTitle') : t('login.registerTitle')}
              </h2>
              <p className='login-page__subtitle'>
                {authMode === 'login' ? t('login.subtitle') : t('login.registerSubtitle')}
              </p>
            </div>
            <Button
              type='text'
              className='login-page__mode-switch'
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'register' : 'login');
                setAwaitingTwoFactor(false);
                setEmail('');
                setVerificationCode('');
                setMessage(null);
              }}
            >
              {authMode === 'login' ? t('login.registerMode') : t('login.loginMode')}
            </Button>
          </div>

          {message?.type === 'error' && (
            <Alert
              className='login-page__error'
              type='error'
              content={
                <span className='login-page__error-content'>
                  <span className='login-page__error-dot' />
                  {message.text}
                </span>
              }
            />
          )}

          {authMode === 'register' && (
            <>
              <label className='login-page__label login-page__label--extra' htmlFor='email'>
                {t('login.email')}
              </label>
              <Input
                id='email'
                className='login-page__input'
                placeholder={t('login.emailPlaceholder')}
                type='email'
                autoComplete='email'
                value={email}
                onChange={setEmail}
                prefix={<Mail size={16} />}
              />
              <Button
                type='text'
                className='login-page__forgot-button'
                loading={sendingCode}
                onClick={handleSendVerificationCode}
              >
                {t('login.sendCode')}
              </Button>
              <label className='login-page__label login-page__label--extra' htmlFor='verification-code'>
                {t('login.verificationCode')}
              </label>
              <Input
                id='verification-code'
                className='login-page__input'
                placeholder={t('login.verificationCodePlaceholder')}
                autoComplete='one-time-code'
                value={verificationCode}
                onChange={setVerificationCode}
              />
            </>
          )}

          <form className='login-page__form' onSubmit={handleSubmit}>
            <label className='login-page__label' htmlFor='username'>
              {t('login.username')}
            </label>
            <Input
              id='username'
              className='login-page__input'
              placeholder={t('login.usernamePlaceholder')}
              autoComplete='username'
              value={username}
              onChange={setUsername}
              prefix={<Mail size={16} />}
            />

            <div className='login-page__password-label-row'>
              <label className='login-page__label' htmlFor='password'>
                {t('login.password')}
              </label>
              <Button
                type='text'
                className='login-page__forgot-button'
                onClick={() =>
                  Modal.info({
                    title: t('login.resetPasswordTitle'),
                    content: t('login.resetPasswordContent'),
                  })
                }
              >
                {t('login.forgotPassword')}
              </Button>
            </div>
            <Input
              id='password'
              className='login-page__input'
              placeholder={t('login.passwordPlaceholder')}
              type={passwordVisible ? 'text' : 'password'}
              autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
              value={password}
              onChange={setPassword}
              prefix={<Lock size={16} />}
              suffix={
                <Button
                  type='text'
                  className='login-page__icon-button'
                  aria-label={passwordVisible ? t('login.hidePassword') : t('login.showPassword')}
                  onClick={() => setPasswordVisible((previous) => !previous)}
                >
                  {passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
              }
            />

            {awaitingTwoFactor && (
              <>
                <label className='login-page__label login-page__label--extra' htmlFor='totp-code'>
                  {t('login.totpCode')}
                </label>
                <Input
                  id='totp-code'
                  className='login-page__input'
                  placeholder={t('login.totpCodePlaceholder')}
                  autoComplete='one-time-code'
                  value={totpCode}
                  onChange={setTotpCode}
                />
              </>
            )}

            <div className='login-page__terms'>
              <Checkbox className='login-page__terms-checkbox' checked={agreedTerms} onChange={setAgreedTerms} />
              <span>
                {t('login.termsPrefix')}{' '}
                <Button type='text' className='login-page__terms-link' onClick={() => setTermsVisible(true)}>
                  {t('login.serviceAgreement')}
                </Button>{' '}
                {t('login.termsAnd')}{' '}
                <Button type='text' className='login-page__terms-link' onClick={() => setTermsVisible(true)}>
                  {t('login.privacyStatement')}
                </Button>
              </span>
            </div>

            <Button type='primary' htmlType='submit' className='login-page__submit' loading={loading}>
              {authMode === 'login' ? t('login.submit') : t('login.register')}
            </Button>
          </form>
        </div>
      </main>

      <Modal
        className='login-page__terms-modal'
        visible={termsVisible}
        title={
          <span className='login-page__terms-modal-title'>
            <BookOpen size={20} />
            {t('login.termsModalTitle')}
          </span>
        }
        footer={
          <Button
            type='primary'
            className='login-page__terms-confirm'
            onClick={() => {
              setAgreedTerms(true);
              setTermsVisible(false);
            }}
          >
            {t('login.termsConfirm')}
          </Button>
        }
        onCancel={() => setTermsVisible(false)}
      >
        <section className='login-page__terms-content'>
          <h3>{t('login.termsSection1Title')}</h3>
          <p>{t('login.termsSection1Body')}</p>
          <h3>{t('login.termsSection2Title')}</h3>
          <p>{t('login.termsSection2Body')}</p>
          <h3>{t('login.termsSection3Title')}</h3>
          <p>{t('login.termsSection3Body')}</p>
        </section>
      </Modal>

      <footer className='login-page__footer'>{t('login.footer')}</footer>
    </div>
  );
};

export default LoginPage;
