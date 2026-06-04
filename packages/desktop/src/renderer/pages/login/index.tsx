import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '@/renderer/services/i18n';
import { useNavigate } from 'react-router-dom';
import AppLoader from '@renderer/components/layout/AppLoader';
import { useAuth } from '../../hooks/context/AuthContext';
import './LoginPage.css';

type MessageState = {
  type: 'error' | 'success';
  text: string;
};

type CommandEveLanguage = {
  code: string;
  label: string;
  short: string;
  flag: string;
};

const REMEMBER_ME_KEY = 'rememberMe';
const REMEMBERED_USERNAME_KEY = 'rememberedUsername';
const REMEMBERED_PASSWORD_KEY = 'rememberedPassword';
const COMMAND_EVE_DEFAULT_LANGUAGE = 'de-DE';
const COMMAND_EVE_LANGUAGE_BOOTSTRAPPED_KEY = 'commandEveLanguageBootstrapped';
const COMMAND_EVE_DEFAULT_VERSION = 'v1.x';
const COMMAND_EVE_BRAND_CONFIG_URL = '/command-eve-brand.json?v=command-eve-brand-20260604';
const COMMAND_EVE_LOGIN_VIDEO = '/eve-wait-focus.mp4?v=command-eve-login-20260604';
const COMMAND_EVE_LOGIN_ANIMATION = '/eve-wait-focus-loop.gif?v=command-eve-login-20260604';
const COMMAND_EVE_LOGIN_POSTER = '/eve-wait-focus-anchor.png?v=command-eve-login-20260604';
const COMMAND_EVE_HERO_FIELD_GAP = 32;
const COMMAND_EVE_HERO_FIELD_RADIUS = 175;
const COMMAND_EVE_HERO_FIELD_AMPLITUDE = 9;

// Simple obfuscation for stored credentials (not cryptographically secure, but prevents plain text storage)
const obfuscate = (text: string): string => {
  const encoded = btoa(encodeURIComponent(text));
  return encoded.split('').toReversed().join('');
};

const deobfuscate = (text: string): string => {
  try {
    const reversed = text.split('').toReversed().join('');
    return decodeURIComponent(atob(reversed));
  } catch {
    return '';
  }
};

