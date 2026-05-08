# M5 static-server + auth 迁入 web-host(老 webserver 并存) - 需求文档

- **日期**:2026-05-07
- **里程碑**:M5
- **上游**:M4(`feat/m4-backend-launcher-migration` 已 merge)
- **对应设计文档节**:改造要点 C(静态服务与反代) + 改造要点 D(WebUI
  认证模块外提) + 里程碑清单 M5 行

## 做什么

把当前 `packages/desktop/src/process/webserver/` 的两类逻辑迁到
`packages/web-host/`,但**老 webserver 保留并继续被桌面使用**(不删、不切换
调用方),本里程碑只做"迁移 + 并存",切换到 web-host 调用是 M6 的事。

具体动作:

1. **迁移静态服务**:把 webserver 里 serve `out/renderer/` 的逻辑抽出,
   实现到 `packages/web-host/src/static-server.ts`:
   - Node 原生 `http` + `serve-handler`
   - `/api/*` 反代到 backend port
   - `/ws` upgrade 反代到 backend WebSocket
   - SPA fallback 到 `index.html`
2. **迁移 auth 模块 + 实现 M3 占位函数**:把现有 webserver 的密码验证、
   session cookie、限流逻辑抽到 `packages/web-host/src/auth/`,**同时把 M3
   阶段所有占位 `throw new Error('not implemented yet')` 实现化**:
   - `auth/config.ts` 内部实现:bcrypt 密码持久化、`webui.config.json` 读写
   - `auth/session.ts`:session cookie 管理、`/api/auth/login` handler
   - `auth/index.ts` 必须实现以下对外 API(全是 M3 定义的占位)(对应设计文档 UC-3):
     - `resetPassword(opts)`:供 CLI `--resetpass` 和桌面 GUI "重置密码" 按钮
     - `changePassword(opts)`:供桌面 preload 的 `webuiChangePassword` IPC
       在 M6 接线时直接复用(M5 必须实现,不得推给 M6)
     - `verifyPassword(opts)`:供 `/api/auth/login` 内部
     - `loadConfig(opts)` / `saveConfig(opts)`:供 session/限流/密码全部用
   - 限流(5 次 / 15 分钟),保持与老 webserver 一致
3. **保留** `packages/desktop/src/process/webserver/` 不删、不改调用方,
   桌面继续用老 webserver 跑 `--webui` 和 GUI 开关
4. **等价性测试**:写对比测试,证明"web-host 的 static-server 响应"和
   "老 webserver 响应"在相同输入下等价(相同 URL 返回相同 status / body /
   header 关键字段),覆盖至少 10 个关键端点(SPA fallback、/api/auth/login、
   /ws upgrade、静态资源、404 等)

## 不做什么(边界)

- ❌ **不删** `packages/desktop/src/process/webserver/`(M6 再删)
- ❌ **不改** `WebuiModalContent` / `webui.start/stop` IPC 调用(M6 再切换)
- ❌ **不改** `restoreDesktopWebUIFromPreferences`(M6 再**就地改内部调用**,
  不迁入 web-host)
- ❌ **不改** `--webui` 启动分支(M6 再改)
- ❌ **不实现** `startWebHost()` 的完整组装(web-host 的 `index.ts`
  `startWebHost` 仍可以抛 not implemented,除非真的需要组装 static-server +
  backend-launcher 来跑等价性测试 —— 这点 plan-writer 决定)
- ❌ **不引入 express**(设计文档已定 Node 原生 http + serve-handler)
- ❌ **不做数据迁移**:`webui.config.json` 的磁盘路径、schema、文件名都保持
  和老 webserver 完全一致,用户数据零迁移

