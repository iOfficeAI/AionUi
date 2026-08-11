/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_CALLBACK_BODY, DEFAULT_JS_FILTER_SCRIPT } from '@/common/apiCallback';
import type { IApiConfig } from '@/common/config/storage';
import { Button, Input, Select, Switch } from '@arco-design/web-react';
import { Delete, Plus } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import PreferenceRow from '../PreferenceRow';
import type { HeaderItem } from '../types';

const TEMPLATE_VARIABLES = [
  '{{sessionId}}',
  '{{workspace}}',
  '{{model}}',
  '{{conversationHistory}}',
  '{{lastMessage}}',
  '{{status}}',
  '{{state}}',
  '{{detail}}',
  '{{canSendMessage}}',
  '{{runtime}}',
  '{{jsFitterStr}}',
] as const;

type CallbackTabProps = {
  config: Partial<IApiConfig>;
  headers: HeaderItem[];
  callbackEnabled: boolean;
  jsFilterEnabled: boolean;
  onCallbackEnabledChange: (checked: boolean) => void;
  onCallbackUrlChange: (value: string) => void;
  onCallbackMethodChange: (value: IApiConfig['callbackMethod']) => void;
  onAddHeader: () => void;
  onDeleteHeader: (index: number) => void;
  onUpdateHeader: (index: number, field: keyof HeaderItem, value: string) => void;
  onCallbackBodyChange: (value: string) => void;
  onJsFilterEnabledChange: (checked: boolean) => void;
  onRestoreJsFilterScript: () => void;
  onJsFilterScriptChange: (value: string) => void;
};

const CallbackTab: React.FC<CallbackTabProps> = ({
  config,
  headers,
  callbackEnabled,
  jsFilterEnabled,
  onCallbackEnabledChange,
  onCallbackUrlChange,
  onCallbackMethodChange,
  onAddHeader,
  onDeleteHeader,
  onUpdateHeader,
  onCallbackBodyChange,
  onJsFilterEnabledChange,
  onRestoreJsFilterScript,
  onJsFilterScriptChange,
}) => {
  const { t } = useTranslation();

  return (
    <div className='grid gap-16px'>
      <section className='rounded-12px border border-border-secondary bg-bg-secondary p-16px'>
        <div className='mb-12px'>
          <h4 className='mb-4px text-14px font-600 text-t-primary'>{t('settings.apiPage.callback.title')}</h4>
          <p className='text-12px text-t-tertiary'>{t('settings.apiPage.callback.description')}</p>
        </div>
        <PreferenceRow
          label={t('settings.apiPage.callback.enableLabel')}
          description={t('settings.apiPage.callback.enableDescription')}
        >
          <Switch checked={callbackEnabled} onChange={onCallbackEnabledChange} />
        </PreferenceRow>
      </section>

      {callbackEnabled ? (
        <>
          <section className='rounded-12px border border-border-secondary bg-bg-secondary p-16px'>
            <div className='grid gap-16px md:grid-cols-2'>
              <div className='md:col-span-2'>
                <label className='mb-6px block text-13px text-t-primary'>
                  {t('settings.apiPage.callback.urlLabel')}
                </label>
                <Input
                  value={config.callbackUrl || ''}
                  onChange={onCallbackUrlChange}
                  placeholder='https://your-server.com/webhook'
                />
              </div>
              <div className='w-160px'>
                <label className='mb-6px block text-13px text-t-primary'>
                  {t('settings.apiPage.callback.methodLabel')}
                </label>
                <Select
                  value={config.callbackMethod || 'POST'}
                  onChange={(value) => onCallbackMethodChange(value as IApiConfig['callbackMethod'])}
                  options={[
                    { label: 'POST', value: 'POST' },
                    { label: 'GET', value: 'GET' },
                    { label: 'PUT', value: 'PUT' },
                  ]}
                />
              </div>
            </div>
          </section>

          <section className='rounded-12px border border-border-secondary bg-bg-secondary p-16px'>
            <div className='mb-12px flex items-center justify-between gap-12px'>
              <div>
                <h4 className='mb-4px text-14px font-600 text-t-primary'>
                  {t('settings.apiPage.callback.headersTitle')}
                </h4>
                <p className='text-12px text-t-tertiary'>{t('settings.apiPage.callback.headersDescription')}</p>
              </div>
              <Button size='mini' icon={<Plus />} onClick={onAddHeader}>
                {t('common.add')}
              </Button>
            </div>

            {headers.length === 0 ? (
              <div className='rounded-8px bg-fill-1 px-12px py-14px text-center text-12px text-t-tertiary'>
                {t('settings.apiPage.callback.emptyHeaders')}
              </div>
            ) : null}

            {headers.map((item, index) => (
              <div key={`${item.key}-${index}`} className='mb-8px flex gap-8px last:mb-0'>
                <Input
                  value={item.key}
                  onChange={(value) => onUpdateHeader(index, 'key', value)}
                  placeholder={t('settings.apiPage.callback.headerKeyPlaceholder')}
                  className='flex-1'
                />
                <Input
                  value={item.value}
                  onChange={(value) => onUpdateHeader(index, 'value', value)}
                  placeholder={t('settings.apiPage.callback.headerValuePlaceholder')}
                  className='flex-1'
                />
                <Button size='small' status='danger' icon={<Delete />} onClick={() => onDeleteHeader(index)} />
              </div>
            ))}
          </section>

          <section className='rounded-12px border border-border-secondary bg-bg-secondary p-16px'>
            <label className='mb-6px block text-13px text-t-primary'>{t('settings.apiPage.callback.bodyLabel')}</label>
            <Input.TextArea
              value={config.callbackBody || DEFAULT_CALLBACK_BODY}
              onChange={onCallbackBodyChange}
              className='font-mono'
              autoSize={{ minRows: 8, maxRows: 16 }}
            />
            <p className='mt-8px text-12px text-t-tertiary'>
              {t('settings.apiPage.callback.bodyVariables')}
              {': '}
              {TEMPLATE_VARIABLES.join(', ')}
            </p>
          </section>

          <section className='rounded-12px border border-border-secondary bg-bg-secondary p-16px'>
            <PreferenceRow
              label={t('settings.apiPage.callback.jsFilterLabel')}
              description={t('settings.apiPage.callback.jsFilterDescription')}
            >
              <Switch checked={jsFilterEnabled} onChange={onJsFilterEnabledChange} />
            </PreferenceRow>

            <div className='mt-12px'>
              <div className='mb-6px flex items-center justify-between gap-12px'>
                <label className='text-13px text-t-primary'>{t('settings.apiPage.callback.jsFilterScriptLabel')}</label>
                <Button size='mini' onClick={onRestoreJsFilterScript}>
                  {t('settings.apiPage.callback.restoreExample')}
                </Button>
              </div>
              <Input.TextArea
                value={config.jsFilterScript || DEFAULT_JS_FILTER_SCRIPT}
                onChange={onJsFilterScriptChange}
                className='font-mono'
                autoSize={{ minRows: 10, maxRows: 20 }}
              />
              <p className='mt-8px text-12px text-t-tertiary'>{t('settings.apiPage.callback.jsFilterHint')}</p>
            </div>
          </section>
        </>
      ) : (
        <section className='rounded-12px border border-dashed border-border-secondary bg-bg-secondary p-16px text-12px text-t-tertiary'>
          {t('settings.apiPage.callback.disabledState')}
        </section>
      )}
    </div>
  );
};

export default CallbackTab;
