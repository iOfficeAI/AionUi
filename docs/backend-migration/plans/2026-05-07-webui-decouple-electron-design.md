# AionUi WebUI 脱 Electron 设计方案

- **日期**:2026-05-07
- **状态**:方案评审
- **范围**:仅设计,不含代码实现

> **后续更新 (2026-05-10):** M1-M9 已合入,本文中多次提到的 `AIONUI_BACKEND_ALLOW_MISSING` **过渡开关已全部移除**。`iOfficeAI/aionui-backend` 的 Release CI 已稳定(当前 `v0.1.0-preview-test`),`prepareAionuiBackend.js` 和 `pack-web-cli.js` 现在一律硬失败,不再写 skip manifest。本文档保留原文作为历史决策记录。清理详情见 `docs/backend-migration/handoffs/allow-missing-removal-outcome.md`。

## 背景

目前 AionUi 的 WebUI(`npm run webui` / `AionUi --webui`)虽然定位是"通过浏览器使用
AionUi",但实际仍然**深度依赖 Electron 主进程**:

- 入口在 `src/index.ts:172`:Electron 主进程检测 `--webui` 参数后调用
  `startWebServer()`(`src/process/webserver/index.ts:378`)
- `src/process/utils/webuiConfig.ts:7` 硬编码 `import { app } from 'electron'`,
  通过 `app.getPath('userData')` 读 WebUI 配置
- `src/preload/main.ts:45-49` 把 `webuiResetPassword` / `webuiChangePassword`
  通过 preload 暴露给 renderer,需要 IPC
- `src/process/backend/lifecycleManager.ts:10,30,99` 硬依赖 Electron `app`
  读版本号和 `isPackaged`
- `src/process/backend/binaryResolver.ts:42` 依赖 `process.resourcesPath`
  定位 bundled 的 aionui-backend 二进制

与此同时已具备三个关键前提:

1. **aionui-backend(Rust)已接管全部业务能力**:Phase 1 完成后,21 个业务模块的
   HTTP/WebSocket 接口已覆盖,前端 `httpBridge.ts` 作为 drop-in 替代替换了
   IPC bridge,`electron.vite` 的 renderer 产物已是纯 SPA。
2. **历史上的 standalone bun server 方案(`b157719a`)已被彻底清理**:那是
   在 TS 侧再跑一份业务后端的中间方案,Rust backend 就绪后废弃。本设计
   **绝不复活这条路径**。
3. **aionrs 已通过 Cargo git 依赖静态编译进 aionui-backend**:`aionui-backend`
   的 `Cargo.toml` 里以 `aion-agent`/`aion-types`/`aion-protocol`/`aion-config`/
   `aion-mcp` 形式引入 `aionrs`,运行期是 in-process Rust API 调用,没有任何
   子进程 spawn。因此 AionUi 仓库里的 `scripts/prepareAionrs.js` 与
   `electron-builder.yml` 的 `bundled-aionrs` 配置均为**遗留代码**,
   本次重构一并清理。

**本次目标**:借助前后端拆分重构窗口,**一次性**把 WebUI 从 Electron 抽出,
做成共享核心 + 双壳架构;桌面 `--webui` 和新的 `aionui-web` 都调用同一份 host,
`src/process/webserver/` 随本次重构一并退役。**不分期,不保留过渡态**。

## 核心原则

- **`@aionui/web-host` 零 Electron 依赖** —— 否则多一层封装也会把今天的困境
  再带回来
- **业务逻辑只留在 aionui-backend(Rust)里** —— web-host 只做"拉起 backend +
  serve 静态资源 + WebUI 认证",不再塞任何业务代码,杜绝 standalone 复活
- **三条 WebUI 路径共用一份 host** —— `aionui-web start`、`AionUi --webui`、
  桌面 GUI 开关都调同一个 `startWebHost()`,只是 `backend` 参数不同
  (ownBackend / useExistingBackend)
- **前端产物双壳共用** —— `out/renderer/` 同一份,桌面 IPC 和 host 的静态服务
  都 serve 它
- **一次性替换** —— 本方案落地后 `src/process/webserver/` 直接删除
- **backend 是硬依赖,不可降级** —— 没有 aionui-backend 就没有 AionUi,
  打包阶段下载失败**默认立即失败**,而不是静默跳过。
  aionrs 的"静默跳过 + PATH fallback"不再是有效参照(已不再使用)
  - 过渡期(backend Release CI 尚未稳定):用
    `AIONUI_BACKEND_ALLOW_MISSING=1` 环境变量软化为警告,仅在 feature 分支
    CI 开启,main 分支保持硬失败(详见改造要点 F1)
- **测试环境可以完全不依赖 backend 二进制** —— web-host 和 web-cli 的
  单元/集成测试全部 mock backend,CI 第一天就能跑通;只有 E2E 才需要真 backend,
  dev 模式下 resolver 支持 `cargo install` / `AIONUI_BACKEND_BIN` /
  兄弟目录 `../aionui-backend/target/release/` 三种来源

## 目标形态

### 分层架构(谁 import 谁)

```
┌──────────────────────────────────────────────────────────────────┐
│ aionui-backend  (Rust, 独立二进制, 本仓库外编译,CI 时下载)        │
│ • 所有业务 HTTP/WebSocket API                                    │
│ • 由 web-host 的 backend-launcher spawn                          │
└──────────────────────────────────────────────────────────────────┘
                              ▲ HTTP /api + WS /ws
                              │  (spawn + health check + restart)
┌──────────────────────────────────────────────────────────────────┐
│ @aionui/web-host  (核心, 纯 Node, 零 Electron 依赖, workspace pkg)│
│ • backend-launcher:  spawn 或复用已有 backend 端口                │
│ • static-server:     serve out/renderer + 反代 /api /ws           │
│ • auth:              密码 / bcrypt / 限流 / resetpass             │
│ • 对外接口:          startWebHost(opts) → WebHostHandle          │
└──────────────────────────────────────────────────────────────────┘
             ▲                                    ▲
             │ import                             │ import
             │                                    │
┌────────────┴─────────────┐        ┌─────────────┴────────────────┐
│ packages/web-cli         │        │ packages/desktop             │
│ (GitHub Release tarball) │        │ (AionUi.dmg/.exe/.AppImage)  │
│ • aionui-web start       │        │ • Electron 主进程             │
│ • aionui-web resetpass   │        │ • 桌面 IPC 链路(现状保留)   │
│ • aionui-web status      │        │ • 启动 backend 子进程          │
│ • 解压即用,无需装 Node  │        │   (BackendLifecycleManager)  │
└──────────────────────────┘        └──────────────────────────────┘
```

### 三条 WebUI 启动路径(同一份 web-host 代码)

```
路径①  aionui-web start                (纯 Node 壳)
       ──> startWebHost({ backend: { kind: 'ownBackend' } })
           • host 自己 spawn aionui-backend

路径②  AionUi --webui                  (Electron 无头模式)
       ──> startWebHost({ backend: { kind: 'ownBackend' } })
           • host 自己 spawn aionui-backend
           • Electron 主进程不开 BrowserWindow
           • 功能等同路径①,只是宿主不同

路径③  桌面 IPC + 设置页 WebUI 开关    (运行时动态)
       桌面 IPC 已启动 → backend 已由 Electron spawn
       用户点 Switch → webui.start IPC handler
       ──> startWebHost({ backend: { kind: 'useExistingBackend',
                                     port: currentBackendPort } })
           • host 复用已有 backend,不重复 spawn
           • 桌面和浏览器同时可用
           • Switch 关 → handle.stop() 只停 host,backend 继续服务桌面
           • app 启动时从 webui.desktop.enabled 自动恢复
```

用户场景对应分发物:

| 用户类型                                  | 拿到什么                                                                                                                                | 用 WebUI 怎么操作                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 纯桌面党                                  | `AionUi.dmg/.exe/.AppImage`                                                                                                             | 现状不变,走 IPC                                                                                              |
| 桌面党 + 偶尔 WebUI                       | `AionUi.dmg`(内置 host,无需额外安装)                                                                                                    | **三种方式任选**:①正常启动后在"设置 → WebUI"页点开关;②启动时加 `--webui` 无头跑;③上次开过会 app 启动自动恢复 |
| 无桌面 Linux 服务器 / Termux / 纯浏览器党 | 从 GitHub Release 下载 `aionui-web-{platform}-{arch}.tar.gz`,或 `curl -fsSL …/releases/latest/download/install-web.sh \| bash` 一键脚本 | 解压后运行 `./aionui-web start --remote`                                                                     |

**桌面 GUI 开关路径的要点**(现状):

- `WebuiModalContent.tsx` 设置页有一个 `Switch`,调 `webui.start` / `webui.stop`
  bridge 动态启停
- 状态持久化到 `webui.desktop.enabled` / `webui.desktop.allowRemote` 配置项
- app 启动时 `restoreDesktopWebUIFromPreferences()` 读配置,上次开着就自动拉起
- **此时 Electron 主进程同时跑"桌面 IPC + WebUI host"**,桌面和浏览器都能用
- 本方案必须继续支持这种运行时动态开关的能力,而不是只能启动时决定

## 仓库组织:Monorepo workspace(单仓库)

`@aionui/web-host` **不是独立仓库**,而是 AionUi 主仓库下的 workspace 子包。
当前仓库是单包结构,本方案包含一次性 workspace 改造:

```
AionUi/                              ← 还是这一个仓库
├── package.json                     (根, workspaces 声明, 不含应用 deps)
├── packages/
│   ├── web-host/                    ← 核心包, npm 名: @aionui/web-host
│   │   ├── src/
│   │   │   ├── backend-launcher.ts  ← 脱 Electron 的 lifecycle
│   │   │   ├── static-server.ts     ← serve out/renderer + 反代
│   │   │   ├── auth/                ← 密码 / bcrypt / 限流
│   │   │   ├── types.ts             ← AppMetadata / BackendBinaryResolver
│   │   │   └── index.ts             ← 导出 startWebHost / resetPassword
│   │   └── package.json             (private: true, 不单独发布)
│   ├── web-cli/                     ← 通过 GitHub Release tarball 分发
│   │   ├── src/
│   │   │   ├── cli.ts               ← start / resetpass / status
│   │   │   └── resolveBackendBinary.ts
│   │   ├── bin/aionui-web           ← dev 入口
│   │   └── package.json             (private: true, 不发 npm)
│   ├── shared-scripts/              ← 抽出的共享构建脚本
│   │   └── prepare-aionui-backend.js  ← 从现有 scripts/prepareAionuiBackend.js 提取
│   └── desktop/                     ← 现有 src/ 整体迁入
│       ├── src/
│       │   ├── process/
│       │   ├── renderer/             ← 前端源码,两壳共享构建产物
│       │   ├── preload/
│       │   └── ...
│       ├── electron.vite.config.ts  ← 从仓库根迁入
│       ├── electron-builder.yml     ← 从仓库根迁入(关键)
│       └── package.json             (声明 @aionui/web-host, 不声明 web-cli)
└── scripts/
    └── build-with-builder.js        (cd packages/desktop 再调 electron-builder)
```

**选 Monorepo 的理由**:

- 前端代码必须两壳共享,独立仓库版本同步会很痛
- `@aionui/web-host` 要吸收现有 `src/process/webserver/` 和
  `src/process/backend/`,同仓 `git mv` 最便捷
- CI、版本、发布集中管理,桌面 dmg 和 `aionui-web` 同一个 tag 同时出
- aionui-backend(Rust)已经独立在外,再拆 host 会把版本同步复杂度
  推高到四个仓库

**关键:两壳的打包产物必须互不污染**。如果不做隔离,electron-builder 会因为
扫描仓库根 `package.json` 和 hoisted 的 `node_modules` 把 `web-cli` 的
代码也吸进 dmg/exe。解决方式是**把 electron-builder 相关配置和入口完整
迁入 `packages/desktop/`**:

- `electron-builder.yml` 从仓库根迁入 `packages/desktop/electron-builder.yml`
- `electron.vite.config.ts` 从仓库根迁入 `packages/desktop/`
- `packages/desktop/package.json` **只声明实际用到的依赖**(含
  `"@aionui/web-host": "workspace:*"`,**不含 `@aionui/web-cli`**)
- `scripts/build-with-builder.js` 改为 `cd packages/desktop && electron-builder ...`
- electron-builder 从 `packages/desktop/package.json` 解析依赖图,
  `@aionui/web-cli` 自然不在图内,不会被打入

这样桌面产物(dmg/exe)和 aionui-web tarball 走两条完全独立的 CI pipeline,
产物零重叠。**monorepo 改造前一定要先搭一版最小可跑的 workspace skeleton
验证这个隔离是否生效**(用 `dmg dump` / `asar list` 抽查产物确认无 web-cli
代码残留)。

**分发方式**:

- **桌面**(`AionUi.dmg/.exe/.AppImage`):electron-builder 流程入口从仓库根
  迁到 `packages/desktop/`,`aionui-backend` 二进制通过 `extraResources` 打入
- **aionui-web**:**GitHub Release tarball 分发**,与 AionUi 桌面同一个 release
  同 tag 同时出,不发 npm、不占用新域名、不开新账号
  - Artifact 命名:`aionui-web-v1.x.x-linux-x86_64.tar.gz` 等
  - Tarball 内容:`aionui-web`(单文件可执行)+ `aionui-backend` + `renderer/`
  - 可执行用 `bun build --compile` 打单文件,用户无需本地 Node/Bun
  - 一键脚本 `install-web.sh` 作为 **Release Asset**(与 tarball 同 release 发布),
    使用方式:
    ```bash
    # 安装 latest
    curl -fsSL https://github.com/iOfficeAI/AionUi/releases/latest/download/install-web.sh | bash
    # 安装特定版本(版本可追溯、可回滚)
    curl -fsSL https://github.com/iOfficeAI/AionUi/releases/download/v1.5.0/install-web.sh | bash
    ```

**backend 二进制策略**:**不使用 npm `@aionui/backend-binary-*` 包**,
也不使用 postinstall 下载。桌面和 aionui-web 各自在**CI 打包阶段**从
`iOfficeAI/aionui-backend` 的 GitHub Release 下载对应平台二进制塞进分发物。

- 桌面:`scripts/prepareAionuiBackend.js` 在 electron-builder 打包前按目标
  平台下载,通过 `extraResources` 打入 dmg/exe。**注:该脚本当前未接入打包流程
  (见"风险与应对"表),本方案顺手接入;下载失败直接 fail 整个构建**
- aionui-web:CI 打 tarball 时直接下载 backend 塞进去,失败即 fail 构建
- 失败策略统一为**硬失败**,不静默跳过,不 PATH fallback

## 关键接口抽象

### 1. `AppMetadata`(替代 Electron `app` 引用)

```ts
// packages/web-host/src/types.ts
export type AppMetadata = {
  version: string;
  isPackaged: boolean;
  resourcesPath: string; // 定位 bundled 资源(如 SPA 产物)
  userDataPath: string; // WebUI 配置 / 密码落盘位置
};
```

- **Electron 壳注入**:`{ version: app.getVersion(), isPackaged: app.isPackaged,
resourcesPath: process.resourcesPath, userDataPath: app.getPath('userData') }`
- **Node 壳注入**:从自身 package.json 读 version;
  `resourcesPath = path.join(__dirname, '../resources')`;
  `userDataPath = env.AIONUI_HOME || XDG/AppData` 标准路径

### 2. `BackendBinaryResolver`

```ts
export type BackendBinaryResolver = () => string; // 绝对路径
```

