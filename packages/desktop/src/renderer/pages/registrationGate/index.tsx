/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command EVE registration + license gate (renderer half, W12).
 *
 * Founder-facing first-run gate that BLOCKS all main surfaces until the user
 * has (1) registered locally (S2 PII, stored only on this machine) and
 * (2) entered a valid CEVE.v1 license code. The block is structural: the gate
 * is rendered in place of the protected layout by the route guard in
 * `components/layout/Router.tsx`, so no route/deep-link/window-reopen can reach
 * a main surface while the gate is required and not entitled.
 *
 * The backend (W11) lives in the main process (`commandEve.entitlement*`
 * bridges). This component only drives the UI flow and reflects the
 * main-process truth — it never decides entitlement on its own.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Input } from '@arco-design/web-react';
import { changeLanguage } from '@renderer/services/i18n';
import { openExternalUrl } from '@renderer/utils/platform';
import {
  commandEve,
  type ICommandEveEntitlementStatusResult,
  type ICommandEveRegistrationRecord,
} from '@/common/adapter/ipcBridge';
import './RegistrationGatePage.css';
// Bundled (Vite-hashed) cinematic background. A STATIC image = one GPU texture,
// zero animation → zero repaint cost (the prior drifting aurora was the source of
// the jank); the glass panel's backdrop-blur is computed once over a still frame
// and cached. Swap to './assets/gate-bg-alt.jpg' for the liquid-ribbon variant.
import gateBackground from './assets/gate-bg.jpg';

// 'auth' is the PRIMARY first-run path (web login/register). 'registration' +
// 'license' remain as the SECONDARY manual code-paste fallback flow, reached via
// the "Ich habe einen Code" link or when the web login is not yet available.
type GateStep = 'auth' | 'registration' | 'license';

/**
 * The day-14 trial-conversion curtain destination. This routes the user OUT to
 * the web `/account` surface where the existing 250€/mo checkout lives — the
 * desktop never holds a card or a checkout form. Founder may refine the exact
 * destination (e.g. a deep-link that pre-fills the tenant) — see needs_founder.
 */
const CURTAIN_CHECKOUT_URL = 'https://command-eve.com/account';

/**
 * True only for the day-14 TRIAL-EXPIRED state: the gate reports `expired` AND
 * the (now-mirrored) CEVE.v2 `trial_ends_at` field is a non-null string, which
 * the main-process core sets ONLY for a trial entitlement. A paid-license expiry
 * (or any v1 code) leaves `trial_ends_at` null/absent and stays on the normal
 * license path — the curtain is a warm "continue", NOT the generic-expired error.
 *
 * This is a pure read of the main-process status; the renderer makes no
 * entitlement decision and cannot unlock anything (the structural route guard in
 * Router.tsx keeps every main surface blocked while `state !== 'entitled'`).
 */
function isTrialExpired(status: ICommandEveEntitlementStatusResult | null): boolean {
  return (
    status?.state === 'expired' &&
    typeof status.trial_ends_at === 'string' &&
    status.trial_ends_at.length > 0
  );
}

const SUPPORTED_LANGUAGES: Array<{ code: string; short: string; flag: string; label: string }> = [
  { code: 'de-DE', short: 'DE', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'en-US', short: 'EN', flag: '🇬🇧', label: 'English' },
];