const CommandEveHeroField: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const orb = { x: 0, y: 0 };
    const mouse = { x: -9999, y: -9999, active: false };

    let width = 0;
    let height = 0;
    let cols = 0;
    let rows = 0;
    let baseX = new Float32Array(0);
    let baseY = new Float32Array(0);
    let pointX = new Float32Array(0);
    let pointY = new Float32Array(0);
    let pointAlpha = new Float32Array(0);
    let pointWarmth = new Float32Array(0);
    let pointCrest = new Float32Array(0);
    let raf = 0;

    const buildField = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      cols = Math.ceil(width / COMMAND_EVE_HERO_FIELD_GAP) + 2;
      rows = Math.ceil(height / COMMAND_EVE_HERO_FIELD_GAP) + 2;
      const count = cols * rows;

      baseX = new Float32Array(count);
      baseY = new Float32Array(count);
      pointX = new Float32Array(count);
      pointY = new Float32Array(count);
      pointAlpha = new Float32Array(count);
      pointWarmth = new Float32Array(count);
      pointCrest = new Float32Array(count);

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const index = row * cols + col;
          baseX[index] = col * COMMAND_EVE_HERO_FIELD_GAP + (row % 2 ? COMMAND_EVE_HERO_FIELD_GAP / 2 : 0);
          baseY[index] = row * COMMAND_EVE_HERO_FIELD_GAP;
        }
      }

      if (orb.x === 0) {
        orb.x = width * 0.5;
        orb.y = height * 0.45;
      }
    };

    const drawCommandEveHeroField = (time: number) => {
      const t = time * 0.001;
      ctx.clearRect(0, 0, width, height);

      const driftX = width * (0.5 + 0.26 * Math.sin(t * 0.18));
      const driftY = height * (0.46 + 0.3 * Math.sin(t * 0.24 + 1.2));
      const inside = mouse.active && mouse.x >= 0 && mouse.x <= width && mouse.y >= 0 && mouse.y <= height;
      const targetX = inside ? mouse.x : driftX;
      const targetY = inside ? mouse.y : driftY;

      orb.x += (targetX - orb.x) * (inside ? 0.08 : 0.035);
      orb.y += (targetY - orb.y) * (inside ? 0.08 : 0.035);

      const glow = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, COMMAND_EVE_HERO_FIELD_RADIUS * 1.15);
      glow.addColorStop(0, 'rgba(249, 115, 22, 0.15)');
      glow.addColorStop(0.5, 'rgba(251, 146, 60, 0.08)');
      glow.addColorStop(1, 'rgba(249, 115, 22, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, COMMAND_EVE_HERO_FIELD_RADIUS * 1.15, 0, Math.PI * 2);
      ctx.fill();

      const count = cols * rows;
      const focusX = inside ? mouse.x : orb.x;
      const focusY = inside ? mouse.y : orb.y;

      for (let index = 0; index < count; index += 1) {
        const x = baseX[index];
        const y = baseY[index];
        const heightWave =
          (Math.sin(x * 0.013 + t * 0.45) * 0.6 +
            Math.sin(y * 0.017 - t * 0.38) * 0.5 +
            Math.sin((x + y) * 0.01 + t * 0.55) * 0.45) /
          1.55;
        const mouseDx = x - focusX;
        const mouseDy = y - focusY;
        const mouseDistance = Math.sqrt(mouseDx * mouseDx + mouseDy * mouseDy);
        const swell = Math.max(0, 1 - mouseDistance / COMMAND_EVE_HERO_FIELD_RADIUS);
        const swell2 = swell * swell;
        const orbDx = x - orb.x;
        const orbDy = y - orb.y;
        const orbSwell = Math.max(
          0,
          1 - Math.sqrt(orbDx * orbDx + orbDy * orbDy) / (COMMAND_EVE_HERO_FIELD_RADIUS * 1.3)
        );
        const crest = (heightWave + 1) / 2;
        const lift = heightWave + swell2 * 1.6 + orbSwell * 0.5;
        const warm = Math.min(1, swell2 * 1.1 + orbSwell * 0.35 + Math.max(0, crest - 0.82) * 1.2);

        pointX[index] = x;
        pointY[index] = y - lift * COMMAND_EVE_HERO_FIELD_AMPLITUDE;
        pointCrest[index] = crest;
        pointWarmth[index] = warm;
        pointAlpha[index] = Math.min(0.92, 0.1 + crest * 0.26 + swell2 * 0.55 + orbSwell * 0.12);
      }

      ctx.lineWidth = 1;
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const index = row * cols + col;
          if (col < cols - 1) {
            const nextIndex = index + 1;
            const alpha =
              (pointCrest[index] + pointCrest[nextIndex]) * 0.0425 +
              (pointWarmth[index] + pointWarmth[nextIndex]) * 0.05;
            if (alpha > 0.02) {
              ctx.strokeStyle = `rgba(${pointWarmth[index] + pointWarmth[nextIndex] > 0.7 ? '249, 115, 22' : '59, 130, 246'}, ${alpha})`;
              ctx.beginPath();
              ctx.moveTo(pointX[index], pointY[index]);
              ctx.lineTo(pointX[nextIndex], pointY[nextIndex]);
              ctx.stroke();
            }
          }
          if (row < rows - 1) {
            const nextIndex = index + cols;
            const alpha =
              (pointCrest[index] + pointCrest[nextIndex]) * 0.0425 +
              (pointWarmth[index] + pointWarmth[nextIndex]) * 0.05;
            if (alpha > 0.02) {
              ctx.strokeStyle = `rgba(${pointWarmth[index] + pointWarmth[nextIndex] > 0.7 ? '249, 115, 22' : '59, 130, 246'}, ${alpha})`;
              ctx.beginPath();
              ctx.moveTo(pointX[index], pointY[index]);
              ctx.lineTo(pointX[nextIndex], pointY[nextIndex]);
              ctx.stroke();
            }
          }
        }
      }

      for (let index = 0; index < count; index += 1) {
        const warm = pointWarmth[index];
        const crest = pointCrest[index];
        const size = 0.85 + crest * 1.7 + warm * 1.7;
        const color =
          warm > 0.7 ? '249, 115, 22' : warm > 0.38 ? '251, 146, 60' : crest > 0.8 ? '96, 165, 250' : '37, 99, 235';

        ctx.fillStyle = `rgba(${color}, ${pointAlpha[index]})`;
        ctx.beginPath();
        ctx.arc(pointX[index], pointY[index], size, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduceMotion) {
        raf = requestAnimationFrame(drawCommandEveHeroField);
      }
    };

    const handleResize = () => {
      buildField();
      if (reduceMotion) {
        drawCommandEveHeroField(0);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
      mouse.active = true;
    };

    buildField();
    window.addEventListener('resize', handleResize);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    if (reduceMotion) {
      drawCommandEveHeroField(0);
    } else {
      raf = requestAnimationFrame(drawCommandEveHeroField);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, []);

  return <canvas ref={canvasRef} className='login-page__hero-field-canvas' aria-hidden='true' />;
};

const LoginPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { status, login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [loading, setLoading] = useState(false);
  const [commandEveVersion, setCommandEveVersion] = useState(COMMAND_EVE_DEFAULT_VERSION);
  const [commandEveVideoPlaying, setCommandEveVideoPlaying] = useState(false);

  const usernameRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const commandEveLoginVideoRef = useRef<HTMLVideoElement | null>(null);
  const messageTimer = useRef<number | undefined>(undefined);

  const startCommandEveLoginVideo = useCallback(() => {
    const video = commandEveLoginVideoRef.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', 'true');

    const playPromise = video.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          setCommandEveVideoPlaying(true);
        })
        .catch(() => {
          setCommandEveVideoPlaying(false);
          window.setTimeout(() => {
            const retryPromise = video.play();
            if (retryPromise && typeof retryPromise.then === 'function') {
              retryPromise
                .then(() => {
                  setCommandEveVideoPlaying(true);
                })
                .catch(() => {
                  setCommandEveVideoPlaying(false);
                });
            }
          }, 250);
        });
    } else {
      window.setTimeout(() => {
        if (!video.paused) {
          setCommandEveVideoPlaying(true);
        }
      }, 0);
    }
  }, []);

  useEffect(() => {
    const retry = window.setTimeout(() => {
      if (!commandEveVideoPlaying) {
        startCommandEveLoginVideo();
      }
    }, 600);
    return () => {
      window.clearTimeout(retry);
    };
  }, [commandEveVideoPlaying, startCommandEveLoginVideo]);

  useEffect(() => {
    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        window.setTimeout(() => {
          startCommandEveLoginVideo();
        }, 250);
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);
    return () => {
      document.removeEventListener('visibilitychange', visibilityHandler);
    };
  }, [startCommandEveLoginVideo]);

  useEffect(() => {
    document.body.classList.add('login-page-active');
    return () => {
      document.body.classList.remove('login-page-active');
      if (messageTimer.current) {
        window.clearTimeout(messageTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    startCommandEveLoginVideo();
  }, [startCommandEveLoginVideo]);

  useEffect(() => {
    const alreadyBootstrapped = localStorage.getItem(COMMAND_EVE_LANGUAGE_BOOTSTRAPPED_KEY) === 'true';
    if (alreadyBootstrapped) return;
    localStorage.setItem(COMMAND_EVE_LANGUAGE_BOOTSTRAPPED_KEY, 'true');
    const storedLanguage = localStorage.getItem('i18nextLng');
    if (!storedLanguage || storedLanguage === 'en-US') {
      changeLanguage(COMMAND_EVE_DEFAULT_LANGUAGE).catch((error: Error) => {
        console.error('Failed to initialize Command EVE language:', error);
      });
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch(COMMAND_EVE_BRAND_CONFIG_URL)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (!active || !data || typeof data !== 'object') return;
        const version = (data as { version?: unknown }).version;
        if (typeof version !== 'string' || !version.trim()) return;
        const normalizedVersion = version.trim().startsWith('v') ? version.trim() : `v${version.trim()}`;
        setCommandEveVersion(normalizedVersion);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.title = t('login.pageTitle');
  }, [t]);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    const isRememberMe = localStorage.getItem(REMEMBER_ME_KEY) === 'true';
    if (isRememberMe) {
      const storedUsername = localStorage.getItem(REMEMBERED_USERNAME_KEY);
      const storedPassword = localStorage.getItem(REMEMBERED_PASSWORD_KEY);
      if (storedUsername) setUsername(deobfuscate(storedUsername));
      if (storedPassword) setPassword(deobfuscate(storedPassword));
      setRememberMe(true);
    }
    window.setTimeout(() => {
      usernameRef.current?.focus();
    }, 0);

    return () => {
      if (messageTimer.current) {
        window.clearTimeout(messageTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      void navigate('/guid', { replace: true });
    }
  }, [navigate, status]);

  const clearMessageLater = useCallback(() => {
    if (messageTimer.current) {
      window.clearTimeout(messageTimer.current);
    }
    messageTimer.current = window.setTimeout(() => {
      setMessage((prev) => (prev?.type === 'success' ? prev : null));
    }, 5000);
  }, []);

  const showMessage = useCallback(
    (next: MessageState) => {
      setMessage(next);
      if (next.type === 'error') {
        clearMessageLater();
      }
    },
    [clearMessageLater]
  );

  const supportedLanguages = useMemo<CommandEveLanguage[]>(
    () => [
      { code: 'de-DE', label: 'Deutsch', short: 'DE', flag: '🇩🇪' },
      { code: 'en-US', label: 'English', short: 'EN', flag: '🇬🇧' },
    ],
    []
  );

  const handleLanguageChange = useCallback((nextLanguage: string) => {
    changeLanguage(nextLanguage).catch((error: Error) => {
      console.error('Failed to change language:', error);
    });
  }, []);

  const handleCardPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const trimmedUsername = username.trim();

      if (!trimmedUsername || !password) {
        showMessage({ type: 'error', text: t('login.errors.empty') });
        return;
      }

      setLoading(true);
      setMessage(null);

      const result = await login({ username: trimmedUsername, password, remember: rememberMe });

      if (result.success) {
        if (rememberMe) {
          localStorage.setItem(REMEMBER_ME_KEY, 'true');
          localStorage.setItem(REMEMBERED_USERNAME_KEY, obfuscate(trimmedUsername));
          localStorage.setItem(REMEMBERED_PASSWORD_KEY, obfuscate(password));
        } else {
          localStorage.removeItem(REMEMBER_ME_KEY);
          localStorage.removeItem(REMEMBERED_USERNAME_KEY);
          localStorage.removeItem(REMEMBERED_PASSWORD_KEY);
        }

        const successText = t('login.success');
        showMessage({ type: 'success', text: successText });

        window.setTimeout(() => {
          void navigate('/guid', { replace: true });
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
            case 'unknown':
            default:
              return result.message ?? t('login.errors.unknown');
          }
        })();

        showMessage({ type: 'error', text: errorText });
      }

      setLoading(false);
    },
    [login, navigate, password, rememberMe, showMessage, t, username]
  );

  if (status === 'checking') {
    return <AppLoader />;
  }

  return (
    <div className='login-page'>
      <CommandEveHeroField />
      <div className='login-page__hero-field-fade' aria-hidden='true' />

      {/* <div className='login-page__background' aria-hidden='true'>
        <div className='login-page__background-circle login-page__background-circle--lg' />
        <div className='login-page__background-circle login-page__background-circle--md' />
        <div className='login-page__background-circle login-page__background-circle--sm' />
      </div> */}

      <div className='login-page__card' onPointerMove={handleCardPointerMove}>
        <div className='login-page__card-glow' aria-hidden='true' />
        <div className='login-page__lang-toggle' role='group' aria-label={t('login.languageToggle')}>
          {supportedLanguages.map((lang) => {
            const active = i18n.language === lang.code || i18n.resolvedLanguage === lang.code;
            return (
              <button
                key={lang.code}
                type='button'
                className={`login-page__lang-option ${active ? 'login-page__lang-option--active' : ''}`}
                onClick={() => handleLanguageChange(lang.code)}
                aria-label={lang.label}
                aria-pressed={active}
              >
                <span className='login-page__lang-flag' aria-hidden='true'>
                  {lang.flag}
                </span>
                <span className='login-page__lang-code'>{lang.short}</span>
              </button>
            );
          })}
        </div>

        <div className='login-page__header'>
          <div className='login-page__logo'>
            <div className='login-page__media-frame' aria-label={t('login.brand')}>
              <img
                src={COMMAND_EVE_LOGIN_ANIMATION}
                className={`login-page__brand-animation ${commandEveVideoPlaying ? 'login-page__brand-animation--hidden' : ''}`}
                alt=''
                aria-hidden='true'
              />
              <video
                ref={commandEveLoginVideoRef}
                src={COMMAND_EVE_LOGIN_VIDEO}
                poster={COMMAND_EVE_LOGIN_POSTER}
                className={`login-page__brand-video ${commandEveVideoPlaying ? 'login-page__brand-video--playing' : ''}`}
                aria-hidden='true'
                autoPlay
                loop
                muted
                playsInline
                preload='auto'
                onCanPlay={startCommandEveLoginVideo}
                onLoadedMetadata={startCommandEveLoginVideo}
                onPlaying={() => setCommandEveVideoPlaying(true)}
                onPause={() => setCommandEveVideoPlaying(false)}
                onError={() => setCommandEveVideoPlaying(false)}
              />
            </div>
          </div>
          <h1 className='login-page__title' aria-label={t('login.brand')}>
            <span className='login-page__title-command' aria-hidden='true'>
              ⌘
            </span>
            <span> EVE</span>
          </h1>
          <p className='login-page__version'>{commandEveVersion}</p>
          <p className='login-page__subtitle'>{t('login.subtitle')}</p>
        </div>

        <form className='login-page__form' onSubmit={handleSubmit}>
          <div className='login-page__form-item'>
            <label className='login-page__label' htmlFor='username'>
              {t('login.username')}
            </label>
            <div className='login-page__input-wrapper'>
              <svg
                className='login-page__input-icon'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                aria-hidden='true'
              >
                <path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' />
                <circle cx='12' cy='7' r='4' />
              </svg>
              <input
                ref={usernameRef}
                id='username'
                name='username'
                className='login-page__input'
                placeholder={t('login.usernamePlaceholder')}
                autoComplete='username'
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                aria-required='true'
              />
            </div>
          </div>

          <div className='login-page__form-item'>
            <label className='login-page__label' htmlFor='password'>
              {t('login.password')}
            </label>
            <div className='login-page__input-wrapper'>
              <svg
                className='login-page__input-icon'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                aria-hidden='true'
              >
                <rect x='3' y='11' width='18' height='11' rx='2' ry='2' />
                <path d='M7 11V7a5 5 0 0 1 10 0v4' />
              </svg>
              <input
                ref={passwordRef}
                id='password'
                name='password'
                type={passwordVisible ? 'text' : 'password'}
                className='login-page__input'
                placeholder={t('login.passwordPlaceholder')}
                autoComplete='current-password'
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-required='true'
              />
              <button
                type='button'
                className='login-page__toggle-password'
                onClick={() => setPasswordVisible((prev) => !prev)}
                aria-label={passwordVisible ? t('login.hidePassword') : t('login.showPassword')}
              >
                <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                  {passwordVisible ? (
                    <>
                      <path d='M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' />
                      <line x1='1' y1='1' x2='23' y2='23' />
                    </>
                  ) : (
                    <>
                      <path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' />
                      <circle cx='12' cy='12' r='3' />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>

          <div className='login-page__checkbox'>
            <input
              type='checkbox'
              id='remember-me'
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            <label htmlFor='remember-me'>{t('login.rememberMe')}</label>
          </div>

          <button type='submit' className='login-page__submit' disabled={loading}>
            {loading && (
              <svg className='login-page__spinner' viewBox='0 0 24 24' width='18' height='18'>
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
            )}
            <span>{loading ? t('login.submitting') : t('login.submit')}</span>
          </button>

          <div
            role='alert'
            aria-live='polite'
            className={`login-page__message ${message ? 'login-page__message--visible' : ''} ${message ? (message.type === 'success' ? 'login-page__message--success' : 'login-page__message--error') : ''}`}
            hidden={!message}
          >
            {message?.text}
          </div>
        </form>

        <div className='login-page__footer'>
          <div className='login-page__footer-content'>
            <span>{t('login.footerPrimary')}</span>
            <span className='login-page__footer-divider'>•</span>
            <span>{t('login.footerSecondary')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
