# ACP → Agents Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the standalone ACP custom agent settings page into the Agent Settings "Local Agents" tab with a unified AgentCard component and inline editing.

**Architecture:** Create `AgentCard.tsx` (unified card for detected + custom agents) and `InlineAgentEditor.tsx` (inline form replacing modal). Refactor `LocalAgents.tsx` to render both agent types in sections. Delete `AcpSettings/`, `CustomAcpAgent.tsx`, `CustomAcpAgentModal.tsx` and all external references.

**Tech Stack:** React, Arco Design, UnoCSS, SWR, react-i18next, CodeMirror

---

## File Map

| Action | File                                                                | Responsibility                            |
| ------ | ------------------------------------------------------------------- | ----------------------------------------- |
| Create | `src/renderer/pages/settings/AgentSettings/AgentCard.tsx`           | Unified card for detected + custom agents |
| Create | `src/renderer/pages/settings/AgentSettings/InlineAgentEditor.tsx`   | Inline expandable edit form               |
| Modify | `src/renderer/pages/settings/AgentSettings/LocalAgents.tsx`         | Integrate both agent types with sections  |
| Modify | `src/renderer/components/layout/Router.tsx`                         | Remove `/settings/acp` route              |
| Modify | `src/renderer/pages/settings/components/SettingsSider.tsx`          | Remove `acp` from sidebar                 |
| Modify | `src/renderer/pages/settings/components/SettingsPageWrapper.tsx`    | Remove `acp` from nav items               |
| Modify | 6 locale files under `src/renderer/services/i18n/locales/`          | Add new keys, remove `acp` key            |
| Delete | `src/renderer/pages/settings/AcpSettings/index.tsx`                 | Entire directory                          |
| Delete | `src/renderer/pages/settings/AgentSettings/CustomAcpAgent.tsx`      | Migrated to LocalAgents                   |
| Delete | `src/renderer/pages/settings/AgentSettings/CustomAcpAgentModal.tsx` | Migrated to InlineAgentEditor             |

---

### Task 1: Add i18n keys for new sections

**Files:**

- Modify: `src/renderer/services/i18n/locales/en-US/settings.json`
- Modify: `src/renderer/services/i18n/locales/ja-JP/settings.json`
- Modify: `src/renderer/services/i18n/locales/ko-KR/settings.json`
- Modify: `src/renderer/services/i18n/locales/tr-TR/settings.json`
- Modify: `src/renderer/services/i18n/locales/zh-CN/settings.json`
- Modify: `src/renderer/services/i18n/locales/zh-TW/settings.json`

- [ ] **Step 1: Add new i18n keys to en-US**

In `src/renderer/services/i18n/locales/en-US/settings.json`, add after the existing `"agentManagement"` block's last entry (find the closing `}` of `agentManagement`):

```json
"detected": "Detected",
"custom": "Custom",
"addCustomAgent": "Add Custom Agent",
"customEmpty": "No custom agents configured. Click \"Add Custom Agent\" to create one."
```

These go inside the existing `"agentManagement": { ... }` object.

- [ ] **Step 2: Add translations for ja-JP**

```json
"detected": "検出済み",
"custom": "カスタム",
"addCustomAgent": "カスタムエージェントを追加",
"customEmpty": "カスタムエージェントが設定されていません。「カスタムエージェントを追加」をクリックして作成してください。"
```

- [ ] **Step 3: Add translations for ko-KR**

```json
"detected": "감지됨",
"custom": "사용자 정의",
"addCustomAgent": "사용자 정의 에이전트 추가",
"customEmpty": "구성된 사용자 정의 에이전트가 없습니다. \"사용자 정의 에이전트 추가\"를 클릭하여 생성하세요."
```

- [ ] **Step 4: Add translations for tr-TR**

```json
"detected": "Algılanan",
"custom": "Özel",
"addCustomAgent": "Özel Ajan Ekle",
"customEmpty": "Yapılandırılmış özel ajan yok. Oluşturmak için \"Özel Ajan Ekle\"ye tıklayın."
```

- [ ] **Step 5: Add translations for zh-CN**

```json
"detected": "已检测",
"custom": "自定义",
"addCustomAgent": "添加自定义 Agent",
"customEmpty": "暂无自定义 Agent，点击「添加自定义 Agent」创建。"
```