web-host 本身不知道 backend 放哪,由两个壳各自**注入** resolver 给
`startWebHost({ backend: { kind: 'ownBackend', resolveBackend } })`。
Resolver 按 `AppMetadata.isPackaged` 区分严格与宽松两档查找顺序:

**生产模式(`isPackaged: true`)—— 只查打包产物**:

- **Electron 壳**:`process.resourcesPath/bundled-aionui-backend/{platform}-{arch}/aionui-backend[.exe]`
- **Node 壳**:tarball 同级目录下的 `aionui-backend[.exe]`
- 查不到 → **直接报错退出**,不 fallback 到 PATH 或 env(避免用到用户本机
  的旧版本)

**开发模式(`isPackaged: false`)—— 允许 fallback**:

1. `--backend-bin <path>`(命令行参数,仅 Node 壳)
2. `AIONUI_BACKEND_BIN` 环境变量(双壳都支持)
3. 仓库根 `../aionui-backend/target/release/aionui-backend[.exe]`
   (指向兄弟目录的 cargo build 产物,开发者常用)
4. 系统 `PATH`(`which` / `where`)—— 指向 `cargo install aionui-backend` 产物
5. 全部未命中 → 报错并提示:`请运行 'cd ../aionui-backend && cargo install
--path crates/aionui-app',或设置 AIONUI_BACKEND_BIN`

两档实现都放在:

- Electron 壳:`packages/desktop/src/process/backend/binaryResolver.ts`
- Node 壳:`packages/web-cli/src/resolveBackendBinary.ts`

桌面 IPC 模式下 Electron 主进程也调同一个 resolver + 同一份
`packages/web-host/src/backend-launcher.ts`,不再维护"Electron 版 lifecycle"。

> ⚠️ **查找顺序的权威来源是 UC-2**。M4/M7/M8/M9 的 requirements 文档在引用
> 时必须原样抄,不得简化为 `bundled → env → PATH` 之类的扁平描述。

### 3. `startWebHost(opts)`(web-host 唯一对外入口)

```ts
export type WebHostOptions = {
  app: AppMetadata;
  staticDir: string; // 指向 out/renderer
  port?: number; // 默认 25808,占用自动 +1
  allowRemote?: boolean; // --remote:0.0.0.0 vs 127.0.0.1
  dataDir?: string;
  logDir?: string;
  /**
   * Backend 接入方式:二选一
   * - `ownBackend`: host 自己拉起 backend 子进程(aionui-web 和 --webui 模式)
   * - `useExistingBackend`: 复用已有 backend 实例(桌面 IPC 模式下开 GUI 开关时)
   */
  backend: { kind: 'ownBackend'; resolveBackend: BackendBinaryResolver } | { kind: 'useExistingBackend'; port: number };
};

export type WebHostHandle = {
  port: number;
  backendPort: number;
  url: string;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  initialPassword?: string; // 首次启动时返回自动生成的密码
  stop: () => Promise<void>; // 运行时停止(GUI 开关关闭时调用)
};

export async function startWebHost(opts: WebHostOptions): Promise<WebHostHandle>;
export async function resetPassword(opts: { app: AppMetadata }): Promise<string>;
```

**三种调用方式**:

1. **aionui-web CLI**:`kind: 'ownBackend'`,host 拉起 backend,CLI 进程生命周期
   等于 host 生命周期
2. **桌面 `--webui` 无头模式**:`kind: 'ownBackend'`,host 拉起 backend,
   Electron 主进程不开窗口
3. **桌面 IPC + GUI 开 WebUI**:`kind: 'useExistingBackend'`,复用桌面 IPC 模式
   已经拉起的 backend 实例。GUI 开关 off 时调用 `handle.stop()`,只关 web host,
   backend 继续服务桌面 IPC 链路

## 统一约束补充(锁死关键决策,后续里程碑不得偏离)

本节集中锁定三个跨里程碑的决策,避免在 M4/M5/M6/M8/M9 中被重新解读或"统一简化"。

### UC-1:install-web.sh 的脚本语言与执行方式(锁死)

- **脚本语言**:Bash(不是 POSIX sh,不是 plan-writer 自选)
- **shebang**:`#!/usr/bin/env bash`
- **用户安装命令**(用 `| bash` 而非 `| sh`):

  ```bash
  curl -fsSL https://github.com/iOfficeAI/AionUi/releases/latest/download/install-web.sh | bash
  curl -fsSL https://github.com/iOfficeAI/AionUi/releases/download/v1.x.x/install-web.sh | bash
  ```

- 所有文档(设计文档、M8、M9、README、wiki)必须统一为 `| bash`,**禁止用
  `| sh`**。因为 `| sh` 会被 `/bin/sh` 解释,shebang 被忽略,Bash 语法直接
  报错

### UC-2:`BackendBinaryResolver` 查找顺序(按 `isPackaged` 分档)

以下规则是全局硬性约束,**M4、M7、M8、M9 的需求文档都必须原样引用,不得
"简化"为扁平的 `bundled → env → PATH`**:

- **生产模式(`isPackaged: true`)—— 只查打包产物**:
  - **Electron 壳**:`process.resourcesPath/bundled-aionui-backend/{platform}-{arch}/aionui-backend[.exe]`
  - **Node 壳(aionui-web)**:tarball 同级目录下的 `aionui-backend[.exe]`
  - 查不到 → **直接报错退出**,不 fallback 到 PATH 或 env
  - 理由:避免用到用户机器上残留的旧版本 backend,违背安全边界

- **开发模式(`isPackaged: false`)—— 允许 fallback**:
  1. `--backend-bin <path>`(命令行参数,仅 Node 壳)
  2. `AIONUI_BACKEND_BIN` 环境变量(双壳都支持)
  3. 仓库根 `../aionui-backend/target/release/aionui-backend[.exe]`
  4. 系统 `PATH`
  5. 全部未命中 → 报错并提示 `cd ../aionui-backend && cargo install --path crates/aionui-app`

### UC-3:Auth 公共接口契约(M3 必须锁定,M4-M6 不得破坏)

以下是 `@aionui/web-host` 对外暴露的 auth 能力,M3 必须全部在 `types.ts` 中
声明签名(即使实现是空 `throw new Error('not implemented yet')`),后续里程碑
不得新增、破坏性修改这些函数:

```ts
// packages/web-host/src/auth/index.ts

/** 重置密码(供 CLI --resetpass / 桌面 GUI "重置密码"按钮) */
export function resetPassword(opts: { app: AppMetadata }): Promise<string>;

/** 修改密码(供桌面 GUI webuiChangePassword IPC) */
export function changePassword(opts: { app: AppMetadata; oldPassword: string; newPassword: string }): Promise<void>;

/** 验证密码(供 /api/auth/login 内部) */
export function verifyPassword(opts: { app: AppMetadata; password: string }): Promise<boolean>;

/** 读取 WebUI config(密码 hash、限流状态等) */
export function loadConfig(opts: { app: AppMetadata }): Promise<WebUIConfig>;

/** 写入 WebUI config */
export function saveConfig(opts: { app: AppMetadata; config: WebUIConfig }): Promise<void>;
```

`WebUIConfig` 的 schema 与老 `webui.config.json` 完全一致,M5 迁移时保持
不变。

Electron 壳的 preload IPC `webuiResetPassword` / `webuiChangePassword` 底层
调用上述函数;对前端 renderer 完全透明。

## 改造要点(一次性落地)

### A. `lifecycleManager` 脱 Electron 并迁入 web-host

