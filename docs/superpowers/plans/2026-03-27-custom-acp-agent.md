# Custom ACP Agent Configuration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to add any ACP-compatible CLI agent via a structured form in Settings, with connection testing, so the agent appears in the home-page selector and supports full conversation.

**Architecture:** Redesign the existing (orphaned) `CustomAcpAgentModal` from a CLI-card-selector approach to a Zed-style declarative form (command + args + env). Add a new IPC channel `acp.test-custom-agent` for two-step connection testing (CLI existence + ACP initialize). Mount the `CustomAcpAgent` list component into `AgentModalContent` so it's actually visible in Settings.

**Tech Stack:** React, TypeScript, Arco Design, CodeMirror, Electron IPC (via `@office-ai/platform` bridge), Vitest 4, i18n (6 locales)

**Spec:** `.omc/specs/deep-interview-custom-acp-agent.md`
**Issue:** https://github.com/iOfficeAI/AionUi/issues/1729

---

## File Structure

| File                                                                            | Responsibility                                      | Action                                   |
| ------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------- |
| `src/renderer/pages/settings/AgentSettings/CustomAcpAgentModal.tsx`             | Add/edit modal with structured form + advanced JSON | **Rewrite**                              |
| `src/renderer/pages/settings/AgentSettings/CustomAcpAgent.tsx`                  | List of custom agents with add/edit/delete          | **Minor edit** (add `command` display)   |
| `src/renderer/components/settings/SettingsModal/contents/AgentModalContent.tsx` | Agent settings tab container                        | **Edit** (mount CustomAcpAgent)          |
| `src/common/adapter/ipcBridge.ts`                                               | IPC bridge definitions                              | **Edit** (add `testCustomAgent` channel) |
| `src/process/bridge/acpConversationBridge.ts`                                   | IPC handlers for ACP operations                     | **Edit** (add test handler)              |
| `src/renderer/services/i18n/locales/en-US/settings.json`                        | English i18n strings                                | **Edit** (add new keys)                  |
| `src/renderer/services/i18n/locales/zh-CN/settings.json`                        | Chinese i18n strings                                | **Edit** (add new keys)                  |
| `src/renderer/services/i18n/locales/ja-JP/settings.json`                        | Japanese i18n strings                               | **Edit** (add new keys)                  |
| `src/renderer/services/i18n/locales/zh-TW/settings.json`                        | Traditional Chinese i18n strings                    | **Edit** (add new keys)                  |
| `src/renderer/services/i18n/locales/ko-KR/settings.json`                        | Korean i18n strings                                 | **Edit** (add new keys)                  |
| `src/renderer/services/i18n/locales/tr-TR/settings.json`                        | Turkish i18n strings                                | **Edit** (add new keys)                  |
| `tests/unit/customAcpAgentModal.dom.test.tsx`                                   | Modal form tests                                    | **Create**                               |
| `tests/unit/customAcpAgentBridge.test.ts`                                       | Connection test IPC handler tests                   | **Create**                               |

---

### Task 1: Add IPC Channel for Connection Testing

**Files:**

- Modify: `src/common/adapter/ipcBridge.ts:392` (after `refreshCustomAgents`)
- Modify: `src/process/bridge/acpConversationBridge.ts:76` (after `refreshCustomAgents` handler)
- Test: `tests/unit/customAcpAgentBridge.test.ts`

- [ ] **Step 1: Write the failing test for testCustomAgent IPC handler**

```typescript
// tests/unit/customAcpAgentBridge.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('@process/agent/acp/AcpConnection', () => ({
  AcpConnection: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

vi.mock('@process/agent/acp/acpConnectors', () => ({
  spawnGenericBackend: vi.fn(),
}));

import { execFileSync } from 'child_process';
import { testCustomAgentConnection } from '@process/bridge/testCustomAgentConnection';

describe('testCustomAgentConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cliNotFound when command does not exist', async () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('not found');
    });

    const result = await testCustomAgentConnection({
      command: 'nonexistent-agent',
      acpArgs: ['--acp'],
    });

    expect(result.success).toBe(false);
    expect(result.data?.step).toBe('cli_check');
  });

  it('returns success when CLI exists and ACP initialize succeeds', async () => {
    vi.mocked(execFileSync).mockReturnValue(Buffer.from('/usr/local/bin/my-agent'));

    const mockConnect = vi.fn().mockResolvedValue(undefined);
    const mockDisconnect = vi.fn().mockResolvedValue(undefined);
    const { AcpConnection } = await import('@process/agent/acp/AcpConnection');
    vi.mocked(AcpConnection).mockImplementation(
      () =>
        ({
          connect: mockConnect,
          disconnect: mockDisconnect,
        }) as any
    );

    const result = await testCustomAgentConnection({
      command: 'my-agent',
      acpArgs: ['--acp'],
    });

    expect(result.success).toBe(true);
    expect(result.data?.step).toBe('acp_initialize');
  });

  it('returns acpFailed when CLI exists but ACP initialize fails', async () => {
    vi.mocked(execFileSync).mockReturnValue(Buffer.from('/usr/local/bin/my-agent'));

    const mockConnect = vi.fn().mockRejectedValue(new Error('ACP handshake timeout'));
    const mockDisconnect = vi.fn().mockResolvedValue(undefined);
    const { AcpConnection } = await import('@process/agent/acp/AcpConnection');
    vi.mocked(AcpConnection).mockImplementation(
      () =>
        ({
          connect: mockConnect,
          disconnect: mockDisconnect,
        }) as any
    );

    const result = await testCustomAgentConnection({
      command: 'my-agent',
      acpArgs: ['--acp'],
    });

    expect(result.success).toBe(false);
    expect(result.data?.step).toBe('acp_initialize');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- --run tests/unit/customAcpAgentBridge.test.ts`
