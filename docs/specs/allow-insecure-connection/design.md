# 允许不安全连接 — 设计方案

## 概述

将硬编码的 `rejectUnauthorized: false` 改为按远程 Agent 粒度的用户配置项，默认开启证书校验（安全），用户可按需关闭（用于自签名证书场景）。

---

## 一、数据层

### 1.1 类型定义

**文件**：`src/process/agent/remote/types.ts`

在 `RemoteAgentConfig`（line 17）和 `RemoteAgentInput`（line 41）中各新增一个字段：

```typescript
/** 跳过 TLS 证书校验（用于自签名证书），默认 false */
allowInsecure?: boolean;
```

### 1.2 数据库 Migration

**文件**：`src/process/services/database/migrations.ts`

新增 `migration_v18`，在 `remote_agents` 表增加列，并注册到 `ALL_MIGRATIONS` 数组（line 862）：

```typescript
const migration_v18: IMigration = {
  version: 18,
  name: 'Add allow_insecure column to remote_agents',
  up: (db) => {
    const columns = new Set((db.pragma('table_info(remote_agents)') as Array<{ name: string }>).map((c) => c.name));
    if (!columns.has('allow_insecure')) {
      db.exec('ALTER TABLE remote_agents ADD COLUMN allow_insecure INTEGER DEFAULT 0');
    }
  },
  down: (_db) => {
    console.warn('[Migration v18] Rollback skipped: cannot drop columns safely.');
  },
};
```

`DEFAULT 0` 表示已有 Agent 升级后默认安全（开启证书校验）。

### 1.3 数据库 CRUD

**文件**：`src/process/services/database/index.ts`

共 4 处改动：

| 函数                  | 行号      | 改动                                                                                          |
| --------------------- | --------- | --------------------------------------------------------------------------------------------- |
| `getRemoteAgents()`   | 1415-1452 | row 类型声明加 `allow_insecure: number \| null`；映射加 `allowInsecure: !!row.allow_insecure` |
| `getRemoteAgent()`    | 1454-1496 | 同上                                                                                          |
| `createRemoteAgent()` | 1498-1527 | INSERT 语句和参数列表加 `allow_insecure`，值为 `config.allowInsecure ? 1 : 0`                 |
| `updateRemoteAgent()` | 1529-1566 | `updates` 参数类型加 `allow_insecure: number`，无需加密处理                                   |

---

## 二、通信层

### 2.1 IPC Bridge 定义

**文件**：`src/common/adapter/ipcBridge.ts`

`testConnection`（line 528-531）的参数类型加 `allowInsecure?: boolean`：

```typescript
testConnection: bridge.buildProvider<
  { success: boolean; error?: string },
  { url: string; authType: string; authToken?: string; allowInsecure?: boolean }
>('remote-agent.test-connection'),
```

`handshake` 不需要改，它通过 `id` 从 DB 读取完整配置（包含 `allowInsecure`）。

### 2.2 Bridge Provider

**文件**：`src/process/bridge/remoteAgentBridge.ts`

**testConnection**（line 72-98）：

从解构参数中获取 `allowInsecure`，传入 WebSocket：

```typescript
// 改前 (line 72)
ipcBridge.remoteAgent.testConnection.provider(async ({ url, authType, authToken }) => {

// 改后
ipcBridge.remoteAgent.testConnection.provider(async ({ url, authType, authToken, allowInsecure }) => {
```

```typescript
// 改前 (line 84)
const ws = new WebSocket(url, { headers, handshakeTimeout: 10_000, rejectUnauthorized: false });

// 改后
const ws = new WebSocket(url, { headers, handshakeTimeout: 10_000, rejectUnauthorized: !allowInsecure });
```

**handshake**（line 100-168）：

创建 `OpenClawGatewayConnection` 时传入 `rejectUnauthorized`：

```typescript
// 改前 (line 120)
const conn = new OpenClawGatewayConnection({
  url: agent.url,
  ...
});

// 改后
const conn = new OpenClawGatewayConnection({
  url: agent.url,
  rejectUnauthorized: !agent.allowInsecure,
  ...
});
```

**update**（line 52-64）：

在字段映射中加一行：

```typescript
if (updates.allowInsecure !== undefined) dbUpdates.allow_insecure = updates.allowInsecure ? 1 : 0;
```

### 2.3 OpenClaw 客户端

**文件**：`src/process/agent/openclaw/types.ts`

`OpenClawGatewayClientOptions`（line 282-306）加字段：

```typescript
/** 是否校验 TLS 证书，默认 true */
rejectUnauthorized?: boolean;
```

**文件**：`src/process/agent/openclaw/OpenClawGatewayConnection.ts`

`start()` 方法（line 100-109）中从 `this.opts` 读取：