- `src/process/backend/lifecycleManager.ts` → `packages/web-host/src/backend-launcher.ts`
- 移除 `import { app } from 'electron'`,改为构造时注入 `AppMetadata`
- **桌面三种模式都调同一份 backend-launcher**,不再维护 Electron 专属实现:
  - **桌面 IPC 模式**:Electron 主进程启动时,直接 `import` web-host 的
    backend-launcher,注入 `AppMetadata` 和桌面版 `BackendBinaryResolver`,
    启动 backend(等同现在 `BackendLifecycleManager` 的角色,只是代码位置变了)
  - **桌面 `--webui` 模式**:通过 `startWebHost({ kind: 'ownBackend' })`
    间接用同一份 backend-launcher
  - **桌面 GUI 开关**:不启新 backend,只把桌面 IPC 模式下已启动的 backend
    端口传给 `startWebHost({ kind: 'useExistingBackend', port })`
- **Node 壳**:通过 `startWebHost({ kind: 'ownBackend' })` 用同一份 backend-launcher,
  注入 Node 版 resolver

### B. `webuiConfig` 脱 Electron 并迁入 web-host

- `src/process/utils/webuiConfig.ts` 中 `app.getPath('userData')` 改为从
  `AppMetadata.userDataPath` 获取
- 整体迁入 `packages/web-host/src/auth/config.ts`,**保持配置文件名、schema、
  磁盘路径完全不变**,避免迁移既有用户数据

### C. 静态服务与反代(`packages/web-host/src/static-server.ts`)

**选型**:Node 原生 `http` + `serve-handler`

- web-host 必须零业务依赖,Express / Hono 会拖入冗余 middleware
- `serve-handler`(vercel/serve 所用)单依赖,自带 SPA fallback、MIME、ETag

**路由规则**:

- `/api/*` → 反代到 `aionui-backend` 端口(避免浏览器跨源 + Cookie 同源)
- `/ws` upgrade → 反代到 backend WebSocket(手写 `request('upgrade')` +
  双向 pipe,不引新依赖)
- 其他请求 → serve `out/renderer/`;404 fallback 到 `index.html`(支持
  client-side routing)

### D. WebUI 认证模块外提(`packages/web-host/src/auth/`)

从 `src/process/bridge/webuiQR.ts` 和 preload IPC handlers
(`webui-direct-reset-password`、`webui-direct-change-password`)中提取:

- bcrypt 密码持久化(落盘到 `userDataPath/webui.config.json`)
- 登录接口 `/api/auth/login` 与 session cookie
- `resetPassword(opts)` 供 CLI 和桌面壳共用
- 登录限流(5 次 / 15 分钟)

桌面 GUI 修改密码的 preload IPC(`webuiChangePassword`)保留薄一层接口,
底层调 `@aionui/web-host` 的 auth 模块,不做双写。

### E. Electron 壳的两条 WebUI 路径改造

**E1. `--webui` 无头模式**(启动参数):

`packages/desktop/src/index.ts`(原 `src/index.ts`)中 `isWebUIMode` 分支改写为:

```ts
if (isWebUIMode) {
  const { startWebHost } = await import('@aionui/web-host');
  const handle = await startWebHost({
    app: {
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      userDataPath: app.getPath('userData'),
    },
    backend: { kind: 'ownBackend', resolveBackend: electronBackendResolver },
    staticDir: path.join(process.resourcesPath, 'renderer'),
    allowRemote: hasSwitch('remote'),
    port: parsePort(),
  });
  console.log(`[AionUi WebUI] ${handle.url}`);
  // Electron 主进程保持存活但不打开 BrowserWindow,充当无头宿主(与现状一致)
  return;
}
```

**E2. 桌面 IPC + GUI 开关**(运行时动态启停):

现状:`WebuiModalContent.tsx:261,306` 调 `webui.start.invoke()` /
`webui.stop.invoke()`,底层是 `src/process/webserver/` 的 `startWebServerWithInstance`
/ `stopWebServer`。本方案改造:

- `webui.start` / `webui.stop` IPC bridge 接口**保留不动**(前端无感知)
- 底层实现从"调用 `src/process/webserver/` 内置 express"改为"**调用
  `@aionui/web-host` 的 `startWebHost({ kind: 'useExistingBackend', port: currentBackendPort })`**"
- `webui.start` handler 里存住返回的 `WebHostHandle`(全局 singleton),
  `webui.stop` 调 `handle.stop()`
- `src/process/utils/webuiConfig.ts:88 restoreDesktopWebUIFromPreferences`
  的自动恢复**编排逻辑保留在桌面壳内**(不迁入 web-host),内部改为调
  `@aionui/web-host` 的 `startWebHost({ kind: 'useExistingBackend', ... })`。
  `webui.desktop.enabled` 是桌面壳专属偏好,不污染 web-host 的通用能力
- **桌面 backend 已由 `BackendLifecycleManager` 启动并持有端口**,GUI 开 WebUI
  时 host 直接复用这个端口,不另起 backend 子进程

**关键:同一 `@aionui/web-host` 代码覆盖三个运行路径**:
| 路径 | backend 参数 | 触发方式 |
|---|---|---|
| `aionui-web start` | `ownBackend` | CLI 启动 |
| `AionUi --webui` | `ownBackend` | Electron 无头 |
| 桌面 GUI 开关 | `useExistingBackend` | 运行时动态 |

### F. `src/process/webserver/` 退役

整个目录本次重构中直接删除,不保留过渡态。其中所有行为已被
`@aionui/web-host` 覆盖,无需回迁。

### F1. 测试环境与 backend 未就绪过渡期

aionui-backend(Rust)的 Release CI 仍在开发中,本方案落地阶段**不能硬依赖
一个稳定的 backend release**。按测试层级分策略:

**层 1:web-host / web-cli 单元与集成测试 —— 完全 mock,不依赖真 backend**

web-host 职责有限(backend-launcher、static-server、auth),每块都能 mock:

- `backend-launcher.test.ts`:mock `node:child_process.spawn` 和 `/health` fetch,
  验证参数构造、启停流程、crash 重启
- `static-server.test.ts`:起一个 mock HTTP server 假装是 backend,验证 SPA
  fallback、`/api` 和 `/ws` 反代
- `auth.test.ts`:纯 I/O 测试,bcrypt / 限流 / session,全不碰 backend

CI 从第一天起就能跑通这层,不需要 backend 任何产物。

**层 2:E2E 测试 —— 需要真 backend,但来源灵活**

E2E(`aionui-web start` + 浏览器登录对话全链路 / 桌面 GUI 开关) 需要真 backend。
dev 模式下的 resolver 允许三种来源,按就近原则选一个:

- 开发机:`cargo install` 到 PATH,一劳永逸
- CI:job 里加一步 `cargo install --git https://github.com/iOfficeAI/aionui-backend`
  或从 Release 手动下载
- 临时绕过:`AIONUI_BACKEND_BIN=/path/to/bin`

待 aionui-backend Release CI 稳定后,E2E job 改为从 Release 下载二进制
(与打包 pipeline 一致)。

**层 3:打包 CI —— 过渡期软化开关**

本方案原则是"backend 下载失败即打包失败",但在 backend CI 稳定前,feature
分支上这个硬失败会让本方案开发被阻塞。引入**过渡期开关**:

- `AIONUI_BACKEND_ALLOW_MISSING=1` 时,`prepareAionuiBackend.js` 下载失败只
  `console.warn` 不抛错,产出的 dmg/exe/tarball 里 backend 占位(可以是
  `manifest.json` 写 `skipped: true`,与现在 aionrs 的行为一致)
- **默认关闭**,只在明确需要的分支/job 里开启
- backend Release CI 稳定后,全仓搜 `AIONUI_BACKEND_ALLOW_MISSING` 删干净

这样:

- **本方案开发期**(backend CI 不稳):feature 分支 CI 打 `ALLOW_MISSING=1`,
  能出 tarball 做手动冒烟
- **本方案合入 main 时**:关掉 `ALLOW_MISSING`,CI 必须拿到可用 backend 才放行
- **后续常态**:`ALLOW_MISSING` 开关代码一并删除,回到硬失败策略

### G. aionui-web 的 GitHub Release 打包流程

**目标产物**:每次 AionUi 发版时,与桌面 dmg/exe 同一个 release 同时出:

