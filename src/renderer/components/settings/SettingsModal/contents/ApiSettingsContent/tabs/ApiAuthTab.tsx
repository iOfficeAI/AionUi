/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IApiConfig } from '@/common/config/storage';
import { Button, Input, Switch } from '@arco-design/web-react';
import { Copy, Refresh } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import PreferenceRow from '../PreferenceRow';

type ApiAuthTabProps = {
  config: Partial<IApiConfig>;
  docsUrl: string;
  canDirectAccessDocs: boolean;
  toggleLoading: boolean;
  onOpenDocs: () => void;
  onCopyDocs: () => void;
  onEnabledChange: (checked: boolean) => void;
  onTokenChange: (value: string) => void;
  onGenerateToken: () => void;
  onCopyToken: () => void;
};

const ApiAuthTab: React.FC<ApiAuthTabProps> = ({
  config,
  docsUrl,
  canDirectAccessDocs,
  toggleLoading,
  onOpenDocs,
  onCopyDocs,
  onEnabledChange,
  onTokenChange,
  onGenerateToken,
  onCopyToken,
}) => {
  const { t } = useTranslation();

  return (
    <div className='grid gap-16px'>
      <section className='rounded-12px border border-border-secondary bg-bg-secondary p-16px'>
        <div className='mb-12px flex flex-wrap items-center justify-between gap-12px'>
          <div>
            <h4 className='mb-4px text-14px font-600 text-t-primary'>{t('settings.apiPage.docs.title')}</h4>
            <p className='text-12px text-t-tertiary'>{t('settings.apiPage.docs.description')}</p>
          </div>
          <span
            className={`rounded-full px-10px py-4px text-12px font-500 ${
              canDirectAccessDocs
                ? 'bg-[rgba(var(--green-6),0.12)] text-[rgb(var(--green-6))]'
                : 'bg-[rgba(var(--orange-6),0.12)] text-[rgb(var(--orange-6))]'
            }`}
          >
            {canDirectAccessDocs
              ? t('settings.apiPage.docs.statusReady')
              : t('settings.apiPage.docs.statusUnavailable')}
          </span>
        </div>
        <div className='mb-12px'>
          <Input value={docsUrl} readOnly />
        </div>
        <div className='flex flex-wrap gap-8px'>
          <Button icon={<Copy />} onClick={onCopyDocs}>
            {t('common.copy')}
          </Button>
          <Button type='primary' onClick={onOpenDocs} disabled={!canDirectAccessDocs}>
            {t('settings.apiPage.docs.open')}
          </Button>
        </div>
      </section>

      <section className='rounded-12px border border-border-secondary bg-bg-secondary p-16px'>
        <PreferenceRow
          label={t('settings.apiPage.auth.enableLabel')}
          description={t('settings.apiPage.auth.enableDescription')}
        >
          <Switch
            checked={!!config.enabled}
            loading={toggleLoading}
            disabled={toggleLoading}
            onChange={onEnabledChange}
          />
        </PreferenceRow>
      </section>

      <section className='rounded-12px border border-border-secondary bg-bg-secondary p-16px'>
        <div className='mb-12px'>
          <h4 className='mb-4px text-14px font-600 text-t-primary'>{t('settings.apiPage.auth.tokenTitle')}</h4>
          <p className='text-12px text-t-tertiary'>{t('settings.apiPage.auth.tokenDescription')}</p>
        </div>
        <div className='flex flex-wrap gap-8px'>
          <Input
            value={config.authToken || ''}
            onChange={onTokenChange}
            className='min-w-0 flex-1'
            placeholder={t('settings.apiPage.auth.tokenPlaceholder')}
          />
          <Button icon={<Refresh />} onClick={onGenerateToken}>
            {t('settings.apiPage.auth.generateToken')}
          </Button>
          <Button icon={<Copy />} onClick={onCopyToken} disabled={!config.authToken}>
            {t('common.copy')}
          </Button>
        </div>
        <p className='mt-8px text-12px text-t-tertiary'>{t('settings.apiPage.auth.tokenHint')}</p>
      </section>
    </div>
  );
};

export default ApiAuthTab;
