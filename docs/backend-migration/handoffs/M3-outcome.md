# M3 @aionui/web-host 骨架 - 交付摘要

## 已交付

新建 `packages/web-host/` 子包,包含:

### 包骨架文件
- `package.json` - 包名 `@aionui/web-host`, `private: true`, 依赖 `serve-handler`
- `tsconfig.json` - 继承根 tsconfig
- `vitest.config.ts` - vitest 测试配置
- `README.md` - 包说明文档

### 类型定义
- `src/types.ts` - 5 个核心类型:`AppMetadata`、`BackendBinaryResolver`、`WebHostOptions`、`WebHostHandle`、`WebUIConfig`

### 占位模块(全部抛 "not implemented yet")
- `src/backend-launcher.ts` - `startBackend()` / `stopBackend()`
- `src/static-server.ts` - `startStaticServer()` / `stopStaticServer()`
- `src/auth/index.ts` - 5 个公共 API:`resetPassword`、`changePassword`、`verifyPassword`、`loadConfig`、`saveConfig`
- `src/auth/config.ts` - 内部 config I/O:`readConfig` / `writeConfig`
- `src/auth/session.ts` - session 管理:`createSession` / `verifySession`
- `src/index.ts` - 顶层入口,导出 `startWebHost()` + auth 全部 API + 所有类型

### 单元测试骨架(全 mock)
- `src/backend-launcher.test.ts` - 验证抛异常,6 个测试
- `src/static-server.test.ts` - 验证抛异常
- `src/auth/config.test.ts` - 验证抛异常

## 与计划的偏离

无偏离,完全按 requirements 执行。

## 给下一个里程碑的提醒

- **接口签名已锁定**(见下方),M4-M8 只能扩展字段,不得破坏性修改
- 所有占位模块抛 `'M4: ...' / 'M5: ...'` 异常,提示对应里程碑负责实现
- `serve-handler` 已声明在 `packages/web-host/package.json` 的 `dependencies`,不影响根 package.json
- M4 需要实现 `backend-launcher.ts` 和 `startWebHost()`
- M5 需要实现 `static-server.ts` 和全部 auth 模块

## 验证证据

### 分支信息
- 分支名:`feat/m3-web-host-skeleton`
- 最新 SHA:`5103b041b6f86068ddebe05a219d935ca41691e5`
- 上游分支:`origin/feat/m2-aionrs-cleanup`
- 基线同步:已合入 `origin/feat/backend-migration @ de0c7b87d`

### 类型检查
```
$ bunx tsc --noEmit
(无输出,通过)
```

### 测试
```
$ cd packages/web-host && bun test
bun test v1.3.10

 6 pass
 0 fail
 6 expect() calls
Ran 6 tests across 3 files. [9.00ms]
```

### 依赖边界
```
$ grep -r "packages/desktop\|@aionui/desktop" packages/web-host/src/
(无输出)

$ grep -rE "from ['\"]electron['\"]|require\(['\"]electron" packages/web-host/src/
(无输出)

$ grep -rE "packages/desktop/src/process/(agent|worker|services)" packages/web-host/src/
(无输出)
```

### 文件清单
```
packages/web-host/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── src/
    ├── types.ts
    ├── index.ts
    ├── backend-launcher.ts
    ├── backend-launcher.test.ts
    ├── static-server.ts
    ├── static-server.test.ts
    └── auth/
        ├── index.ts
        ├── config.ts
        ├── config.test.ts
        └── session.ts
```

## 接口签名锁定

以下接口供 M4-M8 参考,不得破坏性修改(扩展字段可以):

```typescript
// packages/web-host/src/types.ts

export type AppMetadata = {
  version: string;
  isPackaged: boolean;
  resourcesPath: string;
  userDataPath: string;
};

export type BackendBinaryResolver = () => string;

export type WebHostOptions = {
  app: AppMetadata;
  staticDir: string;
  port?: number;
  allowRemote?: boolean;
  dataDir?: string;
  logDir?: string;
  backend:
    | { kind: 'ownBackend'; resolveBackend: BackendBinaryResolver }
    | { kind: 'useExistingBackend'; port: number };
};

export type WebHostHandle = {
  port: number;
  backendPort: number;
  url: string;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  initialPassword?: string;
  stop: () => Promise<void>;
};

export type WebUIConfig = {
  passwordHash: string;
  adminUsername: string;
  // M5 will confirm complete schema when migrating from old webui.config.json
};

// packages/web-host/src/index.ts
export async function startWebHost(opts: WebHostOptions): Promise<WebHostHandle>;

// packages/web-host/src/auth/index.ts
export async function resetPassword(opts: { app: AppMetadata }): Promise<string>;
export async function changePassword(opts: {
  app: AppMetadata;
  oldPassword: string;
  newPassword: string;
}): Promise<void>;
export async function verifyPassword(opts: {
  app: AppMetadata;
  password: string;
}): Promise<boolean>;
export async function loadConfig(opts: { app: AppMetadata }): Promise<WebUIConfig>;
export async function saveConfig(opts: { app: AppMetadata; config: WebUIConfig }): Promise<void>;
```

## 遗留问题 / 跟进项

无。M3 范围完成,所有验收标准通过。