## 已定决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| 静态服务底层实现 | Node 原生 `http` + `serve-handler` | 设计文档 C 节,零业务依赖 |
| 反代实现 | 手写 `http.request('upgrade')` + 双向 pipe | 不引新依赖,设计文档 C 节 |
| `webui.config.json` 路径 | 和老 webserver 完全一致(`userDataPath/webui.config.json`) | 兼容既有用户数据,设计文档 B 节 |
| 密码算法 | bcrypt,保持和老 webserver 一致 | 兼容既有 hash |
| session cookie 设置 | 沿用老 webserver 的配置(cookie 名 / SameSite / Path / HttpOnly) | 兼容既有会话,降低 M6 切换风险 |
| 限流策略 | 5 次 / 15 分钟,和老 webserver 一致 | 保持现有用户体验 |
| 老 webserver 是否继续被调用 | **是**,桌面的 `--webui` 和 GUI 开关仍走老代码 | 本里程碑只迁移不切换 |
| 等价性测试覆盖端点数 | 至少 10 个 | 足以覆盖关键路径,不过度测试 |
| 老 webserver 代码是否直接复用 | **不复用**,copy-paste 迁到 web-host 并脱 Electron 依赖 | web-host 零 Electron 依赖是硬原则 |
| auth 模块是否需要保持 API 完全一致 | **是**,对外 HTTP 接口字段、错误码一致 | 兼容前端 login 流程 |

## 验收标准

**测试分两层**(明确分工,避免"全 mock vs 起真 server"口径冲突):

### Unit 层(全 mock,不起任何真实进程或端口)

```bash
cd packages/web-host && bun test --exclude equivalence
# 或者 vitest 的 projects 配置区分 name
# 预期测试文件:
# - static-server.unit.test.ts:用 mock HTTP handler 测 SPA fallback / 反代规则
# - auth/config.unit.test.ts:bcrypt 读写、config 文件生成(fs mock);
#   loadConfig / saveConfig 的 schema 等价性测试(写入后读出数据一致)
# - auth/session.unit.test.ts:session cookie 设置、限流计数与触发
# - auth/index.unit.test.ts(关键,M5 新增,覆盖 M3 所有占位函数实现):
#   * resetPassword:返回新密码字符串;webui.config.json 落盘正确
#   * changePassword:旧密码正确 → 返回 void 并更新 hash;旧密码错误 → 拒绝
#   * verifyPassword:正确密码返回 true;错误密码返回 false;不存在的 config 返回 false
#   * loadConfig:无 config 时初始化;有 config 时解析字段和老 schema 完全一致
#   * saveConfig:写入后 loadConfig 能读出同一对象
# 约束:
# - vi.mock('node:child_process'):不 spawn 真进程
# - vi.mock('node:http'):或用 mock server library,不 listen 真端口
# - 不依赖真 backend,不依赖真网络
```

**验收门禁**:上述 5 个函数的每个场景都必须有对应 test case,M5 验收缺一
不通过。M6 不得"补"任何 auth 能力或 auth 单元测试。

### Equivalence 层(允许起真 HTTP server,但 backend 仍 mock)

```bash
cd packages/web-host && bun test equivalence
# 测试文件:packages/web-host/tests/equivalence.test.ts
# 约束与行为:
# - 允许 同时 listen 两个本地端口:
#     端口 A:老 webserver(来自 packages/desktop/src/process/webserver/)
#     端口 B:web-host 的 static-server
# - 后端一律用 mock HTTP server 替代(不启真 aionui-backend)
# - 对 10 个关键端点发请求,对比 status / body / 关键 header(Set-Cookie /
#   Content-Type / Cache-Control)
# - 端点清单至少覆盖:
#   1. GET /                          (SPA index)
#   2. GET /chat/123                  (SPA client-side route fallback)
#   3. GET /assets/main.js            (静态资源)
#   4. GET /nonexistent               (404 或 SPA fallback,按老行为)
#   5. POST /api/auth/login(200)      (mock backend 返回 200)
#   6. POST /api/auth/login(401)      (限流/密码错)
#   7. GET /api/anything              (反代透传)
#   8. WebSocket upgrade /ws          (反代 upgrade)
#   9. 带 cookie 的请求               (Set-Cookie 是否一致)
#   10. 错误场景:backend 未就绪     (502 或等价状态)
# 预期:10/10 等价
```

