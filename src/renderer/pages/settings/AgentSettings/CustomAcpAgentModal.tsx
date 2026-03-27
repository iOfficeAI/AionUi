/**
 * Custom ACP Agent Configuration Modal
 *
 * Structured form with Display Name, Command, Arguments, Environment Variables,
 * Test Connection, and collapsible Advanced JSON editor with bidirectional sync.
 */
import type { AcpBackendConfig } from '@/common/types/acpTypes';
import { acpConversation } from '@/common/adapter/ipcBridge';
import { Alert, Button, Collapse, Input, Space } from '@arco-design/web-react';
import { Plus, Delete, CheckOne, CloseOne } from '@icon-park/react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import AionModal from '@/renderer/components/base/AionModal';
import { uuid } from '@/common/utils';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface CustomAcpAgentModalProps {
  visible: boolean;
  agent?: AcpBackendConfig | null;
  onCancel: () => void;
  onSubmit: (agent: AcpBackendConfig) => void;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'fail_cli' | 'fail_acp';

interface EnvVar {
  id: string;
  key: string;
  value: string;
}

/**
 * Parse a space-separated argument string into an array.
 * Respects quoted segments so that `--flag "value with spaces"` produces
 * `['--flag', 'value with spaces']`.
 */
function parseArgsString(input: string): string[] {
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

/** Convert an EnvVar array to a plain object, skipping empty keys. */
function envVarsToObject(vars: EnvVar[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const v of vars) {
    const key = v.key.trim();
    if (key) obj[key] = v.value;
  }
  return obj;
}

/** Convert a plain env object to an EnvVar array. */
function objectToEnvVars(obj: Record<string, string> | undefined): EnvVar[] {
  if (!obj || Object.keys(obj).length === 0) return [];
  return Object.entries(obj).map(([key, value]) => ({ id: uuid(), key, value }));
}

const CustomAcpAgentModal: React.FC<CustomAcpAgentModalProps> = ({ visible, agent, onCancel, onSubmit }) => {
  const { t } = useTranslation();
  const { theme } = useThemeContext();

  // Form state
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [argsString, setArgsString] = useState('');
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);

  // Advanced JSON editor
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState('');
  const isJsonEditingRef = useRef(false);

  // Test connection
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');

  // Build the JSON string from current form fields
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

  // Sync form -> JSON (unless user is actively editing JSON)
  useEffect(() => {
    if (!isJsonEditingRef.current) {
      setJsonInput(buildJsonFromForm());
    }
  }, [buildJsonFromForm]);

  // Initialize state when modal opens
  useEffect(() => {
    if (visible) {
      setTestStatus('idle');
      setJsonError('');
      isJsonEditingRef.current = false;

      if (agent) {
        // Edit mode: pre-populate from existing agent config
        setName(agent.name || '');
        setCommand(agent.defaultCliPath || '');
        setArgsString(agent.acpArgs?.join(' ') || '');
        setEnvVars(objectToEnvVars(agent.env));
        setShowAdvanced(false);
      } else {
        // Add mode: blank form
        setName('');
        setCommand('');
        setArgsString('');
        setEnvVars([]);
        setShowAdvanced(false);
      }
    }
  }, [visible, agent]);

  // Handle JSON editor change — sync JSON -> form
  const handleJsonChange = useCallback((value: string) => {
    isJsonEditingRef.current = true;
    setJsonInput(value);

    try {
      const parsed = JSON.parse(value);
      setJsonError('');

      // Sync parsed values back into form fields
      if (typeof parsed.name === 'string') setName(parsed.name);
      if (typeof parsed.defaultCliPath === 'string') setCommand(parsed.defaultCliPath);
      if (Array.isArray(parsed.acpArgs)) setArgsString(parsed.acpArgs.join(' '));
      if (parsed.env && typeof parsed.env === 'object') {
        setEnvVars(objectToEnvVars(parsed.env as Record<string, string>));
      }
    } catch {
      setJsonError('Invalid JSON');
    }

    // Reset the editing flag after a short delay so form -> JSON sync can resume
    setTimeout(() => {
      isJsonEditingRef.current = false;
    }, 500);
  }, []);

  // Form field change handlers (always clear json editing flag)
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

  // Env var helpers
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

  // Test connection handler
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

  // Submit handler
  const handleSubmit = useCallback(() => {
    const parsedArgs = parseArgsString(argsString);
    const envObj = envVarsToObject(envVars);

    const customAgent: AcpBackendConfig = {
      id: agent?.id || uuid(),
      name: name.trim() || 'Custom Agent',
      defaultCliPath: command.trim(),
      enabled: true,
      acpArgs: parsedArgs.length > 0 ? parsedArgs : undefined,
      env: Object.keys(envObj).length > 0 ? envObj : undefined,
    };
    onSubmit(customAgent);
  }, [agent, name, command, argsString, envVars, onSubmit]);

  const isSubmitDisabled = !name.trim() || !command.trim();
  const isTestDisabled = !command.trim() || testStatus === 'testing';

  if (!visible) return null;

  return (
    <AionModal
      visible={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      okButtonProps={{ disabled: isSubmitDisabled }}
      header={{
        title: agent ? t('settings.editCustomAgent') : t('settings.addCustomAgentTitle'),
        showClose: true,
      }}
      style={{ width: 520, height: 'auto', maxHeight: '80vh' }}
      contentStyle={{ borderRadius: 16, padding: '20px', background: 'var(--bg-1)', overflow: 'auto' }}
    >
      <div className='space-y-16px'>
        {/* Display Name */}
        <div>
          <div className='mb-4px text-sm font-medium text-t-primary'>{t('settings.agentDisplayName')}</div>
          <Input value={name} onChange={handleNameChange} placeholder={t('settings.agentNamePlaceholder')} />
        </div>

        {/* Command */}
        <div>
          <div className='mb-4px text-sm font-medium text-t-primary'>{t('settings.commandLabel')}</div>
          <Input value={command} onChange={handleCommandChange} placeholder={t('settings.commandPlaceholder')} />
          <div className='mt-4px text-xs text-t-tertiary'>{t('settings.commandHelp')}</div>
        </div>

        {/* Arguments */}
        <div>
          <div className='mb-4px text-sm font-medium text-t-primary'>{t('settings.argsLabel')}</div>
          <Input value={argsString} onChange={handleArgsChange} placeholder={t('settings.argsPlaceholder')} />
          <div className='mt-4px text-xs text-t-tertiary'>{t('settings.argsHelp')}</div>
        </div>

        {/* Environment Variables */}
        <div>
          <div className='mb-4px text-sm font-medium text-t-primary'>{t('settings.envLabel')}</div>
          <div className='space-y-8px'>
            {envVars.map((envVar) => (
              <div key={envVar.id} className='flex items-center gap-8px'>
                <Input
                  className='flex-1'
                  value={envVar.key}
                  onChange={(v) => updateEnvVar(envVar.id, 'key', v)}
                  placeholder={t('settings.envKeyPlaceholder')}
                />
                <Input
                  className='flex-[2]'
                  value={envVar.value}
                  onChange={(v) => updateEnvVar(envVar.id, 'value', v)}
                  placeholder={t('settings.envValuePlaceholder')}
                />
                <Button
                  type='text'
                  icon={<Delete theme='outline' size={16} />}
                  onClick={() => removeEnvVar(envVar.id)}
                  className='flex-shrink-0 text-t-tertiary hover:text-danger'
                />
              </div>
            ))}
          </div>
          <Button
            type='text'
            size='small'
            icon={<Plus theme='outline' size={14} />}
            onClick={addEnvVar}
            className='mt-8px text-t-secondary'
          >
            {t('settings.addEnvVar')}
          </Button>
        </div>

        {/* Test Connection */}
        <div>
          <Space>
            <Button
              type='outline'
              size='small'
              disabled={isTestDisabled}
              onClick={handleTestConnection}
              loading={testStatus === 'testing'}
            >
              {testStatus === 'testing' ? t('settings.testConnectionTesting') : t('settings.testConnectionBtn')}
            </Button>
          </Space>

          {testStatus === 'success' && (
            <Alert
              className='mt-8px'
              type='success'
              icon={<CheckOne theme='filled' size={16} />}
              content={t('settings.testConnectionSuccess')}
            />
          )}
          {testStatus === 'fail_cli' && (
            <Alert
              className='mt-8px'
              type='error'
              icon={<CloseOne theme='filled' size={16} />}
              content={t('settings.testConnectionFailCli')}
            />
          )}
          {testStatus === 'fail_acp' && (
            <Alert
              className='mt-8px'
              type='warning'
              icon={<CloseOne theme='filled' size={16} />}
              content={t('settings.testConnectionFailAcp')}
            />
          )}
        </div>

        {/* Advanced JSON Editor */}
        <Collapse
          activeKey={showAdvanced ? ['advanced'] : []}
          onChange={(_key, keys) => setShowAdvanced(keys.includes('advanced'))}
          bordered={false}
          style={{ background: 'transparent' }}
        >
          <Collapse.Item
            name='advanced'
            header={<span className='text-sm text-t-secondary'>{t('settings.advancedMode')}</span>}
          >
            <div className='pt-8px'>
              <CodeMirror
                value={jsonInput}
                height='200px'
                theme={theme}
                extensions={[json()]}
                onChange={handleJsonChange}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  dropCursor: false,
                  allowMultipleSelections: false,
                }}
                style={{
                  fontSize: '12px',
                  border: jsonError ? '1px solid var(--danger)' : '1px solid var(--color-border-2)',
                  borderRadius: '6px',
                  overflow: 'hidden',
                }}
                className='[&_.cm-editor]:rounded-[6px]'
              />
              {jsonError && <div className='mt-4px text-xs text-danger'>{jsonError}</div>}
            </div>
          </Collapse.Item>
        </Collapse>
      </div>
    </AionModal>
  );
};

export default CustomAcpAgentModal;