```
aionui-web-v1.x.x-linux-x86_64.tar.gz
aionui-web-v1.x.x-linux-aarch64.tar.gz
aionui-web-v1.x.x-darwin-arm64.tar.gz
aionui-web-v1.x.x-darwin-x86_64.tar.gz
aionui-web-v1.x.x-win32-x64.zip
```

每个 tarball 结构:

```
aionui-web-v1.x.x-linux-x86_64/
├── aionui-web              (bun build --compile 单文件可执行)
├── aionui-backend           (Rust 二进制)
├── renderer/                (SPA 产物,与桌面同一份 out/renderer 产物)
│   ├── index.html
│   └── assets/
└── README.md                (快速上手)
```

**CI 流程**(新增,或并入 `_build-reusable.yml`):

1. 在矩阵里扩展 `platform × arch` 维度
2. 每个 matrix 跑:
   - `bun run build:renderer`(复用桌面同一份 SPA 产物)
   - `packages/shared-scripts/prepare-aionui-backend.js` 下载对应平台的 backend
     二进制(**失败即 fail,不静默跳过**)
   - `bun build --compile --target=bun-{platform}-{arch} packages/web-cli/src/cli.ts --outfile aionui-web`
   - 组装目录并 `tar czf aionui-web-v1.x.x-{platform}-{arch}.tar.gz`
   - `actions/upload-artifact` 上传到 release

**一键安装脚本**:`scripts/install-web.sh` 放仓库中(便于源码审计与维护),
但实际分发走 **GitHub Release Asset**:

- CI 在打 release 时把该脚本作为 asset 上传到同一 release
- 推荐 URL:`https://github.com/iOfficeAI/AionUi/releases/latest/download/install-web.sh`
- 支持锁版本:`https://github.com/iOfficeAI/AionUi/releases/download/v1.x.x/install-web.sh`
- 脚本内部硬编码所在 release 的版本号,保证 v1.5.0 的 install.sh 装的一定是
  v1.5.0 的 tarball(避免脚本改了但老版本 artifact 装不上的倒挂问题)
- 支持 `-s -- --version v1.4.0` 参数让 latest 脚本能装指定版本
- 支持 `-s -- --mirror <url>` 让企业内部镜像场景能用

脚本内部逻辑:检测 `uname -sm` → 选对应 tarball → 从 Release 下载到
`~/.local/share/aionui-web/` 或 `/usr/local/bin/` → 打印启动提示。
参考 bun / deno / rustup 的 install.sh 套路。

**选 Release Asset 不选 GitHub Raw 的理由**:

- 版本可追溯:每个 release 带着当时的 install.sh,永久可回滚
- 与 tarball 同 release 发布,心理模型一致
- 老版本 tarball 假设(文件名、结构、环境变量)不会被后来的脚本改动打破
- CI 一次性产出,无需额外的同步机制

**桌面打包 bug 修复**(本次顺手):
`scripts/build-with-builder.js:460` 附近补上 `prepareAionuiBackend()` 调用
(脚本存在但从未被调用,导致桌面 dmg/exe 的 `resources/bundled-aionui-backend/`
为空)。下载失败直接让 `bun run build` 以非零退出码终止,避免产出缺失 backend
的 dmg/exe。

**`prepareAionuiBackend.js` 重构要点**:

- 抽到 `packages/shared-scripts/prepare-aionui-backend.js`,导出可参数化的
  `prepareBackend({ targetDir, platform, arch, version })`
- **默认失败处理语义改为硬失败**:任何下载/解压失败都抛错,不再写
  `skipped: true` 的 manifest
- **过渡期开关**:`AIONUI_BACKEND_ALLOW_MISSING=1` 时降级为警告 + 写
  `skipped: true` manifest,用于 backend Release CI 尚未稳定阶段的 feature
  分支 CI。backend CI 稳定后必须删除此开关
- 桌面打包和 aionui-web CI 流程共用此函数

**aionrs 遗留代码清理**(本次一并处理):

- 删除 `scripts/prepareAionrs.js`
- 从 `scripts/build-with-builder.js` 移除 `prepareAionrs()` 调用
- 删除 `electron-builder.yml:108-110` 的 `bundled-aionrs` extraResources 配置
- 清理 `.gitignore:202` 的 `resources/bundled-aionrs` 条目
- 删除 `_build-reusable.yml:30` 的 `AIONRS_VERSION` 环境变量

**CI 与发布节奏**:aionui-web 作为 AionUi release 的附属产物,版本号完全与
AionUi 对齐,不存在独立版本管理。`AIONUI_BACKEND_VERSION` 一个变量同时控制
桌面和 aionui-web 的 backend 版本,每次 AionUi 发版时显式锁定,避免
"latest" 飘移。

**不选 npm 的理由**:

- 无需新开 npm 组织/账号,维护成本更低
- aionui-web 本质是 CLI + 二进制组合,GitHub Release tarball 更自然
- npm postinstall 下载 backend 的方式在 Windows / 弱网环境下体验差
- 现有 `build-and-release.yml` / `prepare-release-assets.sh` /
  `verify-release-assets.sh` 已成熟,直接扩展即可
- 未来如果有 Node 生态嵌入需求(例如 `npx aionui-web`),可作为二期补充

## aionui-web CLI 设计

**可执行文件打包**:用 `bun build --compile --target=bun-{platform}-{arch}`
打单文件,tarball 里不带 Node/Bun runtime,用户解压即用。理由:

- AionUi 项目已经全仓用 bun(`package.json` / CI 的 `oven-sh/setup-bun`)
- Linux 服务器用户最不想"先装 Node 才能装我"
- 单文件体验参考 `bun`、`deno`、`rust` 工具链

```
./aionui-web start [options]
  --port <n>              默认 25808
  --remote                绑 0.0.0.0(等价现在 --webui --remote)
  --data-dir <path>
  --log-dir <path>
  --backend-bin <path>    覆盖 backend 二进制路径(开发期指向本地 cargo 产物)
  --no-open               不自动打开浏览器(服务器环境默认就是这个)

./aionui-web resetpass     强制重置管理员密码
./aionui-web status        打印运行实例端口 / backend 状态
./aionui-web --version
```

启动流程:

1. 解析参数,构造 `AppMetadata`(从编译时嵌入的版本号读 version)
2. 解析 backend 二进制:tarball 同级目录 → `--backend-bin` →
   `AIONUI_BACKEND_BIN` → 全部未命中报错退出
3. 调 `startWebHost(opts)` 取得 `{ port, url }`
4. 打印登录信息(默认用户名 `admin`,首次启动输出自动生成的密码)
5. 本地环境可选 `open` 浏览器;服务器环境直接打印 URL
6. 监听 SIGINT / SIGTERM,优雅关闭 backend 子进程

## 关键文件清单