Expected: FAIL — `testCustomAgentConnection` module does not exist.

- [ ] **Step 3: Add the IPC channel definition to ipcBridge.ts**

In `src/common/adapter/ipcBridge.ts`, add after line 392 (after `refreshCustomAgents`):

```typescript
  testCustomAgent: bridge.buildProvider<
    IBridgeResponse<{ step: 'cli_check' | 'acp_initialize'; error?: string }>,
    { command: string; acpArgs?: string[]; env?: Record<string, string> }
  >('acp.test-custom-agent'),
```

- [ ] **Step 4: Create the testCustomAgentConnection function**

Create `src/process/bridge/testCustomAgentConnection.ts`:

```typescript
/**
 * Two-step connection test for custom ACP agents:
 * 1. Verify CLI command exists (which/where)
 * 2. Spawn CLI and send ACP initialize request
 */
import { execFileSync } from 'child_process';
import { AcpConnection } from '@process/agent/acp/AcpConnection';
import * as os from 'os';

type TestResult = {
  success: boolean;
  msg?: string;
  data?: { step: 'cli_check' | 'acp_initialize'; error?: string };
};

export async function testCustomAgentConnection(params: {
  command: string;
  acpArgs?: string[];
  env?: Record<string, string>;
}): Promise<TestResult> {
  const { command, acpArgs, env } = params;

  // Step 1: Check if CLI command exists
  const whichCmd = process.platform === 'win32' ? 'where' : 'which';
  // Extract the base command (first token before any spaces — handles "npx @pkg" style paths)
  const baseCommand = command.split(' ')[0];

  try {
    execFileSync(whichCmd, [baseCommand], {
      timeout: 5000,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
  } catch {
    return {
      success: false,
      msg: `Command "${baseCommand}" not found. Make sure it is installed and in your PATH.`,
      data: { step: 'cli_check', error: `Command not found: ${baseCommand}` },
    };
  }

  // Step 2: Spawn CLI and send ACP initialize
  const connection = new AcpConnection();
  const tempDir = os.tmpdir();

  try {
    await connection.connect('custom' as any, command, tempDir, acpArgs, env);
    // If connect() succeeds, ACP initialize was sent and received a valid response
    await connection.disconnect();
    return {
      success: true,
      msg: 'Connection successful',
      data: { step: 'acp_initialize' },
    };
  } catch (error) {
    try {
      await connection.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      msg: `ACP initialize failed: ${errorMsg}`,
      data: { step: 'acp_initialize', error: errorMsg },
    };
  }
}
```

- [ ] **Step 5: Wire the IPC handler in acpConversationBridge.ts**

In `src/process/bridge/acpConversationBridge.ts`, add after the `refreshCustomAgents` provider block (after line 76):

```typescript
// Test custom agent connection - validates CLI exists and ACP handshake works
ipcBridge.acpConversation.testCustomAgent.provider(async (params) => {
  const { testCustomAgentConnection } = await import('./testCustomAgentConnection');
  return testCustomAgentConnection(params);
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun run test -- --run tests/unit/customAcpAgentBridge.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Run lint and format**

Run: `bun run lint:fix && bun run format`

- [ ] **Step 8: Commit**

```bash
git add src/common/adapter/ipcBridge.ts src/process/bridge/acpConversationBridge.ts src/process/bridge/testCustomAgentConnection.ts tests/unit/customAcpAgentBridge.test.ts
git commit -m "feat(acp): add IPC channel for custom agent connection testing

Two-step validation: CLI existence check (which/where) then ACP
initialize handshake. Used by the custom agent settings modal.

