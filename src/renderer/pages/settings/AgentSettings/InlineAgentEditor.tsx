/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackendConfig } from '@/common/types/acpTypes';
import { acpConversation } from '@/common/adapter/ipcBridge';
import { Alert, Avatar, Button, Collapse, Input, Typography } from '@arco-design/web-react';
import { Plus, Delete, CheckOne, CloseOne } from '@icon-park/react';
import EmojiPicker from '@/renderer/components/chat/EmojiPicker';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import { uuid } from '@/common/utils';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

type TestStatus = 'idle' | 'testing' | 'success' | 'fail_cli' | 'fail_acp';

export interface EnvVar {
  id: string;
  key: string;
  value: string;
}

interface InlineAgentEditorProps {
  agent?: AcpBackendConfig | null;
  onSave: (agent: AcpBackendConfig) => void;
  onCancel: () => void;
}

/** Parse a space-separated argument string into an array, respecting quotes. */
export function parseArgsString(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  for (const char of input) {
    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === ' ') {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) args.push(current);
  return args;
}

export function envVarsToObject(vars: EnvVar[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const v of vars) {
    const key = v.key.trim();
    if (key) obj[key] = v.value;
  }
  return obj;
}

export function objectToEnvVars(obj: Record<string, string> | undefined): EnvVar[] {
  if (!obj || Object.keys(obj).length === 0) return [];
  return Object.entries(obj).map(([key, value]) => ({ id: uuid(), key, value }));
}