| 路径                                       | 处置                                                                                                                                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 全仓                                       | 根 `package.json` 只保留 `workspaces` 和跨包脚本,应用 deps 迁到各 workspace;现有 `src/` 迁至 `packages/desktop/src/`                                                                                                         |
| 根 `electron-builder.yml`                  | 迁入 `packages/desktop/electron-builder.yml`(防止扫到 web-cli)                                                                                                                                                               |
| 根 `electron.vite.config.ts`               | 迁入 `packages/desktop/electron.vite.config.ts`                                                                                                                                                                              |
| `src/index.ts:172-185`                     | 迁入 `packages/desktop/`,`isWebUIMode` 分支改调 `@aionui/web-host`                                                                                                                                                           |
| `src/process/webserver/`                   | **删除**,不保留                                                                                                                                                                                                              |
| `src/process/utils/webuiConfig.ts`         | `webui.config.json` 的读写 + bcrypt 逻辑迁入 `packages/web-host/src/auth/config.ts`(解除 Electron 依赖);`restoreDesktopWebUIFromPreferences` **不迁**,保留在桌面壳,内部改为调 `startWebHost({ kind: 'useExistingBackend' })` |
| `webui.start` / `webui.stop` IPC handler   | 底层实现改调 `@aionui/web-host`;bridge 接口保留,前端无感知;handler 里存 `WebHostHandle` 单例供 stop 调用                                                                                                                     |
| `src/process/bridge/webuiQR.ts`            | 认证逻辑迁入 `packages/web-host/src/auth/`;Electron 壳保留薄 wrapper                                                                                                                                                         |
| `src/process/backend/lifecycleManager.ts`  | 迁入 `packages/web-host/src/backend-launcher.ts`,构造注入 `AppMetadata`                                                                                                                                                      |
| `src/process/backend/binaryResolver.ts`    | 保持现有行为迁入 `packages/desktop/src/process/backend/binaryResolver.ts`,作为桌面壳注入给 web-host 的 resolver;Node 侧在 `packages/web-cli/src/resolveBackendBinary.ts` 另写一份,两者都实现 `BackendBinaryResolver` 接口    |
| `scripts/prepareAionuiBackend.js`          | 拆出核心函数到 `packages/shared-scripts/prepare-aionui-backend.js`;失败策略改为硬失败;桌面打包 pipeline 和 aionui-web tarball pipeline 共用(均为 CI 构建期调用,**无 postinstall**)                                           |
| `scripts/prepareAionrs.js`                 | **删除**(aionrs 已静态编译进 aionui-backend,二进制不再需要)                                                                                                                                                                  |
| `scripts/build-with-builder.js:460`        | 删除 `prepareAionrs()` 调用;新增 `prepareAionuiBackend()` 调用                                                                                                                                                               |
| `electron-builder.yml:108-110`             | 删除 `bundled-aionrs` 的 `extraResources` 条目                                                                                                                                                                               |
| `.gitignore:202`                           | 删除 `resources/bundled-aionrs` 条目                                                                                                                                                                                         |
| `.github/workflows/_build-reusable.yml:30` | 删除 `AIONRS_VERSION` 环境变量                                                                                                                                                                                               |
| `src/preload/main.ts:45-49`                | IPC handler 底层改调 `@aionui/web-host` auth 模块,对外接口保留                                                                                                                                                               |
| `src/common/adapter/httpBridge.ts`         | 不动                                                                                                                                                                                                                         |
| `src/common/platform/register-node.ts`     | 历史 standalone 遗留,已空,顺手清理                                                                                                                                                                                           |
| `package.json` scripts                     | `webui` / `webui:remote` 保留,内部调新路径;新增 `web-cli:dev` 等                                                                                                                                                             |

## 落地路径与里程碑

本方案涉及 10+ 个相互依赖的改造点,**绝不能一把梭在一条分支里**。拆成 9 个
里程碑,通过 **feature 分支链接力**(见 playbook 的"分支协作模型"节):

- **只动一个维度**(要么动结构、要么动代码、要么动配置,不混着改)
- **每个里程碑一条独立 feature 分支,push 到 origin 但不合回共享分支**
- **下一个里程碑从上一个的 feature 分支拉起,不等 PR review**
- **整条 9 里程碑链完成后,由人类统一决定如何合回 `feat/backend-migration`**
  (一次性 PR / 分段 PR,都是人类决策,不在 agent 执行范围)
- **前一步不回退后一步才能开始**(严格依赖顺序)
- **每步都有独立"现有功能不回退"的验证证据**

### 里程碑依赖图

```
M1 Monorepo skeleton
  ↓
M2 aionrs 遗留清理 (可与 M1 并行,但合入顺序 M1 → M2)
  ↓
M3 web-host skeleton + 单元测试骨架
  ↓
M4 backend-launcher 迁入 web-host + 桌面 IPC 接入
  ↓
M5 static-server + auth 迁入 web-host(老 webserver 并存)
  ↓
M6 三条路径切到 web-host + 删除老 webserver    ← 一次性切换,回滚代价最大
  ↓
M7 prepareAionuiBackend 接入桌面打包 + 过渡开关
  ↓
M8 web-cli + tarball CI
  ↓
M9 install-web.sh + Release Asset
```

### M1 的隐蔽风险:大量配置文件硬编码了 `src/` 路径

`src/` 不是孤立目录,它被仓库里 **12 大类配置文件**硬编码引用。M1 想一次性
把 `src/` 挪到 `packages/desktop/src/`,必须同步更新所有这些配置,**漏一个
就会一片红**。已盘点的清单:

| #   | 文件                                                                                        | 需要改什么                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `tsconfig.json`                                                                             | `paths` 里 `@/*` / `@process/*` / `@renderer/*` / `@worker/*` 的 `./src/*` → `./packages/desktop/src/*`;`include` / `exclude` 同步                                                                                                |
| 2   | `vitest.config.ts`                                                                          | 所有 alias(`@process/` / `@renderer/` / `@worker/` / `@mcp/`)的 `./src/*` → `./packages/desktop/src/*`;coverage `include` / `exclude` 里 `src/**` → `packages/desktop/src/**`                                                     |
| 3   | `electron.vite.config.ts`                                                                   | `@common` / `@renderer` / `@process` / `@worker` / `@xterm/headless` 的 `src/*` → `packages/desktop/src/*`;所有 `entry` 路径(`src/index.ts` / `src/preload/*` / `src/renderer/*.html`)同步;**此文件本身迁入 `packages/desktop/`** |
| 4   | `electron-builder.yml`                                                                      | `files` / `extraResources` glob;**此文件本身迁入 `packages/desktop/`**                                                                                                                                                            |
| 5   | `uno.config.ts`                                                                             | 扫描范围(content patterns)`src/**/*.tsx` → `packages/desktop/src/**/*.tsx`                                                                                                                                                        |
| 6   | `codecov.yml`                                                                               | `ignore` 里的 `src/index.ts` / `src/preload.ts` / `src/common/**` / `src/renderer/**` 全部加前缀                                                                                                                                  |
| 7   | `.oxlintrc.json`                                                                            | `src/agent/gemini/cli/` 之类的忽略路径                                                                                                                                                                                            |
| 8   | `.pre-commit-config.yaml`                                                                   | i18n hook 的 `files: ^src/renderer/services/i18n/locales/`                                                                                                                                                                        |
| 9   | `package.json`                                                                              | `scripts.test:bun` 里 `bun test src/process/.../*.bun.test.ts`;所有 `electron-vite dev` / `build` 相关脚本的工作目录改为 `cd packages/desktop && ...`                                                                             |
| 10  | `AGENTS.md`                                                                                 | 架构说明段落的 `src/process/` / `src/renderer/` / `src/common/` 路径                                                                                                                                                              |
| 11  | `docs/conventions/file-structure.md`                                                        | 整份文档讲的就是 `src/` 布局,需要重写为 monorepo 版                                                                                                                                                                               |
| 12  | `.claude/skills/architecture/SKILL.md` + `references/process.md` + `references/renderer.md` | 架构技能所有的 `src/*` 示例和路径规则                                                                                                                                                                                             |

**其他需要核查但改动面较小的**:

- `tests/` 所有 `*.test.ts` 内部的 `import` 路径:由于测试多用 alias(`@process/...`),
  只要 alias 改对大多数测试不用动;硬编码 `../../src/` 相对路径的才需要改
- `.github/workflows/*.yml`:如果有 `working-directory` 或 `paths:` 过滤涉及
  `src/**`,都要同步
- `.husky/*`:如果有脚本内部引用 `src/` 路径

**M1 的 smoke 验证必须覆盖(缺一不可)**:

- `bun run dev` 启动
- `bun run webui` 启动
- `bun run build` 产出 dmg
- `bunx tsc --noEmit` 无错
- `bun run lint` 无错
- `bun run test` 全绿(尤其包含 alias 的测试)
- `bunx vitest run --coverage` 跑通
- `prek run --from-ref origin/main --to-ref HEAD` 通过

