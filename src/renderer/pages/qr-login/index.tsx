import loginLogo from '@renderer/assets/logos/brand/app.png';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import '../login/LoginPage.css';

type QRLoginState = 'checking' | 'success' | 'error';

const QRLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refresh } = useAuth();
  const [state, setState] = useState<QRLoginState>('checking');
  const [message, setMessage] = useState('Verifying QR login... / 正在验证二维码登录...');
  const handledRef = useRef(false);

  useEffect(() => {
    document.body.classList.add('login-page-active');
    document.title = 'QR Login - AionUi';
    return () => {
      document.body.classList.remove('login-page-active');
    };
  }, []);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const qrToken = searchParams.get('token');
    if (!qrToken) {
      setState('error');
      setMessage('Invalid QR code. / 二维码无效。');
      return;
    }

    void (async () => {
      try {
        const response = await fetch('/api/auth/qr-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ qrToken, qr_token: qrToken }),
        });

        const data = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          message?: string;
        };

        if (!response.ok || !data.success) {
          setState('error');
          setMessage(data.error || data.message || 'QR code expired or invalid. / 二维码已过期或无效。');
          return;
        }

        setState('success');
        setMessage('Login successful. Redirecting... / 登录成功，正在跳转...');
        await refresh();
        window.setTimeout(() => {
          void navigate('/guid', { replace: true });
        }, 600);
      } catch (error) {
        console.error('QR login failed:', error);
        setState('error');
        setMessage('Network error. Please try again. / 网络错误，请重试。');
      }
    })();
  }, [navigate, refresh, searchParams]);

  return (
    <div className='login-page'>
      <div className='login-page__card'>
        <div className='login-page__header'>
          <div className='login-page__logo'>
            <img src={loginLogo} alt='AionUi' />
          </div>
          <h1 className='login-page__title'>AionUi</h1>
          <p className='login-page__subtitle'>QR Login / 二维码登录</p>
        </div>

        <div
          role='status'
          aria-live='polite'
          className={`login-page__message login-page__message--visible ${
            state === 'success' ? 'login-page__message--success' : state === 'error' ? 'login-page__message--error' : ''
          }`}
        >
          {message}
        </div>

        {state === 'checking' && (
          <div className='login-page__footer'>
            <svg className='login-page__spinner' viewBox='0 0 24 24' width='24' height='24' aria-hidden='true'>
              <circle
                cx='12'
                cy='12'
                r='10'
                stroke='currentColor'
                strokeWidth='3'
                fill='none'
                strokeDasharray='50'
                strokeDashoffset='25'
                strokeLinecap='round'
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};

export default QRLoginPage;
