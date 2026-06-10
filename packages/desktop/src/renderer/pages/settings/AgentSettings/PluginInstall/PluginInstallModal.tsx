/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { RemoteAgentConfig, RemoteAgentPluginInfo } from '@/common/types/agent/remoteAgentTypes';
import AionModal from '@/renderer/components/base/AionModal';
import { copyText } from '@/renderer/utils/ui/clipboard';
import { Button, Message, Modal, Spin, Tabs, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { Copy, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const POLL_INTERVAL = 5_000;
const TOKEN_MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

const maskToken = (text: string, token: string): string => {
  if (!token) return text;
  return text.split(token).join(TOKEN_MASK);
};

const SnippetBlock: React.FC<{
  text: string;
  displayText?: string;
  copyLabel: string;
  copiedLabel: string;
}> = ({ text, displayText, copyLabel, copiedLabel }) => {
  const handleCopy = useCallback(() => {
    void copyText(text).then(() => Message.success(copiedLabel));
  }, [text, copiedLabel]);

  return (
    <div className='relative rounded-8px border border-solid border-[var(--color-border-2)] bg-[var(--color-fill-1)]'>
      <pre className='m-0 overflow-x-auto px-12px py-10px pr-40px font-mono text-12px leading-18px text-t-primary'>
        {displayText ?? text}
      </pre>
      <Tooltip content={copyLabel}>
        <Button
          size='mini'
          type='text'
          icon={<Copy theme='outline' size='14' />}
          aria-label={copyLabel}
          onClick={handleCopy}
          className='!absolute right-6px top-6px text-t-secondary hover:text-t-primary'
        />
      </Tooltip>
    </div>
  );
};

const StatusBanner: React.FC<{ info: RemoteAgentPluginInfo | null; loading: boolean }> = ({ info, loading }) => {
  const { t } = useTranslation();

  if (loading && !info) {
    return (
      <div className='flex items-center gap-10px rounded-10px border border-solid border-[var(--color-border-2)] bg-[var(--color-fill-1)] px-14px py-12px'>
        <Spin size={14} />
        <Typography.Text type='secondary' className='text-13px'>
          {t('settings.remoteAgent.plugin.statusChecking')}
        </Typography.Text>
      </div>
    );
  }

  const status = info?.status;
  const connected = Boolean(status?.connected);

  return (
    <div
      className='flex flex-wrap items-center gap-x-12px gap-y-6px rounded-10px border border-solid px-14px py-12px'
      style={{
        borderColor: connected ? 'rgba(var(--success-6), 0.3)' : 'var(--color-border-2)',
        background: connected ? 'rgba(var(--success-6), 0.06)' : 'var(--color-fill-1)',
      }}
    >
      <Tag size='small' color={connected ? 'green' : 'orange'}>
        {connected ? t('settings.remoteAgent.plugin.statusConnected') : t('settings.remoteAgent.plugin.statusWaiting')}
      </Tag>
      {connected && status ? (
        <>
          {status.plugin_version ? (
            <Typography.Text type='secondary' className='text-12px'>
              {t('settings.remoteAgent.plugin.pluginVersion', { version: status.plugin_version })}
            </Typography.Text>
          ) : null}
          {status.opencode_version ? (
            <Typography.Text type='secondary' className='text-12px'>
              {t('settings.remoteAgent.plugin.serverVersion', { version: status.opencode_version })}
            </Typography.Text>
          ) : null}
          <Typography.Text type='secondary' className='text-12px'>
            {t('settings.remoteAgent.plugin.hooksDetected', { count: status.hooks.length })}
          </Typography.Text>
        </>
      ) : (
        <Typography.Text type='secondary' className='text-12px'>
          {t('settings.remoteAgent.plugin.statusHint')}
        </Typography.Text>
      )}
    </div>
  );
};

const PluginInstallModal: React.FC<{
  visible: boolean;
  agent?: RemoteAgentConfig;
  onClose: () => void;
}> = ({ visible, agent, onClose }) => {
  const { t } = useTranslation();
  const [info, setInfo] = useState<RemoteAgentPluginInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const agentId = agent?.id;

  const fetchInfo = useCallback(async () => {
    if (!agentId) return;
    try {
      const result = await ipcBridge.remoteAgent.getPluginInfo.invoke({ id: agentId });
      setInfo(result);
    } catch {
      // keep last known info; surface failure only when nothing is shown yet
      setInfo((prev) => {
        if (!prev) {
          Message.error(t('settings.remoteAgent.plugin.loadFailed'));
        }
        return prev;
      });
    } finally {
      setLoading(false);
    }
  }, [agentId, t]);

  useEffect(() => {
    if (!visible || !agentId) return;
    setLoading(true);
    setTokenVisible(false);
    void fetchInfo();
    pollRef.current = setInterval(() => void fetchInfo(), POLL_INTERVAL);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = undefined;
      }
    };
  }, [visible, agentId, fetchInfo]);

  const handleRotate = useCallback(() => {
    if (!agentId) return;
    Modal.confirm({
      title: t('settings.remoteAgent.plugin.rotateConfirmTitle'),
      content: t('settings.remoteAgent.plugin.rotateConfirmContent'),
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        setRotating(true);
        try {
          const result = await ipcBridge.remoteAgent.rotatePluginToken.invoke({ id: agentId });
          setInfo(result);
          Message.success(t('settings.remoteAgent.plugin.rotated'));
        } catch {
          Message.error(t('settings.remoteAgent.plugin.loadFailed'));
        } finally {
          setRotating(false);
        }
      },
    });
  }, [agentId, t]);

  const envText = info?.env_snippet ?? '';
  const token = info?.token ?? '';
  const dockerText = info ? `-e AIONCORE_URL=${info.endpoint_url} -e AIONCORE_TOKEN=${token}` : '';
  const systemdText = info
    ? `[Service]\nEnvironment=AIONCORE_URL=${info.endpoint_url}\nEnvironment=AIONCORE_TOKEN=${token}`
    : '';

  return (
    <AionModal
      visible={visible}
      onCancel={onClose}
      header={{ title: t('settings.remoteAgent.plugin.modalTitle'), showClose: true }}
      footer={null}
      style={{ width: 640, maxWidth: '92vw', borderRadius: 'var(--radius-panel)' }}
      contentStyle={{
        background: 'var(--dialog-fill-0)',
        borderRadius: 'var(--radius-panel)',
        padding: '20px 24px 24px',
        overflow: 'auto',
        maxHeight: '76vh',
      }}
      afterClose={() => {
        setInfo(null);
        setTokenVisible(false);
      }}
    >
      <div className='flex flex-col gap-16px'>
        <Typography.Text type='secondary' className='text-13px leading-20px'>
          {t('settings.remoteAgent.plugin.description')}
        </Typography.Text>

        <StatusBanner info={info} loading={loading} />

        {info ? (
          <>
            <div className='flex flex-col gap-8px'>
              <Typography.Text className='text-13px font-medium'>
                {t('settings.remoteAgent.plugin.step1Title')}
              </Typography.Text>
              <SnippetBlock
                text={info.config_snippet}
                copyLabel={t('common.copy')}
                copiedLabel={t('common.copySuccess')}
              />
            </div>

            <div className='flex flex-col gap-8px'>
              <div className='flex items-center justify-between gap-8px'>
                <Typography.Text className='text-13px font-medium'>
                  {t('settings.remoteAgent.plugin.step2Title')}
                </Typography.Text>
                <div className='flex items-center gap-8px'>
                  <Button size='mini' type='text' onClick={() => setTokenVisible((v) => !v)}>
                    {tokenVisible
                      ? t('settings.remoteAgent.plugin.hideToken')
                      : t('settings.remoteAgent.plugin.showToken')}
                  </Button>
                  <Button
                    size='mini'
                    type='text'
                    status='warning'
                    loading={rotating}
                    icon={<Refresh theme='outline' size='12' />}
                    onClick={handleRotate}
                  >
                    {t('settings.remoteAgent.plugin.rotateToken')}
                  </Button>
                </div>
              </div>
              <Tabs type='card-gutter' size='small' defaultActiveTab='bare'>
                <Tabs.TabPane key='bare' title={t('settings.remoteAgent.plugin.tabBare')}>
                  <div className='flex flex-col gap-8px pt-8px'>
                    <Typography.Text type='secondary' className='text-12px leading-18px'>
                      {t('settings.remoteAgent.plugin.bareInstructions')}
                    </Typography.Text>
                    <SnippetBlock
                      text={envText}
                      displayText={tokenVisible ? envText : maskToken(envText, token)}
                      copyLabel={t('common.copy')}
                      copiedLabel={t('common.copySuccess')}
                    />
                  </div>
                </Tabs.TabPane>
                <Tabs.TabPane key='docker' title={t('settings.remoteAgent.plugin.tabDocker')}>
                  <div className='flex flex-col gap-8px pt-8px'>
                    <Typography.Text type='secondary' className='text-12px leading-18px'>
                      {t('settings.remoteAgent.plugin.dockerInstructions')}
                    </Typography.Text>
                    <SnippetBlock
                      text={dockerText}
                      displayText={tokenVisible ? dockerText : maskToken(dockerText, token)}
                      copyLabel={t('common.copy')}
                      copiedLabel={t('common.copySuccess')}
                    />
                  </div>
                </Tabs.TabPane>
                <Tabs.TabPane key='systemd' title={t('settings.remoteAgent.plugin.tabSystemd')}>
                  <div className='flex flex-col gap-8px pt-8px'>
                    <Typography.Text type='secondary' className='text-12px leading-18px'>
                      {t('settings.remoteAgent.plugin.systemdInstructions')}
                    </Typography.Text>
                    <SnippetBlock
                      text={systemdText}
                      displayText={tokenVisible ? systemdText : maskToken(systemdText, token)}
                      copyLabel={t('common.copy')}
                      copiedLabel={t('common.copySuccess')}
                    />
                  </div>
                </Tabs.TabPane>
              </Tabs>
            </div>

            <div className='flex flex-col gap-8px'>
              <Typography.Text className='text-13px font-medium'>
                {t('settings.remoteAgent.plugin.step3Title')}
              </Typography.Text>
              <Typography.Text type='secondary' className='text-12px leading-18px'>
                {t('settings.remoteAgent.plugin.step3Body')}
              </Typography.Text>
            </div>
          </>
        ) : null}
      </div>
    </AionModal>
  );
};

export default PluginInstallModal;