Closes #1729 (partial)"
```

---

### Task 2: Add i18n Keys for Structured Form

**Files:**

- Modify: `src/renderer/services/i18n/locales/en-US/settings.json:511`
- Modify: `src/renderer/services/i18n/locales/zh-CN/settings.json:511`
- Modify: `src/renderer/services/i18n/locales/ja-JP/settings.json` (same block)
- Modify: `src/renderer/services/i18n/locales/zh-TW/settings.json` (same block)
- Modify: `src/renderer/services/i18n/locales/ko-KR/settings.json` (same block)
- Modify: `src/renderer/services/i18n/locales/tr-TR/settings.json` (same block)

- [ ] **Step 1: Add English keys**

In `src/renderer/services/i18n/locales/en-US/settings.json`, find the existing custom agent block (around line 486) and replace/extend it. Add these new keys after `"agentNamePlaceholder"` (line 510):

```json
  "commandLabel": "Command",
  "commandPlaceholder": "e.g. my-agent or /usr/local/bin/my-agent",
  "commandHelp": "The executable command to run the agent CLI",
  "argsLabel": "Arguments",
  "argsPlaceholder": "e.g. --acp --verbose",
  "argsHelp": "Space-separated arguments passed to the command",
  "envLabel": "Environment Variables",
  "envKeyPlaceholder": "KEY",
  "envValuePlaceholder": "value",
  "addEnvVar": "Add Variable",
  "testConnectionBtn": "Test Connection",
  "testConnectionTesting": "Testing...",
  "testConnectionSuccess": "Connection successful! CLI exists and ACP protocol is working.",
  "testConnectionFailCli": "Command not found. Make sure it is installed and in your PATH.",
  "testConnectionFailAcp": "CLI found but ACP initialization failed.",
  "addCustomAgentTitle": "Add Custom Agent",
```

- [ ] **Step 2: Add Chinese keys**

In `src/renderer/services/i18n/locales/zh-CN/settings.json`, add after `"agentNamePlaceholder"`:

```json
  "commandLabel": "命令",
  "commandPlaceholder": "例如 my-agent 或 /usr/local/bin/my-agent",
  "commandHelp": "运行 agent CLI 的可执行命令",
  "argsLabel": "参数",
  "argsPlaceholder": "例如 --acp --verbose",
  "argsHelp": "传递给命令的空格分隔参数",
  "envLabel": "环境变量",
  "envKeyPlaceholder": "变量名",
  "envValuePlaceholder": "值",
  "addEnvVar": "添加变量",
  "testConnectionBtn": "测试连接",
  "testConnectionTesting": "测试中...",
  "testConnectionSuccess": "连接成功！CLI 存在且 ACP 协议正常工作。",
  "testConnectionFailCli": "未找到命令。请确保已安装并在 PATH 中。",
  "testConnectionFailAcp": "找到 CLI 但 ACP 初始化失败。",
  "addCustomAgentTitle": "添加自定义代理",
```

- [ ] **Step 3: Add Japanese keys**

In `src/renderer/services/i18n/locales/ja-JP/settings.json`, add after `"agentNamePlaceholder"`:

```json
  "commandLabel": "コマンド",
  "commandPlaceholder": "例: my-agent または /usr/local/bin/my-agent",
  "commandHelp": "エージェント CLI を実行する実行可能コマンド",
  "argsLabel": "引数",
  "argsPlaceholder": "例: --acp --verbose",
  "argsHelp": "コマンドに渡すスペース区切りの引数",
  "envLabel": "環境変数",
  "envKeyPlaceholder": "キー",
  "envValuePlaceholder": "値",
  "addEnvVar": "変数を追加",
  "testConnectionBtn": "接続テスト",
  "testConnectionTesting": "テスト中...",
  "testConnectionSuccess": "接続成功！CLI が存在し、ACP プロトコルが正常に動作しています。",
  "testConnectionFailCli": "コマンドが見つかりません。インストールされ PATH に含まれていることを確認してください。",
  "testConnectionFailAcp": "CLI は見つかりましたが、ACP 初期化に失敗しました。",
  "addCustomAgentTitle": "カスタムエージェントを追加",
```

- [ ] **Step 4: Add Traditional Chinese keys**

In `src/renderer/services/i18n/locales/zh-TW/settings.json`, add after `"agentNamePlaceholder"`:

```json
  "commandLabel": "命令",
  "commandPlaceholder": "例如 my-agent 或 /usr/local/bin/my-agent",
  "commandHelp": "執行 agent CLI 的可執行命令",
  "argsLabel": "參數",
  "argsPlaceholder": "例如 --acp --verbose",
  "argsHelp": "傳遞給命令的空格分隔參數",
  "envLabel": "環境變數",
  "envKeyPlaceholder": "變數名",
  "envValuePlaceholder": "值",
  "addEnvVar": "新增變數",
  "testConnectionBtn": "測試連線",
  "testConnectionTesting": "測試中...",
  "testConnectionSuccess": "連線成功！CLI 存在且 ACP 協議正常運作。",
  "testConnectionFailCli": "找不到命令。請確保已安裝並在 PATH 中。",
  "testConnectionFailAcp": "找到 CLI 但 ACP 初始化失敗。",
  "addCustomAgentTitle": "新增自訂代理",
