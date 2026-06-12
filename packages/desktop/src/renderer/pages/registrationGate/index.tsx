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
import {
  commandEve,
  type ICommandEveEntitlementStatusResult,
  type ICommandEveRegistrationRecord,
} from '@/common/adapter/ipcBridge';
import './RegistrationGatePage.css';

type GateStep = 'registration' | 'license';

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

  // When the user is already registered (e.g. relaunch with registration but no
  // license, or a now-expired license) jump straight to the license step.
  const initialStep: GateStep =
    status?.state === 'registered_unlicensed' || status?.state === 'expired' ? 'license' : 'registration';
  const [step, setStep] = useState<GateStep>(initialStep);

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

  return (
    <div className='registration-gate' data-testid='registration-gate'>
      <div className='registration-gate__card'>
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
              : step === 'registration'
                ? t('registrationGate.registration.title')
                : t('registrationGate.license.title')}
          </p>
        </div>

        {!isUnconfigured ? (
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