```typescript
// 改前 (line 106-109)
this.ws = new WebSocket(url, {
  maxPayload: 25 * 1024 * 1024,
  rejectUnauthorized: false,
});

// 改后
this.ws = new WebSocket(url, {
  maxPayload: 25 * 1024 * 1024,
  rejectUnauthorized: this.opts.rejectUnauthorized ?? true,
});
```

默认 `true` 确保未显式传值时走安全路径。

---

## 三、UI 层

### 3.1 表单控件

**文件**：`src/renderer/pages/settings/AgentSettings/RemoteAgentManagement.tsx`

在 Auth Token 条件渲染块（line 318-330）之后、Test Connection 按钮（line 332）之前，新增一个 `Switch` 控件：

```tsx
<Form.Item shouldUpdate noStyle>
  {(values: Record<string, unknown>) =>
    typeof values.url === 'string' && values.url.startsWith('wss://') ? (
      <FormItem
        label={t('settings.remoteAgent.allowInsecure')}
        field='allowInsecure'
        triggerPropName='checked'
        extra={
          <Typography.Text type='secondary' className='text-12px'>
            {t('settings.remoteAgent.allowInsecureHint')}
          </Typography.Text>
        }
      >
        <Switch />
      </FormItem>
    ) : null
  }
</Form.Item>
```

显示条件：URL 以 `wss://` 开头时才渲染（`ws://` 无 TLS，该选项无意义）。

### 3.2 表单数据流

需要改动 3 处已有逻辑：

1. **handleTestConnection**（line 104-131）：调用 `testConnection.invoke` 时传入 `allowInsecure`：

   ```typescript
   const result = await ipcBridge.remoteAgent.testConnection.invoke({
     url: values.url,
     authType: values.authType || 'none',
     authToken: values.authToken,
     allowInsecure: values.allowInsecure, // 新增
   });
   ```

2. **afterOpen 回调**（line 253-268）：编辑模式下回填 `allowInsecure`：

   ```typescript
   form.setFieldsValue({
     name: editAgent.name,
     url: editAgent.url,
     authType: editAgent.authType,
     authToken: editAgent.authToken,
     allowInsecure: editAgent.allowInsecure, // 新增
   });
   ```

3. **handleTestConnection 取值**（line 105）：`getFieldsValue` 参数数组加 `'allowInsecure'`。

### 3.3 组件导入

需新增 `Switch` 组件导入（line 11-22 的 arco-design 导入块中加入）。

---

## 四、i18n

### 4.1 英文

**文件**：`src/renderer/services/i18n/locales/en-US/settings.json`

在 `remoteAgent` 对象中新增：

```json
"allowInsecure": "Allow Insecure Connection",
"allowInsecureHint": "Skip TLS certificate verification (for self-signed certificates)"
```

### 4.2 中文

**文件**：`src/renderer/services/i18n/locales/zh-CN/settings.json`

```json
"allowInsecure": "允许不安全连接",
"allowInsecureHint": "跳过 TLS 证书验证（用于自签名证书）"
```

### 4.3 其他语言

检查 `src/renderer/services/i18n/locales/` 下是否有其他语言目录，如有则同步添加（可先用英文占位）。

---

## 五、改动文件清单

| #   | 文件                                                                  | 改动类型           |
| --- | --------------------------------------------------------------------- | ------------------ |
| 1   | `src/process/agent/remote/types.ts`                                   | 新增字段           |
| 2   | `src/process/agent/openclaw/types.ts`                                 | 新增字段           |
| 3   | `src/process/agent/openclaw/OpenClawGatewayConnection.ts`             | 替换硬编码         |
| 4   | `src/common/adapter/ipcBridge.ts`                                     | 扩展参数类型       |
| 5   | `src/process/bridge/remoteAgentBridge.ts`                             | 传递配置值         |
| 6   | `src/process/services/database/migrations.ts`                         | 新增 migration v18 |
| 7   | `src/process/services/database/index.ts`                              | CRUD 字段映射      |
| 8   | `src/renderer/pages/settings/AgentSettings/RemoteAgentManagement.tsx` | UI 表单            |
| 9   | `src/renderer/services/i18n/locales/en-US/settings.json`              | i18n               |
| 10  | `src/renderer/services/i18n/locales/zh-CN/settings.json`              | i18n               |

---

## 六、验证

| 场景                                    | 预期结果                             |
| --------------------------------------- | ------------------------------------ |
| 新建 Agent，URL 为 `wss://`，不勾选开关 | 连接自签证书服务报错                 |
| 新建 Agent，URL 为 `wss://`，勾选开关   | 连接自签证书服务成功                 |
| URL 为 `ws://`                          | 不显示开关                           |
| 点击 Test Connection                    | 遵守当前开关状态                     |
| 编辑已有 Agent                          | 正确回填开关状态                     |
| 数据库升级（v17 → v18）                 | 已有 Agent 默认 `allow_insecure = 0` |
