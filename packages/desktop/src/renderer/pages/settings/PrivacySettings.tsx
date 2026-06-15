/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Privacy settings — telemetry opt-in toggle.
 *
 * Telemetry (crash reporting + capped log upload via Sentry) is OFF by default.
 * This page is the only place a user can turn it on, and it reads/writes the
 * main-process consent store through the bridge channels defined alongside the
 * consent core. Sentry stays gated on the persisted value, so flipping this
 * switch is what actually enables or disables all telemetry.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Switch } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { bridge } from '@office-ai/platform';
import { isElectronDesktop } from '@/renderer/utils/platform';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import PreferenceRow from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent/PreferenceRow';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { useSettingsViewMode } from '@/renderer/components/settings/SettingsModal/settingsViewContext';

// Channel keys + disclosure are intentionally inlined here (not imported from
// `@/process/commandEve/telemetryConsentCore`) because that core imports
// `electron`/`node:fs` at the top level for the synchronous startup gate and
// must never be pulled into the renderer bundle. The core is the canonical
// source of truth; these literals must stay in sync with it (covered by the
// telemetryConsentCore unit test for the disclosure content).
const TELEMETRY_CONSENT_GET_CHANNEL = 'command-eve.telemetry-consent-get';
const TELEMETRY_CONSENT_SET_CHANNEL = 'command-eve.telemetry-consent-set';

type TelemetryConsentBridgeResult = { consent: boolean; updatedAt?: string };

const TELEMETRY_DISCLOSURE = [
  'Telemetry is OFF by default. Nothing is sent unless you turn it on here.',
  'When enabled, Command EVE sends anonymous crash reports and a capped, gzipped slice of recent app logs to our error-tracking service (Sentry) to help diagnose failures, tagged with an anonymous random installation id, app version, OS and CPU architecture. No account details, file contents, prompts, API keys or personal data are collected.',
  'You can turn this off again at any time; turning it off stops all crash reporting and log uploads immediately.',
].join('\n\n');

const getConsent = bridge.buildProvider<TelemetryConsentBridgeResult, void>(TELEMETRY_CONSENT_GET_CHANNEL).invoke;
const setConsentRemote = bridge.buildProvider<TelemetryConsentBridgeResult, { consent: boolean }>(
  TELEMETRY_CONSENT_SET_CHANNEL
).invoke;

const PrivacySettings: React.FC = () => {
  // Default OFF in the UI as well, so the toggle is never optimistically "on"
  // before we confirm the persisted state.
  const [consent, setConsentState] = useState(false);
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const isDesktop = isElectronDesktop();

  useEffect(() => {
    if (!isDesktop) return;
    let cancelled = false;
    getConsent()
      .then((result) => {
        if (!cancelled) setConsentState(result?.consent === true);
      })
      .catch(() => {
        // Fail closed: if we can't read consent, show it as off.
        if (!cancelled) setConsentState(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isDesktop]);

  const handleConsentChange = useCallback(
    (checked: boolean) => {
      const previous = consent;
      setConsentState(checked);
      setSaving(true);
      setConsentRemote({ consent: checked })
        .then((result) => {
          setConsentState(result?.consent === true);
        })
        .catch(() => {
          // Revert on failure so the toggle reflects the true persisted state.
          setConsentState(previous);
        })
        .finally(() => {
          setSaving(false);
        });
    },
    [consent]
  );

  const disclosure = t('settings.privacy.disclosure', { defaultValue: TELEMETRY_DISCLOSURE });

  if (!isDesktop) {
    return (
      <SettingsPageWrapper>
        <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
          <div className='space-y-16px'>
            <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px'>
              <p className='m-0 text-13px text-t-secondary'>
                {t('settings.privacy.desktopOnly', { defaultValue: 'Telemetry is only collected by the desktop app.' })}
              </p>
            </div>
          </div>
        </AionScrollArea>
      </SettingsPageWrapper>
    );
  }

  return (
    <SettingsPageWrapper>
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          <div className='px-[12px] md:px-[32px] py-16px bg-2 rd-16px space-y-12px'>
            <div className='w-full flex flex-col divide-y divide-border-2'>
              <PreferenceRow
                label={t('settings.privacy.telemetryLabel', { defaultValue: 'Send anonymous crash reports' })}
                description={t('settings.privacy.telemetryDescription', {
                  defaultValue:
                    'Off by default. Help diagnose failures by sending anonymous crash reports and recent logs.',
                })}
              >
                <Switch checked={consent} disabled={saving} onChange={handleConsentChange} />
              </PreferenceRow>
            </div>
            <p className='m-0 text-12px text-t-secondary whitespace-pre-line leading-relaxed'>{disclosure}</p>
          </div>
        </div>
      </AionScrollArea>
    </SettingsPageWrapper>
  );
};

export default PrivacySettings;