```

- [ ] **Step 5: Add Korean keys**

In `src/renderer/services/i18n/locales/ko-KR/settings.json`, add after `"agentNamePlaceholder"`:

```json
  "commandLabel": "명령어",
  "commandPlaceholder": "예: my-agent 또는 /usr/local/bin/my-agent",
  "commandHelp": "에이전트 CLI를 실행하는 실행 명령어",
  "argsLabel": "인수",
  "argsPlaceholder": "예: --acp --verbose",
  "argsHelp": "명령에 전달되는 공백으로 구분된 인수",
  "envLabel": "환경 변수",
  "envKeyPlaceholder": "키",
  "envValuePlaceholder": "값",
  "addEnvVar": "변수 추가",
  "testConnectionBtn": "연결 테스트",
  "testConnectionTesting": "테스트 중...",
  "testConnectionSuccess": "연결 성공! CLI가 존재하고 ACP 프로토콜이 정상 작동합니다.",
  "testConnectionFailCli": "명령을 찾을 수 없습니다. 설치되어 있고 PATH에 포함되어 있는지 확인하세요.",
  "testConnectionFailAcp": "CLI를 찾았으나 ACP 초기화에 실패했습니다.",
  "addCustomAgentTitle": "사용자 정의 에이전트 추가",
```

- [ ] **Step 6: Add Turkish keys**

In `src/renderer/services/i18n/locales/tr-TR/settings.json`, add after `"agentNamePlaceholder"`:

```json
  "commandLabel": "Komut",
  "commandPlaceholder": "örn. my-agent veya /usr/local/bin/my-agent",
  "commandHelp": "Ajan CLI'sını çalıştırmak için yürütülebilir komut",
  "argsLabel": "Argümanlar",
  "argsPlaceholder": "örn. --acp --verbose",
  "argsHelp": "Komuta iletilen boşlukla ayrılmış argümanlar",
  "envLabel": "Ortam Değişkenleri",
  "envKeyPlaceholder": "ANAHTAR",
  "envValuePlaceholder": "değer",
  "addEnvVar": "Değişken Ekle",
  "testConnectionBtn": "Bağlantıyı Test Et",
  "testConnectionTesting": "Test ediliyor...",
  "testConnectionSuccess": "Bağlantı başarılı! CLI mevcut ve ACP protokolü çalışıyor.",
  "testConnectionFailCli": "Komut bulunamadı. Yüklü olduğundan ve PATH'te olduğundan emin olun.",
  "testConnectionFailAcp": "CLI bulundu ancak ACP başlatma başarısız oldu.",
  "addCustomAgentTitle": "Özel Ajan Ekle",