- [ ] **Step 6: Add translations for zh-TW**

```json
"detected": "已偵測",
"custom": "自訂",
"addCustomAgent": "新增自訂 Agent",
"customEmpty": "尚無自訂 Agent，點擊「新增自訂 Agent」建立。"
```

- [ ] **Step 7: Verify JSON validity**

Run: `python3 -c "import json, glob; [json.load(open(f)) for f in glob.glob('src/renderer/services/i18n/locales/*/settings.json')]; print('All OK')"`
Expected: `All OK`

- [ ] **Step 8: Commit**

```bash
git add src/renderer/services/i18n/locales/*/settings.json
git commit -m "feat(i18n): add agent section i18n keys for all 6 locales"
```

---

### Task 2: Create AgentCard component

**Files:**

- Create: `src/renderer/pages/settings/AgentSettings/AgentCard.tsx`

- [ ] **Step 1: Create AgentCard component**

Create `src/renderer/pages/settings/AgentSettings/AgentCard.tsx`:

```tsx
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Avatar, Button, Switch, Tooltip, Typography } from '@arco-design/web-react';
import { Setting, EditTwo, Delete, Robot } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import type { AcpBackendConfig } from '@/common/types/acpTypes';

type DetectedAgent = {
  backend: string;
  name: string;
};

type AgentCardProps =
  | {
      type: 'detected';
      agent: DetectedAgent;
      onSettings?: () => void;
      settingsDisabled?: boolean;
    }
  | {
      type: 'custom';
      agent: AcpBackendConfig;
      onEdit: () => void;
      onDelete: () => void;
      onToggle: (enabled: boolean) => void;
    };

const AgentCard: React.FC<AgentCardProps> = (props) => {
  const { t } = useTranslation();

  if (props.type === 'detected') {
    const { agent, onSettings, settingsDisabled = true } = props;
    const logo = getAgentLogo(agent.backend);

    return (
      <div className='flex items-center justify-between px-16px py-10px rd-8px bg-aou-1 hover:bg-aou-2'>
        <div className='flex items-center gap-12px min-w-0 flex-1'>
          <Avatar size={32} shape='square' style={{ flexShrink: 0, backgroundColor: 'transparent' }}>
            {logo ? <img src={logo} alt={agent.name} className='w-full h-full object-contain' /> : '🤖'}
          </Avatar>
          <Typography.Text className='font-medium text-14px'>{agent.name}</Typography.Text>
        </div>
        {settingsDisabled ? (
          <Tooltip content={t('settings.agentManagement.settingsDisabledHint')}>
            <Button
              size='small'
              type='text'
              icon={<Setting theme='outline' size='14' />}
              disabled
              style={{ color: 'var(--color-text-4)' }}
            />
          </Tooltip>
        ) : (
          <Button size='small' type='text' icon={<Setting theme='outline' size='14' />} onClick={onSettings} />
        )}
      </div>
    );
  }

  const { agent, onEdit, onDelete, onToggle } = props;

  return (
    <div className='flex items-center justify-between px-16px py-10px rd-8px bg-aou-1 hover:bg-aou-2'>
      <div className='flex items-center gap-12px min-w-0 flex-1'>
        <Avatar size={32} shape='square' style={{ flexShrink: 0, backgroundColor: 'transparent' }}>
          <Robot theme='outline' size='20' />
        </Avatar>
        <div className='min-w-0 flex-1'>
          <Typography.Text className='font-medium text-14px'>{agent.name || 'Custom Agent'}</Typography.Text>
          <div className='text-12px text-t-secondary truncate'>
            {agent.defaultCliPath}
            {agent.acpArgs && agent.acpArgs.length > 0 ? ` ${agent.acpArgs.join(' ')}` : ''}
          </div>
        </div>
      </div>
      <div className='flex items-center gap-8px'>
        <Switch size='small' checked={agent.enabled !== false} onChange={onToggle} />
        <Button size='small' type='text' icon={<EditTwo theme='outline' size='14' />} onClick={onEdit} />
        <Button
          size='small'
          type='text'
          status='danger'
          icon={<Delete theme='outline' size='14' />}
          onClick={onDelete}
        />
      </div>
    </div>
  );
};

export default AgentCard;
```

- [ ] **Step 2: Verify no type errors**