### 里程碑清单

| #      | 里程碑                                            | 动什么                                                                                                                                                      | 验证证据                                                                                                                                            |
| ------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1** | Monorepo skeleton                                 | `src/` → `packages/desktop/src/`;`electron-builder.yml` / `electron.vite.config.ts` 迁入 desktop;根 `package.json` 加 workspaces;**同步改上表 12 大类配置** | `bun run dev` / `webui` / `build` 三条启动命令全通;`tsc --noEmit` / `lint` / `test` / `prek` 全绿;`asar list` 抽查:只有 desktop 代码                |
| **M2** | aionrs 遗留清理                                   | 删 `prepareAionrs.js` / `bundled-aionrs` extraResources / `.gitignore` / `AIONRS_VERSION` env                                                               | 打包后 `resources/` 无 `bundled-aionrs`;aionrs agent 创建对话功能跑通;产物体积减少十几 MB                                                           |
| **M3** | web-host skeleton + 单元测试骨架                  | 新建 `packages/web-host/`,只含 `types.ts` 和占位 + **全 mock 的单元测试骨架**                                                                               | `cd packages/web-host && bun test` 绿;不被任何包 import;依赖边界:`web-host` 不 import desktop/web-cli                                               |
| **M4** | backend-launcher 迁入 + 桌面 IPC 接入             | `lifecycleManager.ts` → `web-host/backend-launcher.ts`;`AppMetadata` 注入;Electron 主进程 import web-host 版                                                | 桌面 `bun run dev` 启动 backend 日志与原来一致;旧 `src/process/backend/lifecycleManager.ts` 删除;`backend-launcher.test.ts` mock spawn 全绿         |
| **M5** | static-server + auth 迁入 web-host                | webserver 内部逻辑拆迁;**保留老 `src/process/webserver/` 不调用 web-host**(双份并存)                                                                        | `static-server.test.ts` / `auth.test.ts` 全绿;老 webserver 还在,`bun run webui` 行为照旧;两份代码 HTTP 响应对比测试                                 |
| **M6** | **三条路径切换 + 老 webserver 删除**              | `--webui` 改调 host;`webui.start/stop` IPC 改调 host;`restoreDesktopWebUIFromPreferences` **保留在 desktop**,内部改调 web-host;删 `src/process/webserver/`  | **三条路径 E2E**:桌面 IPC / 桌面 GUI 开关(桌面+浏览器并用)/ `--webui` 无头;Switch 关闭后 backend 仍活(`lsof -i :<port>`);重启 app 后 WebUI 自动恢复 |
| **M7** | prepareAionuiBackend 接入打包 + 硬失败 / 过渡开关 | 抽 `prepareBackend` 到 `shared-scripts/`;`build-with-builder.js:460` 补调用;引入 `AIONUI_BACKEND_ALLOW_MISSING` 过渡开关                                    | `bun run build` 能用本地 backend 成功;`asar list` 抽查 `bundled-aionui-backend/` 存在;启动打包后的 app,backend 从 `resources/` 拉起                 |
| **M8** | web-cli + tarball CI                              | 新建 `packages/web-cli/`;CI matrix 出 tarball;backend 二进制打包时塞进去                                                                                    | CI 产出 5 个平台 `.tar.gz` artifact;`./aionui-web --version` 能出版本;**无 DE 的 Linux VM 上 `./aionui-web start --remote` 浏览器全链路通**         |
| **M9** | install-web.sh + Release Asset                    | `scripts/install-web.sh` 放仓库;CI release 时作为 asset 上传                                                                                                | `curl -fsSL ...releases/latest/download/install-web.sh \| bash` 在干净 Ubuntu container 里跑通;`--version` / `--mirror` 参数可用                    |

### 每个里程碑 handoff 的共用基线

每个里程碑的 teammate 在 `handoffs/Mx-outcome.md` 里必须记录以下验证证据
(原始命令输出,不要转述):

- **自动化验证**:`bun run lint` / `bunx tsc --noEmit` / `bun test` /
  `prek run --from-ref origin/feat/backend-migration --to-ref HEAD` 全绿
- **现有 e2e 不回退**:`tests/e2e/` 相关 job 必须通过
- **自动化 smoke**:对应里程碑 plan 阶段 12 里的机械化冒烟脚本
  (不依赖人眼判断)
- **产物抽查**(M1/M2/M7/M8 必做):`asar list app.asar | grep -c web-cli`
  应为 0;`tar tzvf aionui-web-*.tar.gz` 结构与设计一致;体积与上一版对比
- **依赖边界检查**(M3 起每步):CI 加一条 grep,
  `@aionui/web-host` 不能 import `packages/desktop/src/process/(agent|worker|services)/`

### 推荐节奏

- M1 + M2 可以同一周内做完(都是纯结构 / 纯清理,风险低)
- M3 + M4 + M5 分开三周做,每周一条 feature 分支接力
- **M6 是最大风险点**,建议单独一周,在 feature 分支上跑完整 e2e 后才通知
  下游里程碑启动
- M7/M8/M9 依赖 M6 的 feature 分支就绪后串行落地
- 整条链完成后,由人类统一决定如何合回 `feat/backend-migration`
- 整体预估 6-8 周可稳妥完成(视团队投入度)

### 会话独立性:防止上下文污染

本方案改动面大,在**同一个 AI 编码会话里连续做完 M1-M9 会导致上下文严重
污染**,质量会断崖式下降。每份 plan **必须写成能在一个全新、干净的会话里
独立执行**的形式。会话独立性分级:

| 里程碑 | 会话独立性      | 起新会话说明                                                                              |
| ------ | --------------- | ----------------------------------------------------------------------------------------- |
| **M1** | ✅ 完全独立     | 纯结构 + 配置调整,不碰业务代码。从零上下文可执行                                          |
| **M2** | ✅ 完全独立     | 只删 aionrs 遗留文件 / CI 配置,验证 aionrs agent 对话仍可用                               |
| **M3** | ✅ 完全独立     | 新建 `packages/web-host/`,写骨架 + 全 mock 单元测试,不 import 任何现有代码                |
| **M4** | ⚠️ 需最少上下文 | 迁 `lifecycleManager.ts` → web-host,改 desktop 调用。读设计文档的改造要点 A + M3 产物即可 |
| **M5** | ⚠️ 需最少上下文 | 抽 static-server + auth 到 web-host,**老 webserver 保留并存**。读改造要点 C/D + M4 产物   |
| **M6** | ❌ 需较多上下文 | **最高风险点**:切换三条路径 + 删老 webserver,必须读完整设计文档和所有前置 plan 产物       |
| **M7** | ✅ 完全独立     | 只改 `scripts/prepareAionuiBackend.js` 和 CI,不碰 packages/ 内部代码                      |
| **M8** | ✅ 完全独立     | 新建 `packages/web-cli/` + 新 CI job,基于 M3 的 web-host API                              |
| **M9** | ✅ 完全独立     | 只新增 `scripts/install-web.sh` + CI asset 上传                                           |

**每份 plan 必须自包含**,不假设读者"记得"任何前面讨论过的内容,且全部用
中文书写。模板:

```
# Mx [名称] 实施计划

## 零上下文会话背景
(本 plan 在整个方案中的位置 / 前置条件 / 验收标准)

## 参考文档
(只列一篇设计总文档 + 前置 plan 的"产物摘要")

## 文件清单
(绝对路径 + 要做什么)

## 阶段步骤
(每步 2-5 分钟,含完整代码 + 命令 + 预期输出)

## 全量验证
(可直接 copy-paste 执行的一串命令)

## 回滚
(失败时怎么 revert)
```

**"产物摘要"(handoff notes)**:每个 plan 执行完后,要产出一份
500 字以内的 `docs/backend-migration/handoffs/Mx-outcome.md`,记录:

- 实际交付的目录结构 / 新增的接口 / 删除的东西
- 执行过程中偏离 plan 的地方及原因
- 对后续 plan 的影响