// License-verify reason codes that map to a specific, distinct error string.
const KNOWN_LICENSE_REASON_CODES = new Set([
  'LICENSE_MALFORMED',
  'LICENSE_VERSION_UNSUPPORTED',
  'LICENSE_SIGNATURE_INVALID',
  'LICENSE_EXPIRED',
  'LICENSE_NOT_YET_VALID',
  'LICENSE_KEY_UNCONFIGURED',
  'REGISTRATION_REQUIRED',
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RegistrationGatePageProps {
  /** Latest entitlement status from the main process (drives initial step). */
  status: ICommandEveEntitlementStatusResult | null;
  /** Re-read the main-process status (caller flips the gate off when entitled). */
  onEntitled: () => void | Promise<void>;
}

const RegistrationGatePage: React.FC<RegistrationGatePageProps> = ({ status, onEntitled }) => {
  const { t, i18n } = useTranslation();

  // The day-14 trial curtain takes over the whole gate: it is NOT a step in the
  // registration→license flow but a distinct conversion screen (warm "continue",
  // not the generic-expired error). It only shows when the main process reports a
  // TRIAL that has expired (see `isTrialExpired`).
  const trialExpired = isTrialExpired(status);

  // When the user is already registered (e.g. relaunch with registration but no
  // license, or a now-expired PAID license) jump straight to the license step.
  // Otherwise the PRIMARY first-run path is the web-login 'auth' step. A trial
  // expiry is handled by the curtain above, not this step.
  const initialStep: GateStep =
    !trialExpired && (status?.state === 'registered_unlicensed' || status?.state === 'expired') ? 'license' : 'auth';
  const [step, setStep] = useState<GateStep>(initialStep);

  // Web-login (browser-loopback) flow state.
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const handleWebLogin = useCallback(
    async (intent: 'login' | 'register') => {
      setAuthError(null);
      setAuthBusy(true);
      try {
        const response = await commandEve.authWebLogin.invoke({ intent });
        const data = response.data;
        if (data?.ok && data.entitled) {
          // Gate host re-reads the main-process status and unmounts the gate.
          await onEntitled();
          return;
        }
        // Login completed but no license yet (PENDING) OR the web page / broker
        // is not live yet ⇒ fall back to the manual code-paste flow. If we have a
        // local registration already, jump straight to the license step.
        if (data?.needs_paste) {
          const knownKey = `registrationGate.auth.errors.${data.reason_code}`;
          const translated = data.reason_code ? t(knownKey) : '';
          setAuthError(translated && translated !== knownKey ? translated : t('registrationGate.auth.errors.unknown'));
          setStep('registration');
          return;
        }
        setAuthError(t('registrationGate.auth.errors.unknown'));
      } catch (error) {
        console.error('Web login bridge call failed:', error);
        setAuthError(t('registrationGate.auth.errors.unknown'));
        setStep('registration');
      } finally {
        setAuthBusy(false);
      }
    },
    [onEntitled, t]
  );

  // Opening the web checkout is a deliberate, low-risk action — it never touches
  // local data. Setup (memory, connections, SOPs) is preserved by definition:
  // the curtain does no reset/wipe, and the structural gate keeps the existing
  // local entitlement/registration records untouched on disk.
  const [curtainOpening, setCurtainOpening] = useState(false);
  const handleContinueToCheckout = useCallback(async () => {
    setCurtainOpening(true);
    try {
      await openExternalUrl(CURTAIN_CHECKOUT_URL);
    } catch (error) {
      console.error('Failed to open conversion checkout:', error);
    } finally {
      setCurtainOpening(false);
    }
  }, []);

  // Registration form state.
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [registrationSubmitting, setRegistrationSubmitting] = useState(false);
  const [registrationRecord, setRegistrationRecord] = useState<ICommandEveRegistrationRecord | null>(null);

  // License form state.
  const [code, setCode] = useState('');
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [licenseSubmitting, setLicenseSubmitting] = useState(false);
  const [licenseSuccess, setLicenseSuccess] = useState(false);

  const isUnconfigured = status?.state === 'unconfigured';

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  const handleLanguageChange = useCallback((next: string) => {
    changeLanguage(next).catch((error: Error) => {
      console.error('Failed to change language:', error);
    });
  }, []);

  const resolveLicenseError = useCallback(
    (reasonCode?: string): string => {
      if (reasonCode && KNOWN_LICENSE_REASON_CODES.has(reasonCode)) {
        return t(`registrationGate.license.errors.${reasonCode}`);
      }
      return t('registrationGate.license.errors.unknown');
    },
    [t]
  );

  const handleRegister = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setRegistrationError(null);

      const trimmedName = name.trim();
      const trimmedCompany = company.trim();
      const trimmedEmail = email.trim();

      // Client-side validation mirrors the main-process reason codes so the user
      // gets an immediate, specific message; the main process re-validates.
      if (!consent) {
        setRegistrationError(t('registrationGate.registration.errors.consentRequired'));
        return;
      }
      if (!trimmedName || !trimmedCompany || !trimmedEmail) {
        setRegistrationError(t('registrationGate.registration.errors.fieldsRequired'));
        return;
      }
      if (!EMAIL_PATTERN.test(trimmedEmail)) {
        setRegistrationError(t('registrationGate.registration.errors.emailInvalid'));
        return;
      }

      setRegistrationSubmitting(true);
      try {
        const response = await commandEve.entitlementRegister.invoke({
          name: trimmedName,
          company: trimmedCompany,
          email: trimmedEmail,
          consent,
        });
        const data = response.data;
        if (data?.ok && data.record) {
          setRegistrationRecord(data.record);
          setStep('license');
          return;
        }
        switch (data?.reason_code) {
          case 'CONSENT_REQUIRED':
            setRegistrationError(t('registrationGate.registration.errors.consentRequired'));
            break;
          case 'REGISTRATION_EMAIL_INVALID':
            setRegistrationError(t('registrationGate.registration.errors.emailInvalid'));
            break;
          case 'REGISTRATION_FIELDS_REQUIRED':
            setRegistrationError(t('registrationGate.registration.errors.fieldsRequired'));
            break;
          default:
            setRegistrationError(t('registrationGate.registration.errors.unknown'));
        }
      } catch (error) {
        console.error('Registration bridge call failed:', error);
        setRegistrationError(t('registrationGate.registration.errors.unknown'));
      } finally {
        setRegistrationSubmitting(false);
      }
    },
    [company, consent, email, name, t]
  );

  const handleActivate = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setLicenseError(null);

      const trimmedCode = code.trim();
      if (!trimmedCode) {
        setLicenseError(t('registrationGate.license.errors.empty'));
        return;
      }

      setLicenseSubmitting(true);
      try {
        const response = await commandEve.entitlementActivate.invoke({ code: trimmedCode });
        const data = response.data;
        if (data?.ok) {
          setLicenseSuccess(true);
          // Hand control back to the gate host, which re-reads the main-process
          // status and unmounts the gate once it reports 'entitled'.
          await onEntitled();
          return;
        }
        setLicenseError(resolveLicenseError(data?.reason_code));
      } catch (error) {
        console.error('Activation bridge call failed:', error);
        setLicenseError(t('registrationGate.license.errors.unknown'));
      } finally {
        setLicenseSubmitting(false);
      }
    },
    [code, onEntitled, resolveLicenseError, t]
  );

  const registeredAsLabel = useMemo(() => {
    const displayName = registrationRecord?.name || name.trim();
    const displayCompany = registrationRecord?.company || company.trim();
    if (!displayName && !displayCompany) return null;
    return t('registrationGate.license.registeredAs', { name: displayName, company: displayCompany });
  }, [company, name, registrationRecord, t]);

  // Static cinematic backdrop behind the frosted-glass card (set via a bundled,
  // hashed asset URL so it resolves under file:// in the packaged build). Rendered
  // in BOTH gate branches (normal + day-14 curtain) so the look never drops out.
  const backgroundLayer = (
    <div
      className='registration-gate__bg'
      style={{ backgroundImage: `url(${gateBackground})` }}
      aria-hidden='true'
    />
  );

  const languageToggle = (
    <div className='registration-gate__lang-toggle' role='group' aria-label={t('registrationGate.languageToggle')}>
      {SUPPORTED_LANGUAGES.map((lang) => {
        const active = i18n.language === lang.code || i18n.resolvedLanguage === lang.code;
        return (
          <button
            key={lang.code}
            type='button'
            className={`registration-gate__lang-option ${active ? 'registration-gate__lang-option--active' : ''}`}
            onClick={() => handleLanguageChange(lang.code)}
            aria-pressed={active}
            aria-label={lang.label}
            data-testid={`registration-gate-lang-${lang.short.toLowerCase()}`}
          >
            <span aria-hidden='true'>{lang.flag}</span>
            <span>{lang.short}</span>
          </button>
        );
      })}
    </div>
  );

  // ---- Day-14 trial-conversion CURTAIN -----------------------------------
  // A warm "welcome back, continue" conversion screen that REPLACES the gate
  // flow when a trial has expired. It is intentionally distinct from the hard
  // license-error states: it leads with the value the user already built (their
  // Company OS, memory, connections, SOPs are PRESERVED and waiting) and offers a
  // single primary CTA out to the web 250€/mo checkout. It wipes nothing and
  // cannot itself unlock the app — the structural route guard keeps every main
  // surface blocked until the entitlement flips to `entitled` (after the user
  // converts on the web and re-activates / the gate re-reads).
  if (trialExpired) {
    return (
      <div className='registration-gate' data-testid='registration-gate'>
        {backgroundLayer}
        <div className='registration-gate__card registration-gate__card--curtain' data-testid='registration-gate-curtain'>
          {languageToggle}

          <div className='registration-gate__header'>
            <h1 className='registration-gate__title'>
              <span className='registration-gate__title-command' aria-hidden='true'>
                ⌘
              </span>
              <span>{t('registrationGate.brand')}</span>
            </h1>
            <p className='registration-gate__subtitle'>{t('registrationGate.curtain.title')}</p>
          </div>

          <div className='registration-gate__form'>
            <p className='registration-gate__curtain-lede'>{t('registrationGate.curtain.lede')}</p>

            <div className='registration-gate__curtain-preserved' data-testid='registration-gate-curtain-preserved'>
              <p className='registration-gate__curtain-preserved-title'>
                {t('registrationGate.curtain.preservedTitle')}
              </p>
              <p className='registration-gate__curtain-preserved-body'>
                {t('registrationGate.curtain.preservedBody')}
              </p>
            </div>

            <p className='registration-gate__curtain-price'>{t('registrationGate.curtain.price')}</p>

            <Button
              type='primary'
              long
              shape='round'
              loading={curtainOpening}
              onClick={handleContinueToCheckout}
              data-testid='registration-gate-curtain-continue'
            >
              {t('registrationGate.curtain.continue')}
            </Button>

            <span className='registration-gate__hint'>{t('registrationGate.curtain.hint')}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='registration-gate' data-testid='registration-gate'>
      {backgroundLayer}
      <div className='registration-gate__card'>
        {languageToggle}

        <div className='registration-gate__header'>
          <h1 className='registration-gate__title'>
            <span className='registration-gate__title-command' aria-hidden='true'>
              ⌘
            </span>
            <span>{t('registrationGate.brand')}</span>
          </h1>
          <p className='registration-gate__subtitle'>
            {isUnconfigured
              ? t('registrationGate.unconfigured.title')
              : step === 'auth'
                ? t('registrationGate.auth.title')
                : step === 'registration'
                  ? t('registrationGate.registration.title')
                  : t('registrationGate.license.title')}
          </p>
        </div>

        {!isUnconfigured && step !== 'auth' ? (
          <div className='registration-gate__steps' aria-hidden='true'>
            <span
              className={`registration-gate__step ${step === 'registration' ? 'registration-gate__step--active' : ''}`}
            >
              <span className='registration-gate__step-dot'>1</span>
              {t('registrationGate.steps.registration')}
            </span>
            <span className='registration-gate__step-sep' />
            <span className={`registration-gate__step ${step === 'license' ? 'registration-gate__step--active' : ''}`}>
              <span className='registration-gate__step-dot'>2</span>
              {t('registrationGate.steps.license')}
            </span>
          </div>
        ) : null}

        {isUnconfigured ? (
          <div className='registration-gate__form' data-testid='registration-gate-unconfigured'>
            <p className='registration-gate__subtitle'>{t('registrationGate.unconfigured.description')}</p>
            <p className='registration-gate__hint'>{t('registrationGate.unconfigured.fallbackHint')}</p>
          </div>
        ) : step === 'auth' ? (
          <div className='registration-gate__form' data-testid='registration-gate-auth'>
            <p className='registration-gate__subtitle'>{t('registrationGate.auth.subtitle')}</p>

            {authError ? (
              <span className='registration-gate__error' role='alert' data-testid='registration-gate-auth-error'>
                {authError}
              </span>
            ) : null}

            <Button
              type='primary'
              long
              shape='round'
              loading={authBusy}
              onClick={() => void handleWebLogin('login')}
              data-testid='registration-gate-login'
            >
              {authBusy ? t('registrationGate.auth.loggingIn') : t('registrationGate.auth.login')}
            </Button>

            <Button
              long
              shape='round'
              disabled={authBusy}
              onClick={() => void handleWebLogin('register')}
              data-testid='registration-gate-register'
            >
              {t('registrationGate.auth.register')}
            </Button>

            <button
              type='button'
              className='registration-gate__back'
              onClick={() => {
                setAuthError(null);
                setStep('registration');
              }}
              disabled={authBusy}
              data-testid='registration-gate-have-code'
            >
              {t('registrationGate.auth.haveCode')}
            </button>
          </div>
        ) : step === 'registration' ? (
          <form className='registration-gate__form' onSubmit={handleRegister} data-testid='registration-gate-form'>
            <p className='registration-gate__subtitle'>{t('registrationGate.registration.subtitle')}</p>

            <div className='registration-gate__field'>
              <label className='registration-gate__label' htmlFor='registration-gate-name'>
                {t('registrationGate.registration.nameLabel')}
              </label>
              <Input
                id='registration-gate-name'
                value={name}
                onChange={(value) => setName(value)}
                placeholder={t('registrationGate.registration.namePlaceholder')}
                data-testid='registration-gate-name'
                disabled={registrationSubmitting}
              />
            </div>

            <div className='registration-gate__field'>
              <label className='registration-gate__label' htmlFor='registration-gate-company'>
                {t('registrationGate.registration.companyLabel')}
              </label>
              <Input
                id='registration-gate-company'
                value={company}
                onChange={(value) => setCompany(value)}
                placeholder={t('registrationGate.registration.companyPlaceholder')}
                data-testid='registration-gate-company'
                disabled={registrationSubmitting}
              />
            </div>

            <div className='registration-gate__field'>
              <label className='registration-gate__label' htmlFor='registration-gate-email'>
                {t('registrationGate.registration.emailLabel')}
              </label>
              <Input
                id='registration-gate-email'
                value={email}
                onChange={(value) => setEmail(value)}
                placeholder={t('registrationGate.registration.emailPlaceholder')}
                data-testid='registration-gate-email'
                disabled={registrationSubmitting}
              />
            </div>

            <label className='registration-gate__consent'>
              <Checkbox
                checked={consent}
                onChange={(checked) => setConsent(checked)}
                data-testid='registration-gate-consent'
                disabled={registrationSubmitting}
              />
              <span className='registration-gate__consent-text'>
                {t('registrationGate.registration.consentLabel')}
              </span>
            </label>
            <span className='registration-gate__hint'>{t('registrationGate.registration.consentHint')}</span>

            {registrationError ? (
              <span className='registration-gate__error' role='alert' data-testid='registration-gate-error'>
                {registrationError}
              </span>
            ) : null}

            <Button
              type='primary'
              htmlType='submit'
              long
              shape='round'
              loading={registrationSubmitting}
              data-testid='registration-gate-submit'
            >
              {registrationSubmitting
                ? t('registrationGate.registration.submitting')
                : t('registrationGate.registration.submit')}
            </Button>
          </form>
        ) : (
          <form className='registration-gate__form' onSubmit={handleActivate} data-testid='registration-gate-license-form'>
            <p className='registration-gate__subtitle'>{t('registrationGate.license.subtitle')}</p>
            {registeredAsLabel ? (
              <p className='registration-gate__registered-as'>{registeredAsLabel}</p>
            ) : null}

            <div className='registration-gate__field'>
              <label className='registration-gate__label' htmlFor='registration-gate-code'>
                {t('registrationGate.license.codeLabel')}
              </label>
              <Input.TextArea
                id='registration-gate-code'
                value={code}
                onChange={(value) => setCode(value)}
                placeholder={t('registrationGate.license.codePlaceholder')}
                autoSize={{ minRows: 3, maxRows: 5 }}
                data-testid='registration-gate-code'
                disabled={licenseSubmitting || licenseSuccess}
              />
            </div>

            {licenseError ? (
              <span className='registration-gate__error' role='alert' data-testid='registration-gate-license-error'>
                {licenseError}
              </span>
            ) : null}
            {licenseSuccess ? (
              <span className='registration-gate__hint' data-testid='registration-gate-license-success'>
                {t('registrationGate.license.success')}
              </span>
            ) : null}

            <Button
              type='primary'
              htmlType='submit'
              long
              shape='round'
              loading={licenseSubmitting}
              disabled={licenseSuccess}
              data-testid='registration-gate-license-submit'
            >
              {licenseSubmitting ? t('registrationGate.license.submitting') : t('registrationGate.license.submit')}
            </Button>

            <button
              type='button'
              className='registration-gate__back'
              onClick={() => {
                setLicenseError(null);
                setStep('registration');
              }}
              disabled={licenseSubmitting || licenseSuccess}
              data-testid='registration-gate-back'
            >
              {t('registrationGate.license.back')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default RegistrationGatePage;