Run: `bunx tsc --noEmit 2>&1 | grep -i 'AgentCard' || echo "No errors for AgentCard"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/settings/AgentSettings/AgentCard.tsx
git commit -m "feat(settings): create unified AgentCard component"
```

---

### Task 3: Create InlineAgentEditor component

**Files:**

- Create: `src/renderer/pages/settings/AgentSettings/InlineAgentEditor.tsx`

- [ ] **Step 1: Create InlineAgentEditor**

Create `src/renderer/pages/settings/AgentSettings/InlineAgentEditor.tsx`. This migrates form logic from `CustomAcpAgentModal.tsx`, removing the modal wrapper and adding inline expand/collapse.

```tsx
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackendConfig } from '@/common/types/acpTypes';
import { acpConversation } from '@/common/adapter/ipcBridge';
import { Alert, Button, Collapse, Input, Space } from '@arco-design/web-react';
import { Plus, Delete, CheckOne, CloseOne } from '@icon-park/react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import { uuid } from '@/common/utils';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

type TestStatus = 'idle' | 'testing' | 'success' | 'fail_cli' | 'fail_acp';

interface EnvVar {
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

function envVarsToObject(vars: EnvVar[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const v of vars) {
    const key = v.key.trim();
    if (key) obj[key] = v.value;
  }
  return obj;
}

function objectToEnvVars(obj: Record<string, string> | undefined): EnvVar[] {
  if (!obj || Object.keys(obj).length === 0) return [];
  return Object.entries(obj).map(([key, value]) => ({ id: uuid(), key, value }));
}

const InlineAgentEditor: React.FC<InlineAgentEditorProps> = ({ agent, onSave, onCancel }) => {
  const { t } = useTranslation();
  const { theme } = useThemeContext();

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
      setName(agent.name || '');
      setCommand(agent.defaultCliPath || '');
      setArgsString(agent.acpArgs?.join(' ') || '');
      setEnvVars(objectToEnvVars(agent.env));
    } else {
      setName('');
      setCommand('');
      setArgsString('');
      setEnvVars([]);
    }
    setShowAdvanced(false);
  }, [agent]);

  const handleJsonChange = useCallback((value: string) => {
    isJsonEditingRef.current = true;
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
    setTimeout(() => {
      isJsonEditingRef.current = false;
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
      defaultCliPath: command.trim(),
      enabled: agent?.enabled !== false,
      acpArgs: parsedArgs.length > 0 ? parsedArgs : undefined,
      env: Object.keys(envObj).length > 0 ? envObj : undefined,
    };
    onSave(customAgent);
  }, [agent, name, command, argsString, envVars, onSave]);

  const isSubmitDisabled = !name.trim() || !command.trim();
  const isTestDisabled = !command.trim() || testStatus === 'testing';

  return (
    <div className='px-16px py-12px mx-16px rd-8px bg-fill-2 space-y-12px'>
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
              basicSetup={{ lineNumbers: true, foldGutter: true, dropCursor: false, allowMultipleSelections: false }}
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

      {/* Actions */}
      <div className='flex justify-end gap-8px pt-4px'>
        <Button size='small' onClick={onCancel}>
          {t('common.cancel') || 'Cancel'}
        </Button>
        <Button size='small' type='primary' disabled={isSubmitDisabled} onClick={handleSubmit}>
          {t('common.save') || 'Save'}
        </Button>
      </div>
    </div>
  );
};

export default InlineAgentEditor;
```

- [ ] **Step 2: Verify no type errors**

Run: `bunx tsc --noEmit 2>&1 | grep -i 'InlineAgentEditor' || echo "No errors for InlineAgentEditor"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/settings/AgentSettings/InlineAgentEditor.tsx
git commit -m "feat(settings): create InlineAgentEditor component"
```

---

### Task 4: Refactor LocalAgents to integrate both agent types

**Files:**

- Modify: `src/renderer/pages/settings/AgentSettings/LocalAgents.tsx`

- [ ] **Step 1: Rewrite LocalAgents.tsx**

Replace the entire contents of `src/renderer/pages/settings/AgentSettings/LocalAgents.tsx` with:

