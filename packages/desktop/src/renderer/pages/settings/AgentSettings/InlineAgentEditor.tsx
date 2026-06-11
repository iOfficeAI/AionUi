/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CustomAgentAdvancedOverrides } from '@/common/types/platform/acpTypes';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';
import { acpConversation } from '@/common/adapter/ipcBridge';
import { Alert, Avatar, Button, Collapse, Input, Typography } from '@arco-design/web-react';
import { Plus, Delete, CheckOne, CloseOne } from '@icon-park/react';
import EmojiPicker from '@/renderer/components/chat/EmojiPicker';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import { uuid } from '@/common/utils';
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

type TestStatus = 'idle' | 'testing' | 'success' | 'fail_cli' | 'fail_acp';

export interface EnvVar {
  id: string;
  key: string;
  value: string;
}

/**
 * Payload emitted by {@link InlineAgentEditor} on save. Matches the backend
 * `CustomAgentUpsertRequest` body (sans `id`, which LocalAgents reattaches
 * when calling `updateCustomAgent`). Keeping this shape aligned with the
 * IPC contract avoids a legacy intermediate conversion step.
 */
export interface CustomAgentDraft {
  /** Preserved across edits; new drafts receive a fresh uuid. */
  id: string;
  name: string;
  /** User-picked emoji or avatar URL — backend field name is `icon`. */
  icon?: string;
  /** Spawn command for the CLI. */
  command: string;
  enabled: boolean;
  args?: string[];
  env?: Array<{ name: string; value: string; description?: string }>;
  advanced?: CustomAgentAdvancedOverrides;
}

