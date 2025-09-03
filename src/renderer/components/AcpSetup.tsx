/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Button, Select, Input, Form, Typography, Alert, Modal } from '@arco-design/web-react';
import { FolderOpen, Link } from '@icon-park/react';
import type { AcpBackend } from '@/common/acpTypes';
import { dialog, acpConversation } from '@/common/ipcBridge';
import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';

const { Text } = Typography;

export interface AcpSetupProps {
  onSetupComplete: (config: { backend: AcpBackend; cliPath?: string; workingDir: string }) => void;
  onCancel?: () => void;
  onNavigateToSettings?: () => void;
}

const AcpSetup: React.FC<AcpSetupProps> = ({ onSetupComplete, onCancel, onNavigateToSettings }) => {
  const [form] = Form.useForm();
  const [backend, setBackend] = useState<AcpBackend>('claude');
  const [cliPath, setCliPath] = useState('');
  const [workingDir, setWorkingDir] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [geminiAuthStatus, setGeminiAuthStatus] = useState<{ 
    isAvailable: boolean; 
    method?: 'oauth' | 'apikey'; 
    account?: string; 
    modelName?: string;
  }>({ isAvailable: false });
  const [isCheckingAuth, setIsCheckingAuth] = useState(false);

  useEffect(() => {
    // Load working directory from Gemini settings
    loadWorkingDirectory();
  }, []);

  useEffect(() => {
    // Auto-detect CLI path when backend changes
    detectCliPath();
    // Check Gemini auth status when backend is gemini
    if (backend === 'gemini') {
      checkGeminiAuth();
    }
  }, [backend]);

  const loadWorkingDirectory = async () => {
    try {
      // Get system info which contains the working directory
      const systemInfo = await ipcBridge.application.systemInfo.invoke();
      if (systemInfo && systemInfo.workDir) {
        setWorkingDir(systemInfo.workDir);
        form.setFieldValue('workingDir', systemInfo.workDir);
      } else {
        // If workDir not set in settings, try to get from gemini.config
        const geminiConfig = await ConfigStorage.get('gemini.config');
        const workDir = (geminiConfig as any)?.workDir || process.env.HOME || process.env.USERPROFILE || '/';
        setWorkingDir(workDir);
        form.setFieldValue('workingDir', workDir);
      }
    } catch (error) {
      // Fallback to user's home directory
      const defaultDir = process.env.HOME || process.env.USERPROFILE || '/';
      setWorkingDir(defaultDir);
      form.setFieldValue('workingDir', defaultDir);
    }
  };

  const detectCliPath = async () => {
    setIsDetecting(true);
    try {
      const result = await acpConversation.detectCliPath.invoke({ backend });
      if (result.success && result.data?.path) {
        setCliPath(result.data.path);
        setIsValid(true);
        form.setFieldValue('cliPath', result.data.path);
      } else {
        setIsValid(false);
      }
    } catch (error) {
      setIsValid(false);
    } finally {
      setIsDetecting(false);
    }
  };

  const checkGeminiAuth = async () => {
    setIsCheckingAuth(true);
    try {
      // First check Google OAuth status
      const geminiConfig = await ConfigStorage.get('gemini.config');
      const oauthResult = await ipcBridge.googleAuth.status.invoke({ proxy: (geminiConfig as any)?.proxy });
      
      if (oauthResult.success && oauthResult.data?.account) {
        setGeminiAuthStatus({ 
          isAvailable: true, 
          method: 'oauth', 
          account: oauthResult.data.account 
        });
        return;
      }

      // If OAuth not available, check for API Key models
      const modelConfig = await ipcBridge.mode.getModelConfig.invoke();
      const geminiModels = (modelConfig || []).filter(platform => 
        platform.platform === 'gemini' && platform.apiKey && platform.model.length > 0
      );

      if (geminiModels.length > 0) {
        setGeminiAuthStatus({ 
          isAvailable: true, 
          method: 'apikey', 
          modelName: geminiModels[0].name 
        });
        return;
      }

      // Neither OAuth nor API Key available
      setGeminiAuthStatus({ isAvailable: false });
    } catch (error) {
      setGeminiAuthStatus({ isAvailable: false });
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const selectCliPath = async () => {
    try {
      const result = await dialog.showOpen.invoke({
        properties: ['openFile'],
      });

      if (result && result.length > 0) {
        setCliPath(result[0]);
        setIsValid(true);
        form.setFieldValue('cliPath', result[0]);
      }
    } catch (error) {}
  };

  const handleSubmit = () => {
    form.validate((errors, values) => {
      if (!errors) {
        if (values.backend === 'gemini') {
          if (!values.cliPath) {
            return;
          }
          // 不再拦截用户，让后端自动处理认证
          // 即使没有预先配置的认证信息，也允许用户继续，后端会自动启动 Google 登录流程
        }
        // Working directory is automatically loaded from Gemini settings
        onSetupComplete({
          backend: values.backend,
          cliPath: values.cliPath,
          workingDir: workingDir, // Use the loaded working directory
        });
      }
    });
  };

  return (
    <div className='acp-setup p-4 max-w-md mx-auto'>
      <div className='mb-4'>
        <h3 className='text-lg font-semibold mb-2'>Setup ACP Connection</h3>
        <Text type='secondary'>Configure connection to {backend === 'claude' ? 'Claude Code' : 'Gemini CLI'} via ACP protocol</Text>
      </div>

      <Form
        form={form}
        layout='vertical'
        initialValues={{
          backend: 'claude',
          cliPath: cliPath,
        }}
      >
        <Form.Item field='backend' label='AI Backend' rules={[{ required: true, message: 'Please select a backend' }]}>
          <Select
            value={backend}
            onChange={(value) => {
              setBackend(value as AcpBackend);
              form.setFieldValue('backend', value);
            }}
          >
            <Select.Option value='claude'>Claude Code</Select.Option>
            <Select.Option value='gemini'>Gemini CLI</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          field='cliPath'
          label={
            <div className='flex items-center justify-between'>
              <span>{backend === 'claude' ? 'Claude CLI Path (Optional)' : 'Gemini CLI Path'}</span>
              <Button type='text' size='mini' loading={isDetecting} onClick={detectCliPath}>
                Auto-detect
              </Button>
            </div>
          }
          rules={[{ required: backend === 'gemini', message: 'CLI path is required for Gemini' }]}
        >
          <Input value={cliPath} onChange={setCliPath} placeholder={backend === 'claude' ? 'Optional: Path to claude executable' : `Path to ${backend} executable`} suffix={<Button type='text' size='mini' icon={<FolderOpen />} onClick={selectCliPath} />} />
        </Form.Item>

        {/* Gemini Authentication Status */}
        {backend === 'gemini' && (
          <div className='mb-4 p-3 rounded'>
            {isCheckingAuth ? (
              <Alert type='info' content='检查 Gemini 认证状态...' />
            ) : geminiAuthStatus.isAvailable ? (
              <Alert 
                type='success' 
                content={
                  geminiAuthStatus.method === 'oauth' 
                    ? `已登录 Google 账户: ${geminiAuthStatus.account}` 
                    : `已配置 API Key 模型: ${geminiAuthStatus.modelName}`
                } 
              />
            ) : (
              <Alert 
                type='info' 
                content={
                  <div className='flex items-center justify-between'>
                    <span>暂未检测到预配置的认证信息，系统将在连接时自动启动 Google 登录</span>
                    {onNavigateToSettings && (
                      <Button type='text' size='mini' icon={<Link />} onClick={onNavigateToSettings}>
                        预先设置
                      </Button>
                    )}
                  </div>
                }
              />
            )}
          </div>
        )}

        {/* Display the working directory that will be used */}
        <div className='mb-4 p-3 bg-blue-50 rounded'>
          <Text type='secondary'>
            <strong>Working Directory:</strong> {workingDir || 'Loading...'}
            <br />
            <span className='text-xs'>This is configured in Settings → Gemini Settings</span>
          </Text>
        </div>

        <div className='flex justify-between mt-6'>
          {onCancel && <Button onClick={onCancel}>Cancel</Button>}
          <Button 
            type='primary' 
            onClick={handleSubmit} 
            disabled={
              (backend === 'gemini' && !isValid) || 
              isCheckingAuth
            }
          >
            Create ACP Connection
          </Button>
        </div>
      </Form>

      <div className='mt-4 p-3 bg-gray-50 rounded text-sm'>
        <Text type='secondary'>
          <strong>Note:</strong> {backend === 'claude' ? 'Claude Code will be auto-detected if installed in PATH, or you can specify a custom path. Uses @zed-industries/claude-code-acp with auto-detection patches.' : 'Gemini CLI must be installed and accessible in your PATH or specify the full path to the executable.'}
        </Text>
      </div>
    </div>
  );
};

export default AcpSetup;