```tsx
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ipcBridge } from '@/common';
import { Button, Link, Modal, Typography, Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus } from '@icon-park/react';
import useSWR, { mutate } from 'swr';
import { ConfigStorage } from '@/common/config/storage';
import { acpConversation } from '@/common/adapter/ipcBridge';
import type { AcpBackendConfig } from '@/common/types/acpTypes';
import AgentCard from './AgentCard';
import InlineAgentEditor from './InlineAgentEditor';

const LocalAgents: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [message, messageContext] = Message.useMessage({ maxCount: 10 });

  // Detected agents (filter out custom and remote)
  const { data: detectedAgents } = useSWR('acp.agents.available.settings', async () => {
    const result = await ipcBridge.acpConversation.getAvailableAgents.invoke();
    if (result.success) {
      return result.data.filter((agent) => agent.backend !== 'custom' && agent.backend !== 'remote');
    }
    return [];
  });

  // Custom agents
  const [customAgents, setCustomAgents] = useState<AcpBackendConfig[]>([]);
  const [editingAgentId, setEditingAgentId] = useState<string | 'new' | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<AcpBackendConfig | null>(null);

  const refreshAgentDetection = useCallback(async () => {
    try {
      await acpConversation.refreshCustomAgents.invoke();
      await mutate('acp.agents.available');
      await mutate('acp.agents.available.settings');
    } catch {
      // Refresh failed — UI will update on next page load
    }
  }, []);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const agents = await ConfigStorage.get('acp.customAgents');
        if (agents && Array.isArray(agents) && agents.length > 0) {
          setCustomAgents(agents.filter((a) => !a.isPreset));
          return;
        }
        // Migrate legacy single-agent format
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const legacyAgent = await (ConfigStorage as any).get('acp.customAgent');
        if (legacyAgent && typeof legacyAgent === 'object' && legacyAgent.defaultCliPath) {
          const migratedAgent: AcpBackendConfig = {
            ...legacyAgent,
            id: legacyAgent.id && legacyAgent.id !== 'custom' ? legacyAgent.id : `migrated-${Date.now()}`,
          };
          const migratedAgents = [migratedAgent];
          await ConfigStorage.set('acp.customAgents', migratedAgents);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (ConfigStorage as any).remove('acp.customAgent');
          setCustomAgents(migratedAgents);
          await refreshAgentDetection();
        }
      } catch (error) {
        console.error('Failed to load custom agents config:', error);
      }
    };
    void loadConfig();
  }, [refreshAgentDetection]);

  const handleSaveAgent = useCallback(
    async (agentData: AcpBackendConfig) => {
      try {
        let updatedAgents: AcpBackendConfig[];
        if (editingAgentId && editingAgentId !== 'new') {
          updatedAgents = customAgents.map((agent) => (agent.id === editingAgentId ? agentData : agent));
        } else {
          updatedAgents = [...customAgents, agentData];
        }
        await ConfigStorage.set('acp.customAgents', updatedAgents);
        setCustomAgents(updatedAgents);
        setEditingAgentId(null);
        message.success(t('settings.customAcpAgentSaved') || 'Custom agent saved');
        await refreshAgentDetection();
      } catch (error) {
        console.error('Failed to save custom agent config:', error);
        message.error(t('settings.customAcpAgentSaveFailed') || 'Failed to save custom agent');
      }
    },
    [customAgents, editingAgentId, message, t, refreshAgentDetection]
  );

  const handleDeleteAgent = useCallback(async () => {
    if (!agentToDelete) return;
    try {
      const updatedAgents = customAgents.filter((agent) => agent.id !== agentToDelete.id);
      await ConfigStorage.set('acp.customAgents', updatedAgents);
      setCustomAgents(updatedAgents);
      setDeleteConfirmVisible(false);
      setAgentToDelete(null);
      if (editingAgentId === agentToDelete.id) setEditingAgentId(null);
      message.success(t('settings.customAcpAgentDeleted') || 'Custom agent deleted');
      await refreshAgentDetection();
    } catch (error) {
      console.error('Failed to delete custom agent config:', error);
      message.error(t('settings.customAcpAgentDeleteFailed') || 'Failed to delete custom agent');
    }
  }, [agentToDelete, customAgents, editingAgentId, message, t, refreshAgentDetection]);

  const handleToggleAgent = useCallback(
    async (agent: AcpBackendConfig, enabled: boolean) => {
      try {
        const updatedAgents = customAgents.map((a) => (a.id === agent.id ? { ...a, enabled } : a));
        await ConfigStorage.set('acp.customAgents', updatedAgents);
        setCustomAgents(updatedAgents);
        await refreshAgentDetection();
      } catch (error) {
        console.error('Failed to toggle custom agent:', error);
      }
    },
    [customAgents, refreshAgentDetection]
  );

  // Gemini CLI first among detected agents
  const geminiAgent = detectedAgents?.find((a) => a.backend === 'gemini');
  const otherDetected = detectedAgents?.filter((a) => a.backend !== 'gemini') ?? [];

  return (
    <div className='flex flex-col gap-8px py-16px'>
      {messageContext}

      {/* Top action bar */}
      <div className='flex items-center justify-between px-16px'>
        <span className='text-12px text-t-secondary'>
          {t('settings.agentManagement.localAgentsDescription')}
          {'  '}
          <Link href='https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup' target='_blank' className='text-12px'>
            {t('settings.agentManagement.localAgentsSetupLink')}
          </Link>
        </span>
        <Button
          type='outline'
          size='small'
          icon={<Plus theme='outline' size='14' />}
          onClick={() => setEditingAgentId('new')}
        >
          {t('settings.agentManagement.addCustomAgent')}
        </Button>
      </div>

      {/* Detected Agents section */}
      <div className='px-16px mt-8px'>
        <Typography.Text className='text-12px font-medium text-t-secondary mb-4px block'>
          {t('settings.agentManagement.detected')}
        </Typography.Text>
      </div>
      <div className='flex flex-col gap-4px px-0'>
        {geminiAgent && (
          <AgentCard
            type='detected'
            agent={geminiAgent}
            settingsDisabled={false}
            onSettings={() => navigate('/settings/gemini')}
          />
        )}
        {otherDetected.map((agent) => (
          <AgentCard key={agent.backend} type='detected' agent={agent} />
        ))}
        {(!detectedAgents || detectedAgents.length === 0) && (
          <Typography.Text type='secondary' className='block py-16px text-center text-12px'>
            {t('settings.agentManagement.localAgentsEmpty')}
          </Typography.Text>
        )}
      </div>

      {/* Custom Agents section */}
      <div className='px-16px mt-12px'>
        <Typography.Text className='text-12px font-medium text-t-secondary mb-4px block'>
          {t('settings.agentManagement.custom')}
        </Typography.Text>
      </div>

      {/* New agent editor */}
      {editingAgentId === 'new' && (
        <InlineAgentEditor onSave={handleSaveAgent} onCancel={() => setEditingAgentId(null)} />
      )}

      <div className='flex flex-col gap-4px'>
        {customAgents.map((agent) => (
          <React.Fragment key={agent.id}>
            <AgentCard
              type='custom'
              agent={agent}
              onEdit={() => setEditingAgentId(editingAgentId === agent.id ? null : agent.id)}
              onDelete={() => {
                setAgentToDelete(agent);
                setDeleteConfirmVisible(true);
              }}
              onToggle={(enabled) => handleToggleAgent(agent, enabled)}
            />
            {editingAgentId === agent.id && (
              <InlineAgentEditor agent={agent} onSave={handleSaveAgent} onCancel={() => setEditingAgentId(null)} />
            )}
          </React.Fragment>
        ))}
        {customAgents.length === 0 && editingAgentId !== 'new' && (
          <Typography.Text type='secondary' className='block py-16px text-center text-12px'>
            {t('settings.agentManagement.customEmpty')}
          </Typography.Text>
        )}
      </div>

      {/* Delete confirmation modal */}
      <Modal
        title={t('settings.deleteCustomAgent') || 'Delete Custom Agent'}
        visible={deleteConfirmVisible}
        onCancel={() => setDeleteConfirmVisible(false)}
        onOk={handleDeleteAgent}
        okButtonProps={{ status: 'danger' }}
        okText={t('common.confirm') || 'Confirm'}
        cancelText={t('common.cancel') || 'Cancel'}
      >
        <p>
          {t('settings.deleteCustomAgentConfirm') || 'Are you sure you want to delete this custom agent?'}
          {agentToDelete && <strong className='block mt-2'>{agentToDelete.name}</strong>}
        </p>
      </Modal>
    </div>
  );
};

export default LocalAgents;
```