```

- [ ] **Step 7: Run format**

Run: `bun run format`

- [ ] **Step 8: Commit**

```bash
git add src/renderer/services/i18n/locales/*/settings.json
git commit -m "feat(i18n): add custom agent structured form keys for all 6 locales"
```

---

### Task 3: Redesign CustomAcpAgentModal with Structured Form

**Files:**

- Rewrite: `src/renderer/pages/settings/AgentSettings/CustomAcpAgentModal.tsx`
- Test: `tests/unit/customAcpAgentModal.dom.test.tsx`

- [ ] **Step 1: Write the failing test for the modal form**

```tsx
// tests/unit/customAcpAgentModal.dom.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock ipcBridge
vi.mock('@/common/adapter/ipcBridge', () => ({
  acpConversation: {
    testCustomAgent: {
      invoke: vi.fn(),
    },
    getAvailableAgents: {
      invoke: vi.fn().mockResolvedValue({ success: true, data: [] }),
    },
  },
}));

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const keys: Record<string, string> = {
        'settings.addCustomAgentTitle': 'Add Custom Agent',
        'settings.agentDisplayName': 'Display Name',
        'settings.commandLabel': 'Command',
        'settings.argsLabel': 'Arguments',
        'settings.envLabel': 'Environment Variables',
        'settings.testConnectionBtn': 'Test Connection',
        'settings.advancedMode': 'Advanced (JSON)',
        'settings.agentNamePlaceholder': 'Enter a name',
        'settings.commandPlaceholder': 'e.g. my-agent',
        'settings.argsPlaceholder': 'e.g. --acp',
        'settings.addEnvVar': 'Add Variable',
        'common.confirm': 'Confirm',
        'common.cancel': 'Cancel',
      };
      return keys[key] || key;
    },
  }),
}));

// Mock ThemeContext
vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

import CustomAcpAgentModal from '@/renderer/pages/settings/AgentSettings/CustomAcpAgentModal';

describe('CustomAcpAgentModal', () => {
  const defaultProps = {
    visible: true,
    agent: null,
    onCancel: vi.fn(),
    onSubmit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders structured form fields when visible', () => {
    render(<CustomAcpAgentModal {...defaultProps} />);

    expect(screen.getByText('Display Name')).toBeDefined();
    expect(screen.getByText('Command')).toBeDefined();
    expect(screen.getByText('Arguments')).toBeDefined();
    expect(screen.getByText('Environment Variables')).toBeDefined();
  });

  it('has Test Connection button', () => {
    render(<CustomAcpAgentModal {...defaultProps} />);
    expect(screen.getByText('Test Connection')).toBeDefined();
  });

  it('submit is disabled when name and command are empty', () => {
    render(<CustomAcpAgentModal {...defaultProps} />);
    // The OK button should be disabled initially
    const okBtn = screen.getByText('Confirm');
    expect(okBtn.closest('button')?.disabled).toBe(true);
  });

  it('populates form fields when editing an existing agent', () => {
    const agent = {
      id: 'test-id',
      name: 'My Agent',
      defaultCliPath: 'my-agent',
      acpArgs: ['--acp', '--verbose'],
      env: { API_KEY: 'secret' },
      enabled: true,
    };

    render(<CustomAcpAgentModal {...defaultProps} agent={agent} />);

    // Form should be pre-filled
    const nameInput = screen.getByDisplayValue('My Agent');
    expect(nameInput).toBeDefined();

    const commandInput = screen.getByDisplayValue('my-agent');
    expect(commandInput).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- --run tests/unit/customAcpAgentModal.dom.test.tsx`
Expected: FAIL — current modal doesn't have the expected form structure.

- [ ] **Step 3: Rewrite CustomAcpAgentModal.tsx**

Replace the entire file `src/renderer/pages/settings/AgentSettings/CustomAcpAgentModal.tsx`:

```tsx
/**
 * Custom ACP Agent Configuration Modal — Structured Form
 *
 * Zed-style declarative config (command + args + env) with a JetBrains-style
 * structured form. Collapsible advanced JSON editor for power users.
 */
import type { AcpBackendConfig } from '@/common/types/acpTypes';
import { acpConversation } from '@/common/adapter/ipcBridge';
import { Alert, Button, Collapse, Input, Space, Spin } from '@arco-design/web-react';
import { Plus, Delete, CheckOne, CloseOne } from '@icon-park/react';
import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';
import AionModal from '@/renderer/components/base/AionModal';
import { uuid } from '@/common/utils';

