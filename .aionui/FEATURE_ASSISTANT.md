# AionUi 助手集成功能开发

> 本模板用于规范化向 AI 描述功能开发需求，确保 AI 能够准确理解任务并遵循项目约定。

---

## 1. 功能概述

### 1.1 基本信息

- **功能名称**: 个人助手功能开发
- **所属模块**: [ ok] Agent层 [ ok] 对话系统
- **涉及进程**: [ ok] 主进程(process) [ ] 渲染进程(renderer) [ ] WebServer [ok ] Worker

### 1.2 功能描述

[用 1-3 句话描述功能的核心目的和价值]

1、与web ui 功能类似，主要实现用户在个人终端可以直接进行aion的功能操作及反馈

2、主要涉及个人用户的IM通信工具(移动互联网相关的)

3、打造个人终端助手，实现7\*24小时实现cowork

4、优化实现telegram的接入

### 1.3 用户场景

```
触发: 用户通过个人手机IM工具(如telegram、Slack)发送消息
过程: 通过平台机器人或助手向aion发送消息指令
结果: aion接受指令后开始工作，完成后通过相同方式推送到相关平台
```

### 1.4 数据流

| 方向 | 数据类型 | 说明 |
| ---- | -------- | ---- |
| 输入 |          |      |
| 输出 |          |      |

---

## 2. 开发规范

### 2.1 技术栈约束

- **框架**: Electron 37 + React 19 + TypeScript 5.8
- **UI库**: Arco Design (@arco-design/web-react)
- **图标**: Icon Park (@icon-park/react)
- **CSS**: UnoCSS 原子化样式
- **状态管理**: React Context (AuthContext / ConversationContext / ThemeContext / LayoutContext)
- **IPC通信**: @office-ai/platform bridge 系统
- **国际化**: i18next + react-i18next
- **数据库**: better-sqlite3

### 2.2 命名规范

| 类型         | 规范                  | 示例                                            |
| ------------ | --------------------- | ----------------------------------------------- |
| React 组件   | PascalCase            | `MessageList.tsx`, `FilePreview.tsx`            |
| Hooks        | use 前缀 + PascalCase | `useAutoScroll.ts`, `useColorScheme.ts`         |
| Bridge 文件  | 功能名 + Bridge       | `conversationBridge.ts`, `databaseBridge.ts`    |
| Service 文件 | 功能名 + Service      | `WebuiService.ts`                               |
| 接口类型     | I 前缀                | `ICreateConversationParams`, `IResponseMessage` |
| 类型别名     | T 前缀或直接命名      | `TChatConversation`, `PresetAgentType`          |
| 常量         | UPPER_SNAKE_CASE      | `MAX_RETRY_COUNT`                               |
| 工具函数     | camelCase             | `formatMessage`, `parseResponse`                |

### 2.3 文件位置规范

```
新增文件应放置于对应目录:

src/
├── agent/                        # AI 代理实现
│   ├── acp/                      # ACP 协议代理
│   ├── codex/                    # Codex 代理
│   └── gemini/                   # Gemini 代理
│
├── common/                       # 跨进程共享模块
│   ├── adapters/                 # API 适配器
│   ├── types/                    # 共享类型定义
│   └── utils/                    # 共享工具函数
│
├── process/                      # Electron 主进程
│   ├── bridge/                   # IPC 桥接定义 (24+ 个)
│   ├── database/                 # SQLite 数据库操作
│   ├── services/                 # 业务逻辑服务
│   └── task/                     # 任务管理
│
├── renderer/                     # React 渲染进程
│   ├── components/               # 可复用 UI 组件
│   │   └── base/                 # 基础组件
│   ├── context/                  # React Context 状态
│   ├── hooks/                    # 自定义 Hooks (31+)
│   ├── pages/                    # 页面组件
│   │   ├── conversation/         # 对话页面
│   │   │   ├── preview/          # 预览面板
│   │   │   └── workspace/        # 工作区
│   │   ├── settings/             # 设置页面 (12+)
│   │   └── login/                # 登录页面
│   ├── messages/                 # 消息渲染组件
│   ├── i18n/locales/             # 国际化文本
│   ├── services/                 # 前端服务
│   └── utils/                    # 前端工具函数
│
├── webserver/                    # Web 服务器 (WebUI 模式)
│   ├── routes/                   # API 路由
│   └── middleware/               # 中间件
│
├── worker/                       # Web Worker
│
└── types/                        # 全局类型定义
```

### 2.4 代码风格 (Prettier 配置)

```json
{
  "semi": true, // 使用分号
  "singleQuote": true, // 使用单引号
  "jsxSingleQuote": true, // JSX 使用单引号
  "trailingComma": "es5", // ES5 兼容的尾随逗号
  "tabWidth": 2, // 2 空格缩进
  "useTabs": false, // 不使用 Tab
  "bracketSpacing": true, // 括号内空格
  "arrowParens": "always", // 箭头函数始终括号
  "endOfLine": "lf" // Unix 换行符
}
```

### 2.5 质量要求

- [x] TypeScript 类型完整，避免使用 `any`
- [x] 使用 bridge 系统进行 IPC 通信
- [x] 实现错误边界处理
- [x] 支持国际化 (使用 i18next 的 `t()` 函数)
- [x] 深色/浅色主题兼容
- [x] 响应式布局适配

### 2.6 禁止事项