- [ ] **Step 2: Verify no type errors**

Run: `bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/settings/AgentSettings/LocalAgents.tsx
git commit -m "feat(settings): integrate custom agents into LocalAgents tab"
```

---

### Task 5: Remove ACP route, sidebar entry, and deleted files

**Files:**

- Modify: `src/renderer/components/layout/Router.tsx`
- Modify: `src/renderer/pages/settings/components/SettingsSider.tsx`
- Modify: `src/renderer/pages/settings/components/SettingsPageWrapper.tsx`
- Modify: 6 locale files (remove `"acp"` key)
- Delete: `src/renderer/pages/settings/AcpSettings/index.tsx`
- Delete: `src/renderer/pages/settings/AgentSettings/CustomAcpAgent.tsx`
- Delete: `src/renderer/pages/settings/AgentSettings/CustomAcpAgentModal.tsx`

- [ ] **Step 1: Remove ACP route and lazy import from Router.tsx**

In `src/renderer/components/layout/Router.tsx`:

- Remove line 10: `const AcpSettings = React.lazy(() => import('@renderer/pages/settings/AcpSettings'));`
- Remove line 60: `<Route path='/settings/acp' element={withRouteFallback(AcpSettings)} />`

- [ ] **Step 2: Remove `acp` from SettingsSider.tsx**