下一份 plan 的起始会话只需要读总设计文档 + 上一份 handoff + 自己的 plan,
**不需要读上一份 plan 的具体步骤**,这样上下文始终保持干净。

## 验证方式

设计阶段只验证架构可行性,无代码改动。落地时的验证手段按依赖的 backend
形态分三层:

**测试层 1 — 单元 & 集成测试(不依赖真 backend)**:

- web-host 内所有模块都可 mock 测,CI 从 day 1 绿色
- `backend-launcher`:mock `spawn` 和 `/health` fetch
- `static-server`:mock HTTP server 假装 backend,验证反代和 SPA fallback
- `auth`:纯 I/O,bcrypt / 限流 / session cookie

**测试层 2 — E2E(需要真 backend)**:

- 开发机优先:`cargo install aionui-backend` 到 PATH;或兄弟目录
  `../aionui-backend/target/release/aionui-backend`;或 `AIONUI_BACKEND_BIN`
- CI:backend Release CI 稳定前,在 E2E job 里 `cargo install --git` 编译
  一份;稳定后改为从 Release 下载(与打包 pipeline 一致)
- 四类用户路径走查:
  - 桌面 IPC 模式(`bun run dev` / 生产 dmg)→ 业务功能完整
  - 桌面 GUI 开 WebUI(设置 → WebUI → Switch 打开)→ 桌面 + 浏览器同时可用;
    关闭 Switch 后 host 停止、backend 继续服务桌面;重启后配置自动恢复
  - 桌面 `--webui` 无头模式(`bun run webui` / `AionUi --webui`)→ 只有浏览器
  - aionui-web tarball 模式(Release 下载或本地 `bun run web-cli:dev`)→ 同上

**测试层 3 — 打包冒烟(过渡期)**:

- backend Release CI 稳定前,feature 分支 CI 打 `AIONUI_BACKEND_ALLOW_MISSING=1`
  产出 tarball / dmg,本地手动放 backend 二进制进去冒烟
- backend Release CI 稳定后,关闭 `ALLOW_MISSING`,回到"backend 下载失败则
  CI fail"的硬策略

**其他验证**:

- **接口抽象自洽性**:`AppMetadata` / `BackendBinaryResolver` / `startWebHost`
  三个接口必须覆盖 `src/process/webserver/` 和 `src/process/backend/` 中
  所有 Electron 耦合点 —— 逐项核对改造点 A–G
- **跨平台烟测**:macOS / Linux(含无 DE 服务器) / Windows / Termux
  tarball 版各 smoke 一次,重点验证无 DE 服务器场景不再有 Electron 依赖坑
- **与既有迁移文档交叉核对**:方案与 `docs/backend-migration/PHASE-1-FINAL-REPORT.md`
  的 HTTP/WS 覆盖结论一致,不假设未迁移能力
- **反向验证不复活 standalone**:`@aionui/web-host` 不 import
  `packages/desktop/src/process/agent/` / `worker/` / `services/` 中任何业务目录;
  `@aionui/web-cli` 同理只依赖 web-host,不摸 desktop;CI 加一条依赖检查
- **文档同步**:更新 WebUI Configuration Guide(wiki),新增 aionui-web 章节;
  README / CONTRIBUTING 的目录结构示意同步更新

## 非目标(明确排除)

- 不重构桌面 IPC 老路径(仅把 Electron 从 WebUI 链路抽走)
- 不动 `aionui-backend`(Rust)本身
- 不做 HTTPS / 证书管理(用户自己反代)
- 不做多用户(单管理员账号模型不变)
- 不复活 TS 业务后端(standalone)
- 不动 AionUi 对 `aionrs` 作为 agent 类型标签的业务逻辑(仅清理二进制分发相关的
  `prepareAionrs.js` / `bundled-aionrs`,renderer 的 `AgentType: 'aionrs'` 等
  完全保留)
- 本文档不写代码,仅交付设计供评审

## 风险与应对

| 风险                                                                           | 应对                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo 改造牵动 tsconfig / vite / electron-builder / jest 等 12 大类配置文件 | 改造前先搭一版最小可跑的 workspace skeleton 验证;M1 handoff 必须 check 过"M1 的隐蔽风险"一节里的完整清单;任何一类漏改都会让 dev / build / test 断一条路                                                                   |
| 9 个里程碑共用一个 AI 会话执行 → 上下文爆炸 / 质量下降                         | 每份 plan 写成自包含形式,从零上下文可执行;6/9 的里程碑可完全独立会话执行,仅 M4/M5/M6 需带最少上下文;每份 plan 执行后产出 handoff notes,后续 plan 只需读总设计 + 上游 handoff                                              |
| tests/ 有 20+ 个文件用相对路径 `../../src/process/...` import 而非 alias       | M1 必须一并修复:grep `../../src/` 和 `../src/` 全替换为 `@process/` / `@renderer/` 等 alias(依赖 M1 新增的 alias 已指向 `packages/desktop/src/`)                                                                          |
| electron-builder 扫仓库根 + workspace hoisting,误把 web-cli 打进 dmg/exe       | electron-builder 配置和入口迁入 `packages/desktop/`;桌面 `package.json` 不声明 web-cli;`build-with-builder.js` 改为 `cd packages/desktop`;产出后用 `asar list` 验证无 web-cli 代码残留                                    |
| 桌面 `--webui` 现有用户数据目录不可迁移                                        | `webuiConfig` 迁移保持文件名、schema、路径完全一致,必要时加一次性兼容读取                                                                                                                                                 |
| backend lifecycle 在 Electron 非 `--webui` 模式下也调用,改动面大               | Electron IPC 模式直接 import `@aionui/web-host` 的 backend-launcher,通过 `AppMetadata` 注入 version / resourcesPath / userDataPath,消除"Electron 版 lifecycle"这个分叉;渐进落地:先让新代码和旧代码共存通过 e2e,再删旧代码 |
| aionui-web 用户网络受限,无法下载 tarball                                       | 用户可手动从 GitHub Release 页下载后 scp 到服务器;支持 `AIONUI_BACKEND_BIN` 环境变量指向已有 backend;一键脚本支持 `--mirror` 参数指向内部镜像                                                                             |
| aionui-backend 版本与 AionUi 版本脱节                                          | CI 中统一用 `AIONUI_BACKEND_VERSION` 环境变量固定 backend 版本,桌面和 aionui-web tarball 打包时共用此变量,确保同一个 AionUi release 对应唯一 backend 版本                                                                 |
| 现有 `prepareAionuiBackend.js` 未接入打包流程(现存 bug)                        | 本方案顺手修复:在 `scripts/build-with-builder.js:460` 附近补上 `prepareAionuiBackend()` 调用                                                                                                                              |
| aionrs 已静态编译进 backend,但桌面仍在下载并打包 aionrs 二进制(无用负担)       | 本方案一并清理:删除 `prepareAionrs.js`、`electron-builder.yml` 的 `bundled-aionrs` 配置、CI workflow 的 `AIONRS_VERSION` 环境变量                                                                                         |
| 硬失败策略可能让 CI 因为上游临时波动而挂                                       | 失败时可重跑 CI;必要时在 CI 加一层 `AIONUI_BACKEND_VERSION` 固定版本重试策略;不回退到静默跳过                                                                                                                             |
| aionui-backend Release CI 还在开发中,本方案合入时可能拿不到稳定二进制          | 过渡期用 `AIONUI_BACKEND_ALLOW_MISSING=1` 软化为警告(仅 feature 分支);web-host/web-cli 单元和集成测试全 mock,不受影响;E2E 用 `cargo install --git` 本地编译;backend CI 稳定后删除 `ALLOW_MISSING` 开关                    |
| wiki 与实际实现偏差                                                            | 本次落地一并更新 wiki,统一 `aionui-web` 和 `--webui` 两条使用路径                                                                                                                                                         |
