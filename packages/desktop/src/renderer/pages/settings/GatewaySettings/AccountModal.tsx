/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Message, Modal, Select, Tag } from '@arco-design/web-react';
import { GATEWAY_PLATFORM_OPTIONS, type GatewayAccount, type GatewayPlatform } from './types';

type AccountModalProps = {
  visible: boolean;
  account?: GatewayAccount | null;
  initialPlatform?: GatewayPlatform;
  onClose: () => void;
  onSave: (account: GatewayAccount) => void;
};

export const AccountModal: React.FC<AccountModalProps> = ({ visible, account, initialPlatform, onClose, onSave }) => {
  const [form] = Form.useForm();
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [googleLoggingIn, setGoogleLoggingIn] = useState(false);
  const [googleConnectedEmail, setGoogleConnectedEmail] = useState<string | null>(null);

  const platformValue = Form.useWatch('platform', form);
  const currentFormModels = Form.useWatch('models', form);

  useEffect(() => {
    if (visible) {
      if (account) {
        form.setFieldsValue({
          name: account.name,
          platform: account.platform,
          baseUrl: account.baseUrl,
          apiKey: account.apiKey,
          models: account.models,
          requestsPerMinute: account.quotaLimit?.requestsPerMinute,
          tokensPerMinute: account.quotaLimit?.tokensPerMinute,
        });
        if (account.name.includes('@')) {
          const match = account.name.match(/[\w.-]+@[\w.-]+\.\w+/);
          if (match) setGoogleConnectedEmail(match[0]);
        }
      } else {
        const targetPlat = initialPlatform || 'gemini';
        const preset = GATEWAY_PLATFORM_OPTIONS.find((p) => p.value === targetPlat) || GATEWAY_PLATFORM_OPTIONS[0];
        form.setFieldsValue({
          name: preset.label,
          platform: preset.value,
          baseUrl: preset.defaultUrl,
          apiKey: preset.value === 'omniroute' ? 'sk-9465108bb15ed26b-1477ab-600eaeb5' : '',
          models: preset.defaultModels,
          requestsPerMinute: undefined,
          tokensPerMinute: undefined,
        });
        setGoogleConnectedEmail(null);
      }
    }
  }, [visible, account, initialPlatform, form]);

  const handlePlatformChange = (platform: GatewayPlatform) => {
    const preset = GATEWAY_PLATFORM_OPTIONS.find((p) => p.value === platform);
    if (preset) {
      form.setFieldValue('baseUrl', preset.defaultUrl);
      if (!account) {
        form.setFieldValue('models', preset.defaultModels);
        if (!form.getFieldValue('name')) {
          form.setFieldValue('name', preset.label);
        }
        if (platform === 'omniroute' && !form.getFieldValue('apiKey')) {
          form.setFieldValue('apiKey', 'sk-9465108bb15ed26b-1477ab-600eaeb5');
        }
      }
    }
  };

  const handleDirectGoogleLogin = async () => {
    if (!window.electronAPI?.gatewayGoogleOAuthLogin) {
      Message.warning('Direct browser login is only supported in desktop mode');
      return;
    }
    setGoogleLoggingIn(true);
    try {
      Message.info('Opening Google Sign-In in your browser...');
      const res = await window.electronAPI.gatewayGoogleOAuthLogin();
      if (res.success && res.email) {
        setGoogleConnectedEmail(res.email);
        form.setFieldValue('name', `Google Account (${res.email})`);
        if (res.accessToken) {
          form.setFieldValue('apiKey', res.accessToken);
        }
        const currentModels = form.getFieldValue('models') || [];
        if (!currentModels || currentModels.length === 0 || currentModels[0] === 'default') {
          form.setFieldValue('models', [
            'gemini-2.5-pro',
            'gemini-2.5-flash',
            'antigravity/claude-sonnet-4-6',
            'antigravity/gemini-3.8-flash-tiered',
          ]);
        }
        Message.success(`Successfully connected Google Account: ${res.email}`);
      } else {
        Message.error(res.error || 'Google login failed or was cancelled');
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      Message.error(`Login error: ${errorMsg}`);
    } finally {
      setGoogleLoggingIn(false);
    }
  };

  const handleFetchModels = async () => {
    const baseUrl = form.getFieldValue('baseUrl') || '';
    const apiKey = form.getFieldValue('apiKey') || '';
    if (!baseUrl) {
      Message.warning('Please enter a Base URL first');
      return;
    }
    setFetchingModels(true);
    try {
      const cleanUrl = baseUrl.trim().replace(/\/+$/, '');
      const modelsEndpoint = cleanUrl.endsWith('/models') ? cleanUrl : `${cleanUrl}/models`;
      const res = await fetch(modelsEndpoint, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.data)) {
          const modelIds: string[] = data.data
            .map((m: { id?: string; name?: string }) => m.id || m.name || '')
            .filter(Boolean);
          modelIds.sort((a, b) => {
            const aAg = a.startsWith('antigravity/') || a.startsWith('claude');
            const bAg = b.startsWith('antigravity/') || b.startsWith('claude');
            if (aAg && !bAg) return -1;
            if (!aAg && bAg) return 1;
            return a.localeCompare(b);
          });
          setFetchedModels(modelIds);
          const current = form.getFieldValue('models');
          if (!current || (Array.isArray(current) && current.length === 0)) {
            form.setFieldValue('models', modelIds.slice(0, 5));
          }
          Message.success(`Loaded ${modelIds.length} models successfully!`);
          return;
        }
      }
      throw new Error(`Server returned HTTP ${res.status}`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      Message.error(`Failed to fetch models: ${errorMsg || 'Check URL and token'}`);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleOk = async () => {
    try {
      const values = await form.validate();
      const updated: GatewayAccount = {
        id: account ? account.id : `acc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: values.name.trim(),
        platform: values.platform,
        baseUrl: values.baseUrl.trim(),
        apiKey: (values.apiKey || '').trim(),
        models: Array.isArray(values.models) ? values.models : [values.models],
        enabled: account ? account.enabled : true,
        quotaLimit: {
          requestsPerMinute: values.requestsPerMinute,
          tokensPerMinute: values.tokensPerMinute,
        },
        quotaRemaining: account?.quotaRemaining,
        status: account?.status ?? 'active',
        cooldownUntil: account?.cooldownUntil,
      };
      onSave(updated);
      onClose();
    } catch (err) {
      console.warn('[AccountModal] Validation failed:', err);
    }
  };

  const currentPreset = GATEWAY_PLATFORM_OPTIONS.find((p) => p.value === platformValue);
  const modelsList = Array.isArray(currentFormModels)
    ? currentFormModels
    : currentFormModels
      ? [currentFormModels]
      : [];
  const allModelOptions = Array.from(
    new Set([...fetchedModels, ...(currentPreset?.defaultModels || []), ...modelsList])
  ).filter(Boolean);

  return (
    <Modal
      title={account ? 'Edit Provider Account' : 'Connect New Account'}
      visible={visible}
      onOk={handleOk}
      onCancel={onClose}
      okText='Save Account'
      cancelText='Cancel'
      autoFocus={false}
      focusLock={true}
    >
      <Form form={form} layout='vertical'>
        <Form.Item
          label='Account Label'
          field='name'
          rules={[{ required: true, message: 'Please enter a name for this account' }]}
        >
          <Input placeholder='e.g., Google Account (Personal), Work Claude, DeepSeek Backup' />
        </Form.Item>

        <Form.Item label='Platform' field='platform' rules={[{ required: true }]}>
          <Select onChange={handlePlatformChange}>
            {GATEWAY_PLATFORM_OPTIONS.map((opt) => (
              <Select.Option key={opt.value} value={opt.value}>
                {opt.label}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item label='Base URL' field='baseUrl' rules={[{ required: true }]}>
          <Input placeholder='API Base URL' />
        </Form.Item>

        {/* Direct Google Account Login (Browser Flow) */}
        {(platformValue === 'gemini' || platformValue === 'omniroute') && (
          <div className='mb-16px p-14px rounded-10px border border-border-2 bg-fill-2 flex flex-col gap-10px'>
            <div className='flex items-center justify-between'>
              <div className='text-13px font-600 text-t-primary flex items-center gap-6px'>
                <span>Direct Google Account Sign-In</span>
              </div>
              {googleConnectedEmail ? (
                <Tag color='green' size='small'>
                  ✓ Connected
                </Tag>
              ) : (
                <Tag color='arcoblue' size='small'>
                  No API Key Required
                </Tag>
              )}
            </div>
            <div className='text-12px text-t-secondary leading-18px'>
              Sign in directly using your Google Account in your default browser. This automatically authorizes Google
              Gemini &amp; Antigravity without needing an API key.
            </div>

            {googleConnectedEmail ? (
              <div className='flex items-center justify-between bg-fill-3 p-10px rounded-6px border border-success/30'>
                <div className='flex items-center gap-8px'>
                  <span className='text-success font-bold'>✓</span>
                  <span className='text-12px font-500 text-t-primary'>{googleConnectedEmail}</span>
                </div>
                <Button
                  size='mini'
                  type='text'
                  status='danger'
                  onClick={() => {
                    setGoogleConnectedEmail(null);
                    form.setFieldValue('apiKey', '');
                  }}
                >
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button
                type='primary'
                loading={googleLoggingIn}
                className='flex items-center justify-center gap-8px w-full font-500 bg-primary'
                onClick={handleDirectGoogleLogin}
              >
                <svg width='16' height='16' viewBox='0 0 18 18' xmlns='http://www.w3.org/2000/svg'>
                  <g fill='none' fillRule='evenodd'>
                    <path
                      d='M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z'
                      fill='#4285F4'
                    />
                    <path
                      d='M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z'
                      fill='#34A853'
                    />
                    <path
                      d='M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z'
                      fill='#FBBC05'
                    />
                    <path
                      d='M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z'
                      fill='#EA4335'
                    />
                  </g>
                </svg>
                {googleLoggingIn ? 'Waiting for Google Login in Browser...' : 'Sign in with Google via Browser'}
              </Button>
            )}
          </div>
        )}

        <Form.Item label='API Key / Token' field='apiKey'>
          <Input.Password placeholder='Auto-filled via Google login above, or enter API key manually' />
        </Form.Item>

        <div className='flex items-center justify-between mb-4px'>
          <span className='arco-form-label-item'>
            <span className='arco-form-label-item-required'>*</span> Available Models
          </span>
          <Button size='mini' type='text' loading={fetchingModels} onClick={handleFetchModels} className='text-primary'>
            Fetch Models from Provider
          </Button>
        </div>
        <Form.Item field='models' rules={[{ required: true, message: 'At least one model is required' }]}>
          <Select mode='tags' placeholder='Type model name or select from fetched list' allowClear>
            {allModelOptions.map((m) => (
              <Select.Option key={m} value={m}>
                {m}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <div className='grid grid-cols-2 gap-12px'>
          <Form.Item label='RPM Limit (optional)' field='requestsPerMinute'>
            <InputNumber placeholder='e.g. 15' min={1} />
          </Form.Item>
          <Form.Item label='TPM Limit (optional)' field='tokensPerMinute'>
            <InputNumber placeholder='e.g. 1000000' min={1000} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
};