In `src/renderer/pages/settings/components/SettingsSider.tsx`:

- Remove `'acp',` from `BUILTIN_TAB_IDS` array (line 32)
- Remove the entire `acp: { ... }` entry from `builtinMap` (lines 139-144)

- [ ] **Step 3: Remove `acp` from SettingsPageWrapper.tsx**

In `src/renderer/pages/settings/components/SettingsPageWrapper.tsx`:

- Remove the entire `acp: { ... }` entry from `getBuiltinSettingsNavItems` builtinMap (lines 57-62)

- [ ] **Step 4: Remove `"acp"` key from all 6 locale files**

In each of the 6 `settings.json` locale files, remove the line `"acp": "Agents",` (line 57 in each).

- [ ] **Step 5: Delete obsolete files**

```bash
rm src/renderer/pages/settings/AcpSettings/index.tsx
rmdir src/renderer/pages/settings/AcpSettings
rm src/renderer/pages/settings/AgentSettings/CustomAcpAgent.tsx
rm src/renderer/pages/settings/AgentSettings/CustomAcpAgentModal.tsx
```

- [ ] **Step 6: Verify no type errors and no dangling imports**

Run: `bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors

Run: `grep -rn 'AcpSettings\|CustomAcpAgent\|CustomAcpAgentModal' src/renderer/ --include='*.tsx' --include='*.ts' | grep -v 'node_modules'`
Expected: No results (all references removed)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(settings): remove ACP sidebar entry, route, and obsolete components"
```

---

### Task 6: Lint, format, and verify

**Files:** All modified files from previous tasks

- [ ] **Step 1: Run linter and formatter**

```bash
bun run lint:fix
bun run format
```

- [ ] **Step 2: Type check**

Run: `bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run tests**

Run: `bun run test`
Expected: All tests pass

- [ ] **Step 4: Run prek CI check**

Run: `prek run --from-ref origin/main --to-ref HEAD`
Expected: All checks pass

- [ ] **Step 5: Fix any issues and commit**

If lint/format produced changes:

```bash
git add -A
git commit -m "style(settings): fix lint and formatting issues"
```

---

### Task 7: Manual smoke test

- [ ] **Step 1: Start the app**

Run: `bun start`
Expected: App starts without build errors

- [ ] **Step 2: Verify Agent Settings page**

Navigate to Settings → Agents. Verify:

- Local Agents tab shows "Add Custom Agent" button at top
- "Detected" section shows auto-detected agents (Gemini, etc.)
- "Custom" section shows custom agents (or empty state message)
- Clicking "Add Custom Agent" opens inline editor at top of Custom section
- Adding a custom agent works (form → Save → appears in list)
- Editing a custom agent works (click Edit → inline editor opens below card)
- Deleting a custom agent shows confirmation modal
- Enable/disable toggle works on custom agent cards
- Test Connection button works in the inline editor

- [ ] **Step 3: Verify ACP sidebar entry is removed**

Confirm "ACP" / "Agents" duplicate sidebar entry no longer appears in Settings.

- [ ] **Step 4: Verify `/settings/acp` route is gone**

Navigate directly to `#/settings/acp` — should redirect to default settings page, not crash.