- ❌ 直接使用 `ipcMain` / `ipcRenderer`，必须通过 bridge 系统
- ❌ 在渲染进程直接访问 Node.js API
- ❌ 硬编码中文/英文文本，需使用 i18n key
- ❌ 使用内联样式，应使用 UnoCSS 类名
- ❌ 在组件中直接操作 DOM，使用 React ref
- ❌ 忽略 TypeScript 错误 (`@ts-ignore`)

---

## 3. 实现架构

涉及接入的平台可能较多，助手接入采用插件设计模式(可参考https://github.com/clawdbot/clawdbot项目的实现方式)，每个平台通过插件实现消息接入和转化的，我以telegram为例，画出大概的流程

用户在telegram中发送消息给个人助手机器人->aion中集成telegram的机器人，通过hook获取消息->转发给agent->LLM处理返回消息->通过telegram机器人推送->telegram

### 3.1 分层架构

```
┌─────────────────────────────────────────────────────────┐
│                    用户界面 (UI)                         │
│  React 组件 / Hooks / Context                           │
└─────────────────────┬───────────────────────────────────┘
                      │ IPC Bridge
┌─────────────────────▼───────────────────────────────────┐
│                   主进程 (Main)                          │
│  Bridge → Service → Database / External API             │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│              数据层 (Data)                               │
│  SQLite / LocalStorage / External Services              │
└─────────────────────────────────────────────────────────┘
```

### 3.2 需要修改/新增的文件

**主进程 (src/process/)**

| 文件路径 | 操作                | 说明 |
| -------- | ------------------- | ---- |
|          | [ ] 新增 / [ ] 修改 |      |

**渲染进程 (src/renderer/)**

| 文件路径 | 操作                | 说明 |
| -------- | ------------------- | ---- |
|          | [ ] 新增 / [ ] 修改 |      |

**共享模块 (src/common/)**

| 文件路径 | 操作                | 说明 |
| -------- | ------------------- | ---- |
|          | [ ] 新增 / [ ] 修改 |      |

**类型定义 (src/types/)**

| 文件路径 | 操作                | 说明 |
| -------- | ------------------- | ---- |
|          | [ ] 新增 / [ ] 修改 |      |

### 3.3 IPC 通信设计

如需新增 IPC 通道，遵循以下模式：

```typescript
// src/process/bridge/[功能]Bridge.ts
import { bridge } from '@anthropic/platform';

export const [功能名] = {
  // Provider 模式: 请求-响应 (类似 HTTP 请求)
  [方法名]: bridge.buildProvider<TResponse, TParams>('[通道名]'),

  // Emitter 模式: 事件流 (用于流式数据)
  [事件名]: bridge.buildEmitter<TData>('[通道名].stream'),
};

// 使用示例:
// 渲染进程调用: const result = await [功能名].[方法名].request(params);
// 渲染进程监听: [功能名].[事件名].on((data) => { ... });
```

### 3.4 状态管理设计

- [ ] 使用现有 Context: **\*\*\*\***\_\_\_\_**\*\*\*\***
- [ ] 需要新增 Context: **\*\*\*\***\_\_\_\_**\*\*\*\***
- [ ] 仅组件内部状态 (useState/useReducer)
- [ ] 需要持久化存储

### 3.5 国际化 Key 设计

```json
// 添加到 src/renderer/i18n/locales/[lang].json
// Key 命名规范: [模块].[功能].[描述]

{
  "conversation.export.title": "导出对话",
  "conversation.export.success": "导出成功",
  "conversation.export.error": "导出失败"
}
```

**支持的语言文件:**

- `zh-CN.json` - 简体中文 (必须)
- `en-US.json` - English (必须)
- `zh-TW.json` - 繁體中文
- `ja-JP.json` - 日本語
- `ko-KR.json` - 한국어

---

## 4. 验收标准

### 4.1 功能验收

- [ ] [具体功能点 1]
- [ ] [具体功能点 2]
- [ ] [具体功能点 3]

### 4.2 边界情况

- [ ] [异常场景 1 的处理]
- [ ] [异常场景 2 的处理]

### 4.3 兼容性验收

- [ ] macOS 正常运行
- [ ] Windows 正常运行
- [ ] 深色模式显示正确
- [ ] 浅色模式显示正确
- [ ] 多语言切换正常

### 4.4 代码质量

- [ ] `npm run lint` 无错误
- [ ] `npm run build` 构建成功
- [ ] TypeScript 无类型错误
- [ ] 无 console.log 遗留

---

## 5. 参考资料

### 5.1 类似功能参考

参数https://github.com/clawdbot/clawdbot?tab=readme-ov-file仓库项目的实现

[列出项目中可参考的类似实现]

| 功能 | 文件路径 | 说明 |
| ---- | -------- | ---- |
|      |          |      |

### 5.2 依赖的现有模块

[列出需要调用的现有接口/组件/Hook]

| 模块 | 路径 | 用途 |
| ---- | ---- | ---- |
|      |      |      |

### 5.3 外部依赖

[如需引入新依赖，列出并说明理由]

| 依赖包 | 版本 | 用途 | 必要性说明 |
| ------ | ---- | ---- | ---------- |
|        |      |      |            |

### 5.4 特殊注意事项

[列出实现过程中需要特别注意的事项]

---

## 模板维护

- **创建日期**: 2025-01-27
- **适用版本**: AionUi v0.x+
- **维护者**: [项目团队]

如需更新模板，请同步修改本文件并通知团队成员。
