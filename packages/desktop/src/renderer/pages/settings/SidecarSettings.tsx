/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SidecarSettings — Phase 3 WS3.
 *
 * Lets the user register, list, and open reverse-proxied localhost services
 * (OpenVSCode Server, ttyd, etc.) as embedded tabs.
 *
 * Embedding: the "Open" action opens a full-height Arco Modal hosting
 * `WebviewHost` directly from this page. The settings page lives outside
 * the conversation route, so the existing `usePreviewLauncher` /
 * `PreviewContext` URL viewer is not available without a cross-page
 * navigation; hosting the WebviewHost here keeps the open flow
 * self-contained. The conversation-level preview tab system remains the
 * canonical path for embedding a sidecar mid-conversation (a future hook
 * can wire that in by registering the embed URL via `openPreview(url,
 * 'url', { title: name })` from inside the conversation).
 */

import { ipcBridge } from '@/common';
import type { SidecarConfig, SidecarRegistration } from '@/common/types/sidecarTypes';
import WebviewHost from '@/renderer/components/media/WebviewHost';
import { buildEmbedUrl, useSidecars } from '@/renderer/hooks/useSidecars';
import { LinkOut, Plus, Server } from '@icon-park/react';
import { Button, Form, Input, InputNumber, Message, Modal, Popconfirm, Tag } from '@arco-design/web-react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const MIN_PORT = 1024;
const MAX_PORT = 65535;