interface CustomAcpAgentModalProps {
  visible: boolean;
  agent?: AcpBackendConfig | null;
  onCancel: () => void;
  onSubmit: (agent: AcpBackendConfig) => void;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'fail_cli' | 'fail_acp';

const CustomAcpAgentModal: React.FC<CustomAcpAgentModalProps> = ({ visible, agent, onCancel, onSubmit }) => {
  const { t } = useTranslation();
  const { theme } = useThemeContext();

  // Form state
  const [agentName, setAgentName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([]);

  // Advanced JSON
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [jsonSyncDirection, setJsonSyncDirection] = useState<'form' | 'json'>('form');

  // Connection test
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testError, setTestError] = useState('');

  // Initialize form when modal opens
  useEffect(() => {
    if (!visible) return;
    setTestStatus('idle');
    setTestError('');

    if (agent) {
      setAgentName(agent.name || '');
      setCommand(agent.defaultCliPath || '');
      setArgs((agent.acpArgs || []).join(' '));
      setEnvVars(agent.env ? Object.entries(agent.env).map(([key, value]) => ({ key, value })) : []);
      setShowAdvanced(false);
    } else {
      setAgentName('');
      setCommand('');
      setArgs('');
      setEnvVars([]);
      setShowAdvanced(false);
      setJsonInput('');
    }
  }, [visible, agent]);

  // Sync form → JSON when form fields change (unless JSON is being edited)
  useEffect(() => {
    if (jsonSyncDirection !== 'form') return;
    const config: Record<string, unknown> = {
      defaultCliPath: command,
      enabled: true,
    };
    const parsedArgs = args.trim() ? args.trim().split(/\s+/) : undefined;
    if (parsedArgs) config.acpArgs = parsedArgs;
    const envObj = envVars.reduce<Record<string, string>>((acc, { key, value }) => {
      if (key.trim()) acc[key.trim()] = value;
      return acc;
    }, {});
    if (Object.keys(envObj).length > 0) config.env = envObj;
    setJsonInput(JSON.stringify(config, null, 2));
  }, [command, args, envVars, jsonSyncDirection]);

  // Handle JSON editor changes → sync back to form
  const handleJsonChange = useCallback((value: string) => {
    setJsonInput(value);
    setJsonSyncDirection('json');
    try {
      const parsed = JSON.parse(value);
      if (parsed.defaultCliPath !== undefined) setCommand(parsed.defaultCliPath);
      if (parsed.acpArgs) setArgs(Array.isArray(parsed.acpArgs) ? parsed.acpArgs.join(' ') : '');
      if (parsed.env && typeof parsed.env === 'object') {
        setEnvVars(Object.entries(parsed.env as Record<string, string>).map(([key, val]) => ({ key, value: val })));
      }
    } catch {
      // Invalid JSON — don't sync back
    }
    // Reset direction after sync so form changes push to JSON again
    setTimeout(() => setJsonSyncDirection('form'), 0);
  }, []);

  // Add env var row
  const addEnvVar = useCallback(() => {
    setEnvVars((prev) => [...prev, { key: '', value: '' }]);
  }, []);

  // Remove env var row
  const removeEnvVar = useCallback((index: number) => {
    setEnvVars((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Update env var
  const updateEnvVar = useCallback((index: number, field: 'key' | 'value', val: string) => {
    setEnvVars((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: val } : item)));
  }, []);

  // Test connection
  const handleTestConnection = useCallback(async () => {
    if (!command.trim()) return;
    setTestStatus('testing');
    setTestError('');

    try {
      const parsedArgs = args.trim() ? args.trim().split(/\s+/) : undefined;
      const envObj = envVars.reduce<Record<string, string>>((acc, { key, value }) => {
        if (key.trim()) acc[key.trim()] = value;
        return acc;
      }, {});

      const result = await acpConversation.testCustomAgent.invoke({
        command: command.trim(),
        acpArgs: parsedArgs,
        env: Object.keys(envObj).length > 0 ? envObj : undefined,
      });

      if (result.success) {
        setTestStatus('success');
      } else if (result.data?.step === 'cli_check') {
        setTestStatus('fail_cli');
        setTestError(result.msg || '');
      } else {
        setTestStatus('fail_acp');
        setTestError(result.msg || '');
      }
    } catch (error) {
      setTestStatus('fail_acp');
      setTestError(error instanceof Error ? error.message : 'Unknown error');
    }
  }, [command, args, envVars]);

  // Submit
  const handleSubmit = useCallback(() => {
    const parsedArgs = args.trim() ? args.trim().split(/\s+/) : undefined;
    const envObj = envVars.reduce<Record<string, string>>((acc, { key, value }) => {
      if (key.trim()) acc[key.trim()] = value;
      return acc;
    }, {});

    const customAgent: AcpBackendConfig = {
      id: agent?.id || uuid(),
      name: agentName.trim() || 'Custom Agent',
      defaultCliPath: command.trim(),
      enabled: true,
      acpArgs: parsedArgs,
      env: Object.keys(envObj).length > 0 ? envObj : undefined,
    };
    onSubmit(customAgent);
  }, [agent, agentName, command, args, envVars, onSubmit]);

  const isSubmitDisabled = !agentName.trim() || !command.trim();

  if (!visible) return null;

  return (
    <AionModal
      visible={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      okButtonProps={{ disabled: isSubmitDisabled }}
      header={{
        title: agent
          ? t('settings.editCustomAgent') || 'Edit Custom Agent'
          : t('settings.addCustomAgentTitle') || 'Add Custom Agent',
        showClose: true,
      }}
      style={{ width: 520, height: 'auto', maxHeight: '80vh' }}
      contentStyle={{
        borderRadius: 16,
        padding: '20px',
        background: 'var(--bg-1)',
        overflow: 'auto',
      }}
    >
      <div className='space-y-16px'>
        {/* Display Name */}
        <div>
          <div className='mb-4px text-sm font-medium text-t-primary'>
            {t('settings.agentDisplayName') || 'Display Name'} <span className='text-danger'>*</span>
          </div>
          <Input
            value={agentName}
            onChange={(v) => setAgentName(v)}
            placeholder={t('settings.agentNamePlaceholder') || 'Enter a name for this agent'}
          />
        </div>

        {/* Command */}
        <div>
          <div className='mb-4px text-sm font-medium text-t-primary'>
            {t('settings.commandLabel') || 'Command'} <span className='text-danger'>*</span>
          </div>
          <Input
            value={command}
            onChange={(v) => setCommand(v)}
            placeholder={t('settings.commandPlaceholder') || 'e.g. my-agent or /usr/local/bin/my-agent'}
          />
          <div className='mt-2px text-xs text-t-tertiary'>
            {t('settings.commandHelp') || 'The executable command to run the agent CLI'}
          </div>
        </div>

        {/* Arguments */}
        <div>
          <div className='mb-4px text-sm font-medium text-t-primary'>{t('settings.argsLabel') || 'Arguments'}</div>
          <Input
            value={args}
            onChange={(v) => setArgs(v)}
            placeholder={t('settings.argsPlaceholder') || 'e.g. --acp --verbose'}
          />
          <div className='mt-2px text-xs text-t-tertiary'>
            {t('settings.argsHelp') || 'Space-separated arguments passed to the command'}
          </div>
        </div>

        {/* Environment Variables */}
        <div>
          <div className='mb-4px text-sm font-medium text-t-primary'>
            {t('settings.envLabel') || 'Environment Variables'}
          </div>
          <div className='space-y-8px'>
            {envVars.map((envVar, index) => (
              <Space key={index} className='w-full'>
                <Input
                  className='w-140px'
                  value={envVar.key}
                  onChange={(v) => updateEnvVar(index, 'key', v)}
                  placeholder={t('settings.envKeyPlaceholder') || 'KEY'}
                />
                <Input
                  className='flex-1'
                  value={envVar.value}
                  onChange={(v) => updateEnvVar(index, 'value', v)}
                  placeholder={t('settings.envValuePlaceholder') || 'value'}
                />
                <Button
                  type='text'
                  size='small'
                  status='danger'
                  icon={<Delete size={14} />}
                  onClick={() => removeEnvVar(index)}
                />
              </Space>
            ))}
            <Button type='text' size='small' icon={<Plus size={14} />} onClick={addEnvVar}>
              {t('settings.addEnvVar') || 'Add Variable'}
            </Button>
          </div>
        </div>

        {/* Test Connection */}
        <div>
          <Button
            type='outline'
            size='small'
            loading={testStatus === 'testing'}
            disabled={!command.trim()}
            onClick={handleTestConnection}
          >
            {testStatus === 'testing'
              ? t('settings.testConnectionTesting') || 'Testing...'
              : t('settings.testConnectionBtn') || 'Test Connection'}
          </Button>
          {testStatus === 'success' && (
            <Alert
              type='success'
              className='mt-8px'
              content={
                <span className='flex items-center gap-4px'>
                  <CheckOne size={14} />
                  {t('settings.testConnectionSuccess') || 'Connection successful!'}
                </span>
              }
            />
          )}
          {testStatus === 'fail_cli' && (
            <Alert
              type='error'
              className='mt-8px'
              content={
                <span className='flex items-center gap-4px'>
                  <CloseOne size={14} />
                  {t('settings.testConnectionFailCli') || 'Command not found.'}
                  {testError && <span className='text-xs ml-4px'>({testError})</span>}
                </span>
              }
            />
          )}
          {testStatus === 'fail_acp' && (
            <Alert
              type='warning'
              className='mt-8px'
              content={
                <span className='flex items-center gap-4px'>
                  <CloseOne size={14} />
                  {t('settings.testConnectionFailAcp') || 'ACP initialization failed.'}
                  {testError && <span className='text-xs ml-4px'>({testError})</span>}
                </span>
              }
            />
          )}
        </div>

        {/* Advanced JSON Configuration */}
        <Collapse
          activeKey={showAdvanced ? ['advanced'] : []}
          onChange={(_key, keys) => setShowAdvanced(keys.includes('advanced'))}
          bordered={false}
          style={{ background: 'transparent' }}
        >
          <Collapse.Item
            name='advanced'
            header={
              <span className='text-sm text-t-secondary'>{t('settings.advancedMode') || 'Advanced Configuration'}</span>
            }
          >
            <div className='pt-8px'>
              <CodeMirror
                value={jsonInput}
                height='160px'
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
                  border: '1px solid var(--color-border-2)',
                  borderRadius: '6px',
                  overflow: 'hidden',
                }}
                className='[&_.cm-editor]:rounded-[6px]'
              />
            </div>
          </Collapse.Item>
        </Collapse>
      </div>
    </AionModal>
  );
};

export default CustomAcpAgentModal;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- --run tests/unit/customAcpAgentModal.dom.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Run lint and format**

Run: `bun run lint:fix && bun run format`

- [ ] **Step 6: Commit**

```bash
git add src/renderer/pages/settings/AgentSettings/CustomAcpAgentModal.tsx tests/unit/customAcpAgentModal.dom.test.tsx
git commit -m "feat(acp): redesign custom agent modal with structured form

Replace CLI card selector with Zed-style declarative form: name,
command, args, env fields. Add bidirectional JSON sync and
connection test button. Follows JetBrains-style structured UI."
```

---

### Task 4: Update CustomAcpAgent List to Show Command

**Files:**

- Modify: `src/renderer/pages/settings/AgentSettings/CustomAcpAgent.tsx:204`

- [ ] **Step 1: Update the agent card to display command instead of defaultCliPath label**

In `src/renderer/pages/settings/AgentSettings/CustomAcpAgent.tsx`, replace the display block (lines 203–212):

Old:

```tsx
                  <div className='text-sm text-t-secondary'>
                    <div>
                      <span className='font-medium'>{t('settings.command') || 'CLI Path'}:</span> {agent.defaultCliPath}
                    </div>
```

New:

```tsx
                  <div className='text-sm text-t-secondary'>
                    <div>
                      <span className='font-medium'>{t('settings.commandLabel') || 'Command'}:</span> {agent.defaultCliPath}
                    </div>
                    {agent.acpArgs && agent.acpArgs.length > 0 && (
                      <div>
                        <span className='font-medium'>{t('settings.argsLabel') || 'Args'}:</span>{' '}
                        {agent.acpArgs.join(' ')}
                      </div>
                    )}
```

- [ ] **Step 2: Run lint and format**

Run: `bun run lint:fix && bun run format`

- [ ] **Step 3: Commit**

```bash
git add src/renderer/pages/settings/AgentSettings/CustomAcpAgent.tsx
git commit -m "fix(acp): show command and args in custom agent list cards"
```

---

### Task 5: Mount CustomAcpAgent in AgentModalContent

**Files:**

- Modify: `src/renderer/components/settings/SettingsModal/contents/AgentModalContent.tsx`

- [ ] **Step 1: Add CustomAcpAgent import and render it in the Collapse**

Replace the entire file `src/renderer/components/settings/SettingsModal/contents/AgentModalContent.tsx`:

```tsx
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Collapse, Message } from '@arco-design/web-react';
import React from 'react';
import AssistantManagement from '@/renderer/pages/settings/AgentSettings/AssistantManagement';
import CustomAcpAgent from '@/renderer/pages/settings/AgentSettings/CustomAcpAgent';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { useSettingsViewMode } from '../settingsViewContext';

const AgentModalContent: React.FC = () => {
  const [agentMessage, agentMessageContext] = Message.useMessage({ maxCount: 10 });
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  return (
    <div className='flex flex-col h-full w-full'>
      {agentMessageContext}

      <AionScrollArea className='flex-1 min-h-0 pb-16px scrollbar-hide' disableOverflow={isPageMode}>
        <Collapse defaultActiveKey={['smart-assistants', 'custom-acp-agent']}>
          <AssistantManagement message={agentMessage} />
          <CustomAcpAgent message={agentMessage} />
        </Collapse>
      </AionScrollArea>
    </div>
  );
};

export default AgentModalContent;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: No errors related to `AgentModalContent` or `CustomAcpAgent`.

- [ ] **Step 3: Run lint and format**

Run: `bun run lint:fix && bun run format`

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/settings/SettingsModal/contents/AgentModalContent.tsx
git commit -m "feat(acp): mount custom agent settings in Agent tab

CustomAcpAgent section now appears below AssistantManagement in
Settings → Agent, making the orphaned component accessible.

Closes #1729"
```

---

### Task 6: End-to-End Verification

**Files:** (no new files — verification only)

- [ ] **Step 1: Run full test suite**

Run: `bun run test`
Expected: All tests pass including the two new test files.

- [ ] **Step 2: Run type check**

Run: `bunx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Run pre-commit checks**

Run: `bun run lint:fix && bun run format`
Then: `prek run --from-ref origin/main --to-ref HEAD`
Expected: All checks pass.

- [ ] **Step 4: Manual verification checklist**

Verify by reading the code:

- [ ] `AgentModalContent` imports and renders `CustomAcpAgent`
- [ ] `CustomAcpAgentModal` has structured form: name, command, args, env fields
- [ ] `CustomAcpAgentModal` has "Test Connection" button calling `acpConversation.testCustomAgent`
- [ ] `CustomAcpAgentModal` has collapsible advanced JSON editor synced with form
- [ ] `testCustomAgentConnection` does two-step validation: `which` + ACP `connect()`
- [ ] IPC channel `acp.test-custom-agent` is defined in `ipcBridge.ts` and handled in `acpConversationBridge.ts`
- [ ] All 6 locale files have the new i18n keys
- [ ] Saved agents use `AcpBackendConfig` with `defaultCliPath`, `acpArgs`, `env` — compatible with existing `AcpDetector.addCustomAgentsToList()`
- [ ] No new dependencies introduced
