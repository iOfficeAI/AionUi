# Internal Identifier Rename: `aionui` → `pounding`

## 背景

将 POUNDING fork 中的内部标识符从上游的 `aionui` 统一改为 `pounding`，包括数据目录、平台名、数据库 source、deep link 协议等。

## 改动清单

### Data Directory

| 项目 | 改前 | 改后 |
|------|------|------|
| 运行时数据目录 | `~/.aionui` | `~/.pounding` |
| 配置目录 | `~/.aionui-config` | `~/.pounding-config` |
| 临时目录 | `<tmp>/aionui` | `<tmp>/pounding` |

**文件：** `packages/desktop/src/process/utils/utils.ts`

### Platform / Server Identity

| 项目 | 改前 | 改后 |
|------|------|------|
| 平台 fallback 名 | `'aionui'` | `'pounding'` |
| 服务端数据目录 | `~/.aionui-server` | `~/.pounding-server` |

**文件：** `packages/desktop/src/common/platform/NodePlatformServices.ts`

### Conversation Source

| 项目 | 改前 | 改后 |
|------|------|------|
| TypeScript 类型 | `'aionui' \| ...` | `'pounding' \| 'aionui' \| ...` |
| DB 中实际写入值 | `'aionui'` | `'pounding'` |

`'aionui'` 保留在类型定义中是向后兼容，因为旧数据库中可能有该值。

**文件：** `packages/desktop/src/common/config/storage.ts`

### Deep Link Protocol

| 项目 | 改前 | 改后 |
|------|------|------|
| 协议 scheme | `aionui://` | `pounding://` |
| electron-builder protocols | `- aionui` | `- pounding` |
| Linux MIME 类型 | `x-scheme-handler/aionui` | `x-scheme-handler/pounding` |

旧 `aionui://` 链接将失效。OS 级协议注册会由 electron-builder 自动处理。

**文件：** `packages/desktop/src/process/utils/deepLink.ts`、`packages/desktop/electron-builder.yml`

### 存储文件 & Local Key

| 项目 | 改前 | 改后 |
|------|------|------|
| 配置文件 | `aionui-config.txt` | `pounding-config.txt` |
| 聊天文件 | `aionui-chat.txt` | `pounding-chat.txt` |
| 聊天消息文件 | `aionui-chat-message.txt` | `pounding-chat-message.txt` |
| 环境文件 | `.aionui-env` | `.pounding-env` |
| 聊天历史目录 | `aionui-chat-history/` | `pounding-chat-history/` |
| Env key | `aionui.dir` | `pounding.dir` |
| CDP registry | `.aionui-cdp-registry.json` | `.pounding-cdp-registry.json` |
| 数据库文件 | `aionui.db` | `pounding.db` |

**文件：** `packages/desktop/src/process/utils/initStorage.ts`、`configureChromium.ts`、`runLegacyDatabaseMigrations.ts`、`applicationBridgeCore.ts`

### MCP Internal Source

```typescript
// 改前
const INTERNAL_MCP_CONFIG_SOURCES = new Set(['aionui']);
// 改后（保留 'aionui' 兼容旧数据）
const INTERNAL_MCP_CONFIG_SOURCES = new Set(['pounding', 'aionui']);
```

**文件：** `packages/desktop/src/renderer/hooks/mcp/mcpAgentStatusUtils.ts`

### 其他

| 项目 | 改前 | 改后 |
|------|------|------|
| Image Gen ID | `aionui-image-generation` | `pounding-image-generation` |
| Image Gen server name | `aionui_image_generation` | `pounding_image_generation` |
| HTTP header | `x-aionui-internal` | `x-pounding-internal` |

**文件：** `packages/desktop/src/process/resources/builtinMcp/constants.ts`、`imageGenServer.ts`、`src/common/config/storage.ts`、`src/index.ts`

## 未改动的 AionUI 引用（保持兼容性）

- **npm 包名**：`@aionui/desktop`、`@aionui/web-host` — npm registry 标识
- **环境变量**：`AIONUI_*` — 外部脚本依赖，改后破坏开发工作流
- **localStorage key**：`aionui.*` — 改后清除用户偏好
- **CSS class、DOM events** — 纯渲染层，不影响功能
- **Sentry tags** — `aionui.*` — 不影响功能**
- **Copyright 版权声明** — 保留上游署名
- **AIONUI_TIMESTAMP_SEPARATOR** — 改后破坏磁盘上已有文件名

## DB Migration v27

新增 migration（`migrations.ts`），版本号 26 → 27（`schema.ts`）：

1. `UPDATE conversations SET source = 'pounding' WHERE source = 'aionui'`
2. 如 conversations 表仍有 CHECK 约束，重建表去掉 source 上的 CHECK

## 维护注意事项

- **新增内部标识符时**：优先使用 `pounding`，如果涉及旧的 `aionui` 兼容性，保留旧值在类型/集合中
- **数据库迁移**：不要在已有的 migrations 上改 CHECK，应该新增 migration
- 所有改动都在 `chore/internal-identifiers-pounding` 分支上