const InlineAgentEditor: React.FC<InlineAgentEditorProps> = ({ agent, onSave, onCancel }) => {
  const { t } = useTranslation();
  const { theme } = useThemeContext();

  const [avatar, setAvatar] = useState('🤖');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [argsString, setArgsString] = useState('');
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState('');
  const isJsonEditingRef = useRef(false);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');

  const buildJsonFromForm = useCallback(
    (opts?: { nameVal?: string; cmdVal?: string; argsVal?: string; envVal?: EnvVar[] }) => {
      const nameVal = opts?.nameVal ?? name;
      const cmdVal = opts?.cmdVal ?? command;
      const argsVal = opts?.argsVal ?? argsString;
      const envVal = opts?.envVal ?? envVars;
      const config: Record<string, unknown> = {
        name: nameVal,
        defaultCliPath: cmdVal,
        enabled: true,
        acpArgs: parseArgsString(argsVal),
        env: envVarsToObject(envVal),
      };
      return JSON.stringify(config, null, 2);
    },
    [name, command, argsString, envVars]
  );

  useEffect(() => {
    if (!isJsonEditingRef.current) {
      setJsonInput(buildJsonFromForm());
    }
  }, [buildJsonFromForm]);

  useEffect(() => {
    setTestStatus('idle');
    setJsonError('');
    isJsonEditingRef.current = false;
    if (agent) {
      setAvatar(agent.avatar || '🤖');
      setName(agent.name || '');
      setCommand(agent.defaultCliPath || '');
      setArgsString(agent.acpArgs?.join(' ') || '');
      setEnvVars(objectToEnvVars(agent.env));
    } else {
      setAvatar('🤖');
      setName('');
      setCommand('');
      setArgsString('');
      setEnvVars([]);
    }
    setShowAdvanced(false);
  }, [agent]);

  const jsonEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleJsonChange = useCallback((value: string) => {
    isJsonEditingRef.current = true;
    if (jsonEditTimerRef.current) clearTimeout(jsonEditTimerRef.current);
    setJsonInput(value);
    try {
      const parsed = JSON.parse(value);
      setJsonError('');
      if (typeof parsed.name === 'string') setName(parsed.name);
      if (typeof parsed.defaultCliPath === 'string') setCommand(parsed.defaultCliPath);
      if (Array.isArray(parsed.acpArgs)) setArgsString(parsed.acpArgs.join(' '));
      if (parsed.env && typeof parsed.env === 'object') {
        setEnvVars(objectToEnvVars(parsed.env as Record<string, string>));
      }
    } catch {
      setJsonError('Invalid JSON');
    }
    jsonEditTimerRef.current = setTimeout(() => {
      isJsonEditingRef.current = false;
      jsonEditTimerRef.current = null;
    }, 500);
  }, []);

  const handleNameChange = useCallback((v: string) => {
    isJsonEditingRef.current = false;
    setName(v);
  }, []);
  const handleCommandChange = useCallback((v: string) => {
    isJsonEditingRef.current = false;
    setCommand(v);
  }, []);
  const handleArgsChange = useCallback((v: string) => {
    isJsonEditingRef.current = false;
    setArgsString(v);
  }, []);

  const addEnvVar = useCallback(() => {
    isJsonEditingRef.current = false;
    setEnvVars((prev) => [...prev, { id: uuid(), key: '', value: '' }]);
  }, []);
  const removeEnvVar = useCallback((id: string) => {
    isJsonEditingRef.current = false;
    setEnvVars((prev) => prev.filter((v) => v.id !== id));
  }, []);
  const updateEnvVar = useCallback((id: string, field: 'key' | 'value', val: string) => {
    isJsonEditingRef.current = false;
    setEnvVars((prev) => prev.map((v) => (v.id === id ? { ...v, [field]: val } : v)));
  }, []);

  const handleTestConnection = useCallback(async () => {
    setTestStatus('testing');
    try {
      const parsedArgs = parseArgsString(argsString);
      const envObj = envVarsToObject(envVars);
      const result = await acpConversation.testCustomAgent.invoke({
        command: command.trim(),
        acpArgs: parsedArgs.length > 0 ? parsedArgs : undefined,
        env: Object.keys(envObj).length > 0 ? envObj : undefined,
      });
      if (result.success) {
        setTestStatus('success');
      } else if (result.data?.step === 'cli_check') {
        setTestStatus('fail_cli');
      } else {
        setTestStatus('fail_acp');
      }
    } catch {
      setTestStatus('fail_cli');
    }
  }, [command, argsString, envVars]);

  const handleSubmit = useCallback(() => {
    const parsedArgs = parseArgsString(argsString);
    const envObj = envVarsToObject(envVars);
    const customAgent: AcpBackendConfig = {
      id: agent?.id || uuid(),
      name: name.trim() || 'Custom Agent',
      avatar,
      defaultCliPath: command.trim(),
      enabled: agent?.enabled !== false,
      acpArgs: parsedArgs.length > 0 ? parsedArgs : undefined,
      env: Object.keys(envObj).length > 0 ? envObj : undefined,
    };
    onSave(customAgent);
  }, [agent, name, avatar, command, argsString, envVars, onSave]);

  const isSubmitDisabled = !name.trim() || !command.trim();
  const isTestDisabled = !command.trim() || testStatus === 'testing';
  const fieldLabelClassName = 'mb-6px block text-13px font-medium text-t-primary';
  const fieldHelpClassName = 'mt-4px block text-12px leading-18px text-t-tertiary';

  return (
    <div className='flex flex-col gap-16px pt-8px pb-20px'>
      {/* Avatar + Name row */}
      <div className='flex items-center gap-12px'>
        <EmojiPicker onChange={(emoji) => setAvatar(emoji)}>
          <div className='cursor-pointer shrink-0'>
            <Avatar
              size={48}
              shape='square'
              style={{ backgroundColor: 'var(--color-fill-3)', fontSize: 24, borderRadius: 12 }}
            >
              {avatar}
            </Avatar>
          </div>
        </EmojiPicker>
        <div className='min-w-0 flex-1'>
          <Typography.Text className={fieldLabelClassName}>{t('settings.agentDisplayName')}</Typography.Text>
          <Input
            size='large'
            value={name}
            onChange={handleNameChange}
            placeholder={t('settings.agentNamePlaceholder')}
          />
        </div>
      </div>

      {/* Command */}
      <div>
        <Typography.Text className={fieldLabelClassName}>{t('settings.commandLabel')}</Typography.Text>
        <Input
          size='large'
          value={command}
          onChange={handleCommandChange}
          placeholder={t('settings.commandPlaceholder')}
        />
        <Typography.Text type='secondary' className={fieldHelpClassName}>
          {t('settings.commandHelp')}
        </Typography.Text>
      </div>

      {/* Arguments */}
      <div>
        <Typography.Text className={fieldLabelClassName}>{t('settings.argsLabel')}</Typography.Text>
        <Input
          size='large'
          value={argsString}
          onChange={handleArgsChange}
          placeholder={t('settings.argsPlaceholder')}
        />
        <Typography.Text type='secondary' className={fieldHelpClassName}>
          {t('settings.argsHelp')}
        </Typography.Text>
      </div>

      {/* Environment Variables */}
      <div>
        <Typography.Text className={fieldLabelClassName}>{t('settings.envLabel')}</Typography.Text>
        <div className='flex flex-col gap-10px'>
          {envVars.map((envVar) => (
            <div key={envVar.id} className='grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-8px'>
              <Input
                size='large'
                value={envVar.key}
                onChange={(v) => updateEnvVar(envVar.id, 'key', v)}
                placeholder={t('settings.envKeyPlaceholder')}
              />
              <Input
                size='large'
                value={envVar.value}
                onChange={(v) => updateEnvVar(envVar.id, 'value', v)}
                placeholder={t('settings.envValuePlaceholder')}
              />
              <Button
                type='text'
                size='small'
                icon={<Delete theme='outline' size={16} />}
                onClick={() => removeEnvVar(envVar.id)}
                className='!h-36px !w-36px !rounded-10px !px-0 text-t-tertiary hover:text-danger'
              />
            </div>
          ))}
        </div>
        <Button
          type='text'
          size='small'
          icon={<Plus theme='outline' size={14} />}
          onClick={addEnvVar}
          className='mt-8px !px-0 text-t-secondary hover:!text-primary-6'
        >
          {t('settings.addEnvVar')}
        </Button>
      </div>

      {/* Test Connection */}
      <div>
        <Button
          long
          type='outline'
          disabled={isTestDisabled}
          onClick={handleTestConnection}
          loading={testStatus === 'testing'}
          className='!rounded-10px'
        >
          {testStatus === 'testing' ? t('settings.testConnectionTesting') : t('settings.testConnectionBtn')}
        </Button>
        {testStatus === 'success' && (
          <Alert
            className='mt-10px'
            type='success'
            icon={<CheckOne theme='filled' size={16} />}
            content={t('settings.testConnectionSuccess')}
          />
        )}
        {testStatus === 'fail_cli' && (
          <Alert
            className='mt-10px'
            type='error'
            icon={<CloseOne theme='filled' size={16} />}
            content={t('settings.testConnectionFailCli')}
          />
        )}
        {testStatus === 'fail_acp' && (
          <Alert
            className='mt-10px'
            type='warning'
            icon={<CloseOne theme='filled' size={16} />}
            content={t('settings.testConnectionFailAcp')}
          />
        )}
      </div>

      {/* Advanced JSON Editor */}
      <div className='overflow-hidden rounded-12px border border-solid border-[var(--color-border-2)] bg-[var(--color-fill-1)]'>
        <Collapse
          activeKey={showAdvanced ? ['advanced'] : []}
          onChange={(_key, keys) => setShowAdvanced(keys.includes('advanced'))}
          bordered={false}
          style={{ background: 'transparent' }}
        >
          <Collapse.Item
            name='advanced'
            header={<span className='text-13px text-t-secondary'>{t('settings.advancedMode')}</span>}
          >
            <div className='pt-8px'>
              <CodeMirror
                value={jsonInput}
                height='200px'
                theme={theme}
                extensions={[json()]}
                onChange={handleJsonChange}
                basicSetup={{ lineNumbers: true, foldGutter: true, dropCursor: false, allowMultipleSelections: false }}
                style={{
                  fontSize: '12px',
                  border: jsonError ? '1px solid var(--danger)' : '1px solid var(--color-border-2)',
                  borderRadius: '10px',
                  overflow: 'hidden',
                }}
                className='[&_.cm-editor]:rounded-[10px]'
              />
              {jsonError && <div className='mt-4px text-xs text-danger'>{jsonError}</div>}
            </div>
          </Collapse.Item>
        </Collapse>
      </div>

      {/* Actions */}
      <div className='flex justify-end gap-10px pt-4px'>
        <Button className='!rounded-10px !px-20px' onClick={onCancel}>
          {t('common.cancel') || 'Cancel'}
        </Button>
        <Button type='primary' disabled={isSubmitDisabled} onClick={handleSubmit} className='!rounded-10px !px-20px'>
          {t('common.save') || 'Save'}
        </Button>
      </div>
    </div>
  );
};

export default InlineAgentEditor;