const SidecarSettings: React.FC = () => {
  const { t } = useTranslation();
  const { items, add, remove } = useSidecars();
  const [form] = Form.useForm<{ name: string; port: number }>();
  const [adding, setAdding] = useState(false);
  // The currently-open sidecar, if any. When set, a Modal hosts
  // `WebviewHost` loaded against the resolved embed URL.
  const [openRegistration, setOpenRegistration] = useState<{
    config: SidecarConfig;
    registration: SidecarRegistration;
  } | null>(null);
  const [opening, setOpening] = useState(false);

  const handleAdd = useCallback(async () => {
    try {
      const values = await form.validate();
      const name = values.name.trim();
      if (!name) {
        Message.error(t('settings.sidecar.nameRequired'));
        return;
      }
      if (items.some((it) => it.name === name)) {
        Message.error(t('settings.sidecar.duplicateName'));
        return;
      }
      setAdding(true);
      await add({ name, port: values.port });
      form.resetFields();
      Message.success(t('settings.sidecar.addSuccess', { name }));
    } catch (error) {
      // Form validation failures throw; surface only the field rule errors
      // to avoid double-toasting the success path.
      if (error && typeof error === 'object' && 'fields' in error) return;
      console.error('[SidecarSettings] add failed:', error);
      Message.error(t('settings.sidecar.addFailed'));
    } finally {
      setAdding(false);
    }
  }, [add, form, items, t]);

  const handleRemove = useCallback(
    async (config: SidecarConfig) => {
      try {
        await remove(config);
        Message.success(t('settings.sidecar.removeSuccess', { name: config.name }));
      } catch (error) {
        console.error('[SidecarSettings] remove failed:', error);
        Message.error(t('settings.sidecar.removeFailed'));
      }
    },
    [remove, t]
  );

  const handleOpen = useCallback(
    async (config: SidecarConfig) => {
      setOpening(true);
      try {
        const registration = await ipcBridge.sidecar.register.invoke({ name: config.name, port: config.port });
        setOpenRegistration({ config, registration });
      } catch (error) {
        console.error('[SidecarSettings] open failed:', error);
        Message.error(t('settings.sidecar.openFailed'));
      } finally {
        setOpening(false);
      }
    },
    [t]
  );

  // The Modal pulls its URL from the registration we just produced; a
  // stale `openRegistration` (e.g. the user clicked Open twice) gets a
  // fresh URL via the `useEffect` below.
  React.useEffect(() => {
    if (!openRegistration) return;
    // No-op: the Modal renders `buildEmbedUrl(openRegistration.registration)`
    // on the fly. This effect exists as a hook point for future cleanup
    // (e.g. resetting cached tokens on unmount) — keeping it as a
    // separate effect keeps the body of `handleOpen` synchronous-friendly.
  }, [openRegistration]);

  return (
    <SettingsPageWrapper>
      <div className='space-y-16px'>
        <div>
          <h2 className='text-20px font-500 text-t-primary m-0'>{t('settings.sidecar.title')}</h2>
          <p className='m-0 mt-4px text-13px text-t-secondary'>{t('settings.sidecar.description')}</p>
        </div>

        <div className='bg-2 rd-16px p-12px md:p-16px space-y-12px'>
          <div className='flex items-center gap-6px rd-8px border border-line bg-fill-1 px-10px py-8px'>
            <Server theme='outline' size='16' className='text-t-secondary' />
            <span className='text-12px text-t-secondary leading-relaxed'>
              {t('settings.sidecar.localhostOnlyHint')}
            </span>
            <a
              role='button'
              tabIndex={0}
              data-sidecar-docs-link='true'
              className='text-primary text-12px hover:underline cursor-pointer bg-transparent border-none p-0'
              onClick={() =>
                ipcBridge.shell.openExternal
                  .invoke('https://github.com/iOfficeAI/AionUi/blob/main/docs/sidecars.md')
                  .catch(console.error)
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  ipcBridge.shell.openExternal
                    .invoke('https://github.com/iOfficeAI/AionUi/blob/main/docs/sidecars.md')
                    .catch(console.error);
                }
              }}
            >
              {t('settings.sidecar.viewDocs')}
            </a>
          </div>

          <Form form={form} layout='vertical' className='m-0'>
            <div className='flex flex-col md:flex-row md:items-end gap-12px'>
              <Form.Item
                field='name'
                label={t('settings.sidecar.name')}
                rules={[
                  { required: true, message: t('settings.sidecar.nameRequired') },
                  { maxLength: 64, message: t('settings.sidecar.nameTooLong') },
                ]}
                className='m-0 flex-1'
              >
                <Input
                  placeholder={t('settings.sidecar.namePlaceholder')}
                  allowClear
                  data-testid='sidecar-input-name'
                />
              </Form.Item>
              <Form.Item
                field='port'
                label={t('settings.sidecar.port')}
                rules={[
                  { required: true, message: t('settings.sidecar.portRequired') },
                  {
                    validator: (value, callback) => {
                      const n = Number(value);
                      if (!Number.isFinite(n) || n < MIN_PORT || n > MAX_PORT) {
                        callback(t('settings.sidecar.portRange', { min: MIN_PORT, max: MAX_PORT }));
                        return;
                      }
                      callback();
                    },
                  },
                ]}
                className='m-0 md:w-160px'
              >
                <InputNumber
                  min={MIN_PORT}
                  max={MAX_PORT}
                  step={1}
                  placeholder={t('settings.sidecar.portPlaceholder')}
                  data-testid='sidecar-input-port'
                />
              </Form.Item>
              <Button
                type='primary'
                loading={adding}
                onClick={() => void handleAdd()}
                data-testid='sidecar-add'
                icon={<Plus theme='outline' size='14' />}
              >
                {t('settings.sidecar.add')}
              </Button>
            </div>
          </Form>
        </div>

        <div className='bg-2 rd-16px p-12px md:p-16px'>
          <div className='flex items-center justify-between mb-12px'>
            <h3 className='text-14px font-500 text-t-primary m-0'>{t('settings.sidecar.listTitle')}</h3>
            <span className='text-12px text-t-tertiary'>{t('settings.sidecar.count', { count: items.length })}</span>
          </div>
          {items.length === 0 ? (
            <div
              data-testid='sidecar-empty'
              className='rd-10px border border-dashed border-line py-24px flex flex-col items-center gap-6px text-t-tertiary'
            >
              <Server theme='outline' size='24' />
              <span className='text-13px'>{t('settings.sidecar.empty')}</span>
            </div>
          ) : (
            <ul className='m-0 p-0 list-none space-y-8px' data-testid='sidecar-list'>
              {items.map((it) => (
                <li
                  key={`${it.name}-${it.port}`}
                  data-testid={`sidecar-row-${it.name}`}
                  className='rd-10px border border-line bg-fill-1 px-12px py-10px flex items-center gap-12px'
                >
                  <Server theme='outline' size='18' className='text-t-secondary shrink-0' />
                  <div className='min-w-0 flex-1'>
                    <div className='text-14px text-t-primary font-500 truncate'>{it.name}</div>
                    <div className='text-12px text-t-tertiary flex items-center gap-6px'>
                      <span>:{it.port}</span>
                      {it.id ? (
                        <Tag size='small' color='green' data-sidecar-status={it.name}>
                          {t('settings.sidecar.statusRegistered')}
                        </Tag>
                      ) : (
                        <Tag size='small' data-sidecar-status={it.name}>
                          {t('settings.sidecar.statusLocalOnly')}
                        </Tag>
                      )}
                    </div>
                  </div>
                  <div className='flex items-center gap-6px shrink-0'>
                    <Button
                      type='secondary'
                      size='mini'
                      loading={opening && openRegistration?.config.name === it.name}
                      icon={<LinkOut theme='outline' size='14' />}
                      onClick={() => void handleOpen(it)}
                      data-testid={`sidecar-open-${it.name}`}
                    >
                      {t('settings.sidecar.open')}
                    </Button>
                    <Popconfirm
                      title={t('settings.sidecar.removeConfirmTitle')}
                      content={t('settings.sidecar.removeConfirmContent', { name: it.name })}
                      okText={t('common.confirm')}
                      cancelText={t('common.cancel')}
                      onOk={() => void handleRemove(it)}
                    >
                      <Button type='text' status='danger' size='mini' data-testid={`sidecar-remove-${it.name}`}>
                        {t('common.remove')}
                      </Button>
                    </Popconfirm>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Modal
        visible={Boolean(openRegistration)}
        onCancel={() => setOpenRegistration(null)}
        footer={null}
        // Full-height modal without an OK button — the WebviewHost owns the viewport.
        style={{ width: '90vw', maxWidth: 1280 }}
        title={
          openRegistration
            ? `${openRegistration.config.name} — :${openRegistration.config.port}`
            : t('settings.sidecar.title')
        }
        data-sidecar-embed-modal='true'
      >
        {openRegistration ? (
          <div className='h-[70vh] min-h-400px w-full'>
            <WebviewHost url={buildEmbedUrl(openRegistration.registration)} showNavBar className='h-full w-full' />
          </div>
        ) : null}
      </Modal>
    </SettingsPageWrapper>
  );
};

export default SidecarSettings;
