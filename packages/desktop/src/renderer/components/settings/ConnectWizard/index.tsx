/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { RemoteAgentInput } from '@/common/types/agent/remoteAgentTypes';
import { getDefaultRemoteAgentId, setDefaultRemoteAgentId } from '@/common/utils/defaultRemoteAgent';
import AionModal from '@/renderer/components/base/AionModal';
import {
  connectErrorI18nKey,
  parseConnectErrorCode,
  stripConnectErrorCode,
} from '@/renderer/utils/remote/connectError';
import { Button, Form, Input, Select, Spin, Switch, Typography } from '@arco-design/web-react';
import { Attention, CheckOne, CloseOne, LinkCloud, Loading, Magic, Server } from '@icon-park/react';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSWRConfig } from 'swr';
import { clearConnectWizardDismissal, dismissConnectWizard } from './connectWizardState';

const FormItem = Form.Item;

type Stage = 'form' | 'connecting' | 'done';

type StepId = 'test' | 'save' | 'handshake' | 'models';
type StepStatus = 'pending' | 'running' | 'success' | 'failure' | 'warning';

type StepState = {
  id: StepId;
  status: StepStatus;
};

type ConnectWizardProps = {
  visible: boolean;
  onClose: () => void;
  onCompleted?: (agentId: string) => void;
  firstRun?: boolean;
};

const INITIAL_STEPS: StepState[] = [
  { id: 'test', status: 'pending' },
  { id: 'save', status: 'pending' },
  { id: 'handshake', status: 'pending' },
  { id: 'models', status: 'pending' },
];

const stepI18nKey = (id: StepId): string => {
  switch (id) {
    case 'test':
      return 'settings.connectWizard.stepTest';
    case 'save':
      return 'settings.connectWizard.stepSave';
    case 'handshake':
      return 'settings.connectWizard.stepHandshake';
    case 'models':
      return 'settings.connectWizard.stepModels';
  }
};

const StepIcon: React.FC<{ status: StepStatus }> = ({ status }) => {
  switch (status) {
    case 'pending':
      return (
        <span className='inline-block w-18px h-18px rd-50% border-2 border-solid border-[var(--color-border-3)]' />
      );
    case 'running':
      return <Loading spin size='18' className='text-[rgb(var(--primary-6))]' />;
    case 'success':
      return <CheckOne size='18' className='text-[rgb(var(--success-6))]' />;
    case 'failure':
      return <CloseOne size='18' className='text-[rgb(var(--danger-6))]' />;
    case 'warning':
      return <Attention size='18' className='text-[rgb(var(--warning-6))]' />;
  }
};