interface InlineAgentEditorProps {
  agent?: AgentMetadata | null;
  onSave: (agent: CustomAgentDraft) => void;
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

/** Convert the backend `AgentMetadata.env` array form into the flat record the
 *  form's `{key,value}` rows expect. */
function agentEnvToRecord(entries: AgentMetadata['env'] | undefined): Record<string, string> | undefined {
  if (!entries || entries.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const e of entries) {
    if (e.name) out[e.name] = e.value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Rebuild the editor's `advanced` override bag from an `AgentMetadata` row. */
function agentToAdvanced(agent: AgentMetadata): CustomAgentAdvancedOverrides {
  const advanced: CustomAgentAdvancedOverrides = {};
  if (agent.yolo_id) advanced.yolo_id = agent.yolo_id;
  if (agent.native_skills_dirs && agent.native_skills_dirs.length > 0) {
    advanced.native_skills_dirs = agent.native_skills_dirs;
  }
  if (agent.behavior_policy && Object.keys(agent.behavior_policy).length > 0) {
    advanced.behavior_policy = agent.behavior_policy;
  }
  if (agent.description) advanced.description = agent.description;
  return advanced;
}

const InlineAgentEditor: React.FC<InlineAgentEditorProps> = ({ agent, onSave, onCancel }) => {
  const { t } = useTranslation();
  const { theme } = useThemeContext();

  const [avatar, setAvatar] = useState('🤖');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [argsString, setArgsString] = useState('');
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  // `advanced` mirrors the backend `CustomAgentAdvancedOverrides` schema
  // 1:1. The JSON panel below renders this object — never the basic form
  // fields — so new keys on the backend only need to be added here to
  // surface in the UI.
  const [advanced, setAdvanced] = useState<CustomAgentAdvancedOverrides>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState('');
  const isJsonEditingRef = useRef(false);
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testErrorDetail, setTestErrorDetail] = useState('');
  const runtimeScopeId = useMemo(() => agent?.id || uuid(), [agent?.id]);

  // Canonical empty shape shown when the user has not filled anything yet.
  // Keep keys in sync with CustomAgentAdvancedOverrides.
  const buildJsonFromAdvanced = useCallback((advancedVal: CustomAgentAdvancedOverrides) => {
    const skeleton: CustomAgentAdvancedOverrides = {
      yolo_id: advancedVal.yolo_id ?? '',
      native_skills_dirs: advancedVal.native_skills_dirs ?? [],
      behavior_policy: advancedVal.behavior_policy ?? { supports_side_question: false },
      description: advancedVal.description ?? '',
    };
    return JSON.stringify(skeleton, null, 2);
  }, []);

  useEffect(() => {
    if (!isJsonEditingRef.current) {
      setJsonInput(buildJsonFromAdvanced(advanced));
    }
  }, [advanced, buildJsonFromAdvanced]);

  useEffect(() => {
    setTestStatus('idle');
    setTestErrorDetail('');
    setJsonError('');
    isJsonEditingRef.current = false;
    if (agent) {
      setAvatar(agent.icon || '🤖');
      setName(agent.name || '');
      setCommand(agent.command || '');
      setArgsString(agent.args?.join(' ') || '');
      setEnvVars(objectToEnvVars(agentEnvToRecord(agent.env)));
      setAdvanced(agentToAdvanced(agent));
    } else {
      setAvatar('🤖');
      setName('');
      setCommand('');
      setArgsString('');
      setEnvVars([]);
      setAdvanced({});
    }
    setShowAdvanced(false);
  }, [agent]);

  const jsonEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleJsonChange = useCallback((value: string) => {
    isJsonEditingRef.current = true;
    if (jsonEditTimerRef.current) clearTimeout(jsonEditTimerRef.current);
    setJsonInput(value);
    try {
      const parsed: unknown = JSON.parse(value);
      setJsonError('');
      if (parsed && typeof parsed === 'object') {
        const next: CustomAgentAdvancedOverrides = {};
        const p = parsed as Record<string, unknown>;
        if (typeof p.yolo_id === 'string' && p.yolo_id.trim()) next.yolo_id = p.yolo_id;
        if (Array.isArray(p.native_skills_dirs)) {
          const dirs = p.native_skills_dirs.filter((x): x is string => typeof x === 'string');
          if (dirs.length > 0) next.native_skills_dirs = dirs;
        }
        if (p.behavior_policy && typeof p.behavior_policy === 'object') {
          const bp = p.behavior_policy as Record<string, unknown>;
          if (typeof bp.supports_side_question === 'boolean') {
            next.behavior_policy = { supports_side_question: bp.supports_side_question };
          }
        }
        if (typeof p.description === 'string' && p.description.trim()) next.description = p.description;
        setAdvanced(next);
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
    setTestErrorDetail('');
    try {
      const parsedArgs = parseArgsString(argsString);
      const envObj = envVarsToObject(envVars);
      const result = await acpConversation.testCustomAgent.invoke({
        command: command.trim(),
        acp_args: parsedArgs.length > 0 ? parsedArgs : undefined,
        env: Object.keys(envObj).length > 0 ? envObj : undefined,
        runtime_scope_id: runtimeScopeId,
      });
      switch (result.step) {
        case 'success':
          setTestStatus('success');
          setTestErrorDetail('');
          break;
        case 'fail_cli':
          setTestStatus('fail_cli');
          setTestErrorDetail(result.error || '');
          break;
        case 'fail_acp':
          setTestStatus('fail_acp');
          setTestErrorDetail(result.error || '');
          break;
      }
    } catch (error) {
      setTestStatus('fail_cli');
      setTestErrorDetail(error instanceof Error ? error.message : String(error));
    }
  }, [command, argsString, envVars, runtimeScopeId]);

  const handleSubmit = useCallback(() => {
    const parsedArgs = parseArgsString(argsString);
    const envObj = envVarsToObject(envVars);
    // Only forward `advanced` when at least one override is set — an
    // empty object would still round-trip through the backend as `{}`
    // and reset columns the user never touched.
    const hasAdvanced =
      Boolean(advanced.yolo_id) ||
      Boolean(advanced.description) ||
      (advanced.native_skills_dirs && advanced.native_skills_dirs.length > 0) ||
      Boolean(advanced.behavior_policy && Object.keys(advanced.behavior_policy).length > 0);
    const envEntries = Object.entries(envObj).map(([envName, value]) => ({ name: envName, value }));
    const draft: CustomAgentDraft = {
      id: agent?.id || uuid(),
      name: name.trim() || 'Custom Agent',
      icon: avatar,
      command: command.trim(),
      enabled: agent?.enabled !== false,
      args: parsedArgs.length > 0 ? parsedArgs : undefined,
      env: envEntries.length > 0 ? envEntries : undefined,
      advanced: hasAdvanced ? advanced : undefined,
    };
    onSave(draft);
  }, [agent, name, avatar, command, argsString, envVars, advanced, onSave]);

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
            placeholder={t('settings.agent_namePlaceholder')}
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
            content={
              <div className='flex flex-col gap-4px'>
                <span>{t('settings.testConnectionFailCli')}</span>
                {testErrorDetail ? <span className='text-12px break-all opacity-80'>{testErrorDetail}</span> : null}
              </div>
            }
          />
        )}
        {testStatus === 'fail_acp' && (
          <Alert
            className='mt-10px'
            type='warning'
            icon={<CloseOne theme='filled' size={16} />}
            content={
              <div className='flex flex-col gap-4px'>
                <span>{t('settings.testConnectionFailAcp')}</span>
                {testErrorDetail ? <span className='text-12px break-all opacity-80'>{testErrorDetail}</span> : null}
              </div>
            }
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