**桌面功能不回归**:

```bash
# 老 webserver 仍能工作(M5 没切换)
bun run webui &
sleep 20
PORT=$(grep -oE "http://(127.0.0.1|localhost):[0-9]+" /tmp/m5-webui.log | head -1 | grep -oE "[0-9]+$")
curl -fsS -o /dev/null -w "HTTP_STATUS=%{http_code}\n" "http://127.0.0.1:$PORT/"
# 预期:HTTP_STATUS=200(老 webserver 返回的)
```

**依赖边界**:

```bash
grep -rn "from ['\"]electron['\"]" packages/web-host/src/
# 预期:无输出
grep -rn "packages/desktop/src/process/\(agent\|worker\|services\|webserver\)" packages/web-host/src/
# 预期:无输出(尤其不能 import 老 webserver 代码复用)
```

**文件清单**(与正文保持一致,不含 `auth/login.ts` 或 `auth/resetPassword.ts`
这些旧结构文件名):

```bash
ls packages/web-host/src/static-server.ts
ls packages/web-host/src/auth/index.ts   # M3 定义签名,M5 实现化
ls packages/web-host/src/auth/config.ts  # bcrypt + webui.config.json I/O
ls packages/web-host/src/auth/session.ts # session cookie + 限流
ls packages/desktop/src/process/webserver/  # 应仍存在(M6 再删)
```

## 关键风险

| 风险 | 缓解 |
|---|---|
| `serve-handler` 对 SPA fallback 的行为和老 webserver 的 express static 不完全一致 | 等价性测试用同一 `out/renderer/` 为输入,覆盖 SPA 路由场景(比如 `/chat/123`),找出差异 |
| 反代 `/ws` upgrade 时需要手写,容易漏处理错误场景(连接中断、backend 未就绪) | plan-writer 必须覆盖:backend 未启动时反代 /ws 返回 502;backend 主动关闭时客户端收到 close frame |
| `webui.config.json` 字段在老 webserver 和 web-host 之间微小差异 | plan-writer 先读老 webserver 的 config 读写逻辑,照抄 schema;等价性测试覆盖"web-host 写 → 老 webserver 读"和反向 |
| bcrypt 版本差异(老代码用 bcryptjs 还是 bcrypt)导致 hash 不兼容 | plan-writer 读老 webserver 的 package.json 依赖和实际 import,保持一致 |
| 等价性测试过于宽松,漏掉 header / cookie 差异 | 对比至少包含 `Set-Cookie`、`Content-Type`、`Cache-Control`、status code |
| 迁移 auth 模块时误保留老 webserver 的 Electron 耦合(例如 `import { app } from 'electron'`) | web-host 依赖边界 grep 会拦截 |
| 限流状态的内存存储让桌面 GUI 开关跨重启丢失计数 | 不改现有行为(老 webserver 就是内存存储),保持等价 |

## 依赖上游

- **M4 已合入**:`@aionui/web-host` 的 `backend-launcher` 已实现,
  `startWebHost` 需要组装 static-server + backend-launcher 时可以用
- **读 M4 handoff**:确认 `BackendLifecycleManager` 构造签名
- **读 M3 handoff**:确认类型签名(`WebHostOptions.backend` 分支形态)

## 分支与 handoff

- 上游分支:`origin/feat/m4-backend-launcher-migration`
- 本里程碑分支:`feat/m5-static-server-auth-migration`
- handoff 位置:`docs/backend-migration/handoffs/M5-outcome.md`
- handoff 必须附:
  - 等价性测试的端点清单和对比结果
  - auth 模块的对外 HTTP 接口契约(给 M6 切换用)
  - 老 webserver 和新 web-host 的"相同文件名"清单(帮 M6 删老代码时准确找到删除点)
- 完成后 push 前:必须 `git merge origin/feat/backend-migration`

## 预计执行时间

6-10 小时(迁移量最大的一步:静态服务 + 反代 + auth 三块,加等价性测试)