const ConnectWizard: React.FC<ConnectWizardProps> = ({ visible, onClose, onCompleted, firstRun }) => {
  const { t } = useTranslation();
  const { mutate } = useSWRConfig();
  const [form] = Form.useForm();

  const [stage, setStage] = useState<Stage>('form');
  const [steps, setSteps] = useState<StepState[]>(INITIAL_STEPS);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [errorDetail, setErrorDetail] = useState<string>('');
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string>('');
  const [agentUrl, setAgentUrl] = useState<string>('');
  const [modelCount, setModelCount] = useState<number | null>(null);

  // Track form values for TLS retry
  const formValuesRef = useRef<RemoteAgentInput | null>(null);

  const updateStep = useCallback((id: StepId, status: StepStatus) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  }, []);

  const resetState = useCallback(() => {
    setStage('form');
    setSteps(INITIAL_STEPS);
    setErrorMessage('');
    setErrorDetail('');
    setErrorCode(undefined);
    setCreatedAgentId(null);
    setAgentName('');
    setAgentUrl('');
    setModelCount(null);
    formValuesRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handleSkip = useCallback(() => {
    dismissConnectWizard();
    resetState();
    onClose();
  }, [resetState, onClose]);

  const runConnection = useCallback(
    async (values: RemoteAgentInput, skipSave: boolean) => {
      formValuesRef.current = values;
      setStage('connecting');
      setErrorMessage('');
      setErrorDetail('');
      setErrorCode(undefined);

      // Reset steps
      setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: 'pending' as StepStatus })));

      const effectiveName = values.name?.trim() || t('settings.connectWizard.defaultAgentName');
      const payload: RemoteAgentInput = {
        ...values,
        name: effectiveName,
        protocol: 'opencode',
      };

      // Step 1: Test connection
      updateStep('test', 'running');
      try {
        const testResult = await ipcBridge.remoteAgent.testConnection.invoke({
          url: payload.url,
          protocol: 'opencode',
          auth_type: payload.auth_type || 'none',
          auth_token: payload.auth_token,
          allow_insecure: payload.allow_insecure,
        });
        if (!testResult.success) {
          const code = parseConnectErrorCode(testResult.error);
          updateStep('test', 'failure');
          setErrorCode(code);
          setErrorMessage(code ? t(connectErrorI18nKey(code)) : testResult.error || t('settings.connectWizard.retry'));
          setErrorDetail(testResult.error ? stripConnectErrorCode(testResult.error) : '');
          return;
        }
        updateStep('test', 'success');
      } catch (err) {
        updateStep('test', 'failure');
        setErrorMessage(String(err));
        return;
      }

      // Step 2: Save agent (skip if already created)
      let agentId = createdAgentId;
      if (skipSave && agentId) {
        updateStep('save', 'success');
      } else {
        updateStep('save', 'running');
        try {
          const created = await ipcBridge.remoteAgent.create.invoke(payload);
          agentId = created.id;
          setCreatedAgentId(agentId);
          updateStep('save', 'success');
        } catch (err) {
          updateStep('save', 'failure');
          setErrorMessage(String(err));
          return;
        }
      }

      // Step 3: Handshake
      if (agentId) {
        updateStep('handshake', 'running');
        try {
          const result = await ipcBridge.remoteAgent.handshake.invoke({ id: agentId });
          if (result.status === 'error') {
            const code = parseConnectErrorCode(result.error);
            updateStep('handshake', 'failure');
            setErrorCode(code);
            setErrorMessage(
              code ? t(connectErrorI18nKey(code)) : result.error || t('settings.remoteAgent.handshakeFailed')
            );
            setErrorDetail(result.error ? stripConnectErrorCode(result.error) : '');
            return;
          }
          updateStep('handshake', 'success');
        } catch (err) {
          updateStep('handshake', 'failure');
          setErrorMessage(String(err));
          return;
        }
      }

      // Step 4: Fetch models (non-blocking)
      if (agentId) {
        updateStep('models', 'running');
        try {
          const models = await ipcBridge.remoteAgent.refreshModels.invoke({ id: agentId });
          const count = Array.isArray(models)
            ? models.length
            : ((models as { available_models?: unknown[] })?.available_models?.length ?? 0);
          setModelCount(count);
          updateStep('models', 'success');
        } catch {
          updateStep('models', 'warning');
        }
      }

      // Set default agent if none exists
      if (agentId && !getDefaultRemoteAgentId()) {
        setDefaultRemoteAgentId(agentId);
      }

      // Mutate remote agents list
      void mutate('remote-agents.list');

      setAgentName(effectiveName);
      setAgentUrl(payload.url);
      setStage('done');

      // Clear dismissal so future zero-agent states can resurface the wizard
      clearConnectWizardDismissal();
    },
    [createdAgentId, mutate, t, updateStep]
  );

  const handleConnect = useCallback(async () => {
    try {
      const values = await form.validate();
      await runConnection(values as RemoteAgentInput, false);
    } catch {
      // validation error
    }
  }, [form, runConnection]);

  const handleRetryInsecure = useCallback(async () => {
    const prev = formValuesRef.current;
    if (!prev) return;
    const updated: RemoteAgentInput = { ...prev, allow_insecure: true };
    formValuesRef.current = updated;
    // Update form field
    form.setFieldsValue({ allow_insecure: true });
    await runConnection(updated, Boolean(createdAgentId));
  }, [createdAgentId, form, runConnection]);

  const handleBack = useCallback(() => {
    setStage('form');
    setErrorMessage('');
    setErrorDetail('');
    setErrorCode(undefined);
    setSteps(INITIAL_STEPS);
  }, []);

  const handleStartChatting = useCallback(() => {
    if (createdAgentId) {
      onCompleted?.(createdAgentId);
    }
    handleClose();
  }, [createdAgentId, handleClose, onCompleted]);

  const authType = Form.useWatch('auth_type', form) as string | undefined;
  const urlValue = Form.useWatch('url', form) as string | undefined;
  const showInsecure =
    typeof urlValue === 'string' && (urlValue.startsWith('wss://') || urlValue.startsWith('https://'));

  // --- Render stages ---

  const renderFormStage = () => (
    <div className='flex flex-col gap-16px pt-8px pb-8px'>
      <Typography.Text type='secondary' className='text-14px leading-22px'>
        {t('settings.connectWizard.intro')}
      </Typography.Text>

      <Form form={form} layout='vertical' autoComplete='off' initialValues={{ auth_type: 'none', tool_host: 'local' }}>
        <FormItem
          label={t('settings.connectWizard.urlLabel')}
          field='url'
          rules={[{ required: true, message: t('settings.connectWizard.urlRequired') }]}
        >
          <Input placeholder={t('settings.connectWizard.urlPlaceholder')} />
        </FormItem>

        <FormItem label={t('settings.connectWizard.nameLabel')} field='name'>
          <Input placeholder={t('settings.connectWizard.namePlaceholder')} />
        </FormItem>

        <FormItem label={t('settings.remoteAgent.authType')} field='auth_type' rules={[{ required: true }]}>
          <Select>
            <Select.Option value='none'>{t('settings.remoteAgent.authNone')}</Select.Option>
            <Select.Option value='bearer'>{t('settings.remoteAgent.authBearer')}</Select.Option>
            <Select.Option value='basic'>{t('settings.remoteAgent.authBasic')}</Select.Option>
            <Select.Option value='password'>{t('settings.remoteAgent.authPassword')}</Select.Option>
          </Select>
        </FormItem>

        {(authType === 'bearer' || authType === 'basic' || authType === 'password') && (
          <FormItem
            label={
              authType === 'password' ? t('settings.remoteAgent.authPassword') : t('settings.remoteAgent.authToken')
            }
            field='auth_token'
            rules={[{ required: true, message: t('settings.remoteAgent.tokenRequired') }]}
          >
            <Input.Password
              placeholder={
                authType === 'password'
                  ? t('settings.remoteAgent.passwordPlaceholder')
                  : t('settings.remoteAgent.tokenPlaceholder')
              }
            />
          </FormItem>
        )}

        {showInsecure && (
          <FormItem
            label={t('settings.remoteAgent.allowInsecure')}
            field='allow_insecure'
            triggerPropName='checked'
            extra={
              <Typography.Text type='secondary' className='text-12px'>
                {t('settings.remoteAgent.allowInsecureHint')}
              </Typography.Text>
            }
          >
            <Switch />
          </FormItem>
        )}

        <FormItem
          label={t('settings.remoteAgent.toolHost')}
          field='tool_host'
          initialValue='local'
          extra={
            <Typography.Text type='secondary' className='text-12px'>
              {t('settings.remoteAgent.toolHostHint')}
            </Typography.Text>
          }
        >
          <Select>
            <Select.Option value='local'>{t('settings.remoteAgent.toolHostLocal')}</Select.Option>
            <Select.Option value='server'>{t('settings.remoteAgent.toolHostServer')}</Select.Option>
          </Select>
        </FormItem>
      </Form>
    </div>
  );

  const renderConnectingStage = () => (
    <div className='flex flex-col gap-16px py-16px'>
      <div className='flex flex-col gap-12px'>
        {steps.map((step) => (
          <div key={step.id} className='flex items-center gap-10px'>
            <StepIcon status={step.status} />
            <Typography.Text
              className={`text-14px ${step.status === 'failure' ? 'text-[rgb(var(--danger-6))]' : step.status === 'warning' ? 'text-[rgb(var(--warning-6))]' : ''}`}
            >
              {t(stepI18nKey(step.id))}
            </Typography.Text>
          </div>
        ))}
      </div>

      {errorMessage && (
        <div className='flex flex-col gap-8px rd-8px border border-solid border-[rgba(var(--danger-6),0.2)] bg-[rgba(var(--danger-6),0.06)] p-12px'>
          <Typography.Text className='text-14px font-medium text-[rgb(var(--danger-6))]'>
            {errorMessage}
          </Typography.Text>
          {errorDetail && (
            <Typography.Text type='secondary' className='text-12px leading-18px'>
              {errorDetail}
            </Typography.Text>
          )}
        </div>
      )}
    </div>
  );

  const renderDoneStage = () => (
    <div className='flex flex-col items-center gap-16px py-24px'>
      <CheckOne size='48' className='text-[rgb(var(--success-6))]' />
      <Typography.Text className='text-18px font-medium text-t-primary'>
        {t('settings.connectWizard.successTitle')}
      </Typography.Text>
      <Typography.Text type='secondary' className='text-14px text-center'>
        {t('settings.connectWizard.successSummary', { name: agentName, url: agentUrl })}
      </Typography.Text>
      {modelCount !== null && modelCount > 0 && (
        <Typography.Text type='secondary' className='text-12px'>
          {t('settings.connectWizard.modelCount', { count: modelCount })}
        </Typography.Text>
      )}
    </div>
  );

  // Footer per stage
  const renderFooter = () => {
    if (stage === 'form') {
      return (
        <div className='flex justify-between mt-16px'>
          <div>
            {firstRun && (
              <Button type='text' onClick={handleSkip} className='text-t-secondary'>
                {t('settings.connectWizard.skip')}
              </Button>
            )}
          </div>
          <Button type='primary' icon={<LinkCloud size='16' />} onClick={handleConnect}>
            {t('settings.connectWizard.connect')}
          </Button>
        </div>
      );
    }

    if (stage === 'connecting') {
      const hasFailure = steps.some((s) => s.status === 'failure');
      if (!hasFailure) {
        // Still running — show a spinner footer
        return (
          <div className='flex justify-end mt-16px'>
            <Spin size={16} />
          </div>
        );
      }
      return (
        <div className='flex justify-between mt-16px'>
          <Button onClick={handleBack}>{t('settings.connectWizard.back')}</Button>
          <div className='flex gap-8px'>
            {errorCode === 'tls_failure' && !formValuesRef.current?.allow_insecure && (
              <Button type='outline' status='warning' onClick={handleRetryInsecure}>
                {t('settings.connectWizard.retryInsecure')}
              </Button>
            )}
            <Button type='primary' onClick={() => void runConnection(formValuesRef.current!, Boolean(createdAgentId))}>
              {t('settings.connectWizard.retry')}
            </Button>
          </div>
        </div>
      );
    }

    // done stage
    return (
      <div className='flex justify-end gap-8px mt-16px'>
        <Button onClick={handleClose}>{t('settings.connectWizard.close')}</Button>
        <Button type='primary' icon={<Magic size='16' />} onClick={handleStartChatting}>
          {t('settings.connectWizard.startChatting')}
        </Button>
      </div>
    );
  };

  return (
    <AionModal
      visible={visible}
      onCancel={handleClose}
      header={{
        title: (
          <span className='flex items-center gap-8px'>
            <Server size='20' />
            {t('settings.connectWizard.title')}
          </span>
        ),
        showClose: true,
      }}
      style={{ maxWidth: '520px', borderRadius: 'var(--radius-panel)' }}
      contentStyle={{
        background: 'var(--dialog-fill-0)',
        borderRadius: 'var(--radius-panel)',
        padding: '20px 24px 16px',
        overflow: 'auto',
      }}
      footer={{ render: renderFooter }}
      afterClose={resetState}
    >
      {stage === 'form' && renderFormStage()}
      {stage === 'connecting' && renderConnectingStage()}
      {stage === 'done' && renderDoneStage()}
    </AionModal>
  );
};

export default ConnectWizard;
