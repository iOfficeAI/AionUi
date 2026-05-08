# M6 三条路径切换 + 删除老 webserver - 需求文档

- **日期**:2026-05-07
- **里程碑**:M6(**高风险一次性切换节点**,整条链的核心)
- **上游**:M5(`feat/m5-static-server-auth-migration` 已 merge)
- **对应设计文档节**:目标形态的"三条 WebUI 启动路径" + 改造要点 E
  (Electron 壳的两条 WebUI 路径改造)+ 改造要点 F(webserver 退役) +
  里程碑清单 M6 行

## 做什么

把所有 WebUI 启用路径从"老 webserver"切换到"`@aionui/web-host`",并删除老
webserver 代码。三条路径共用同一份 `startWebHost()`,只是 `backend` 参数
不同。

具体动作:

1. **实现** `packages/web-host/src/index.ts` 的 `startWebHost()` 完整组装:
   组合 backend-launcher(M4) + static-server(M5) + auth(M5) +
   端口管理 + `WebHostHandle` 生命周期
2. **切换路径 ①**:`packages/desktop/` 的 `--webui` 启动分支
   (原 `src/index.ts:172` 对应的新位置)改为调
   `startWebHost({ backend: { kind: 'ownBackend', ... } })`
3. **切换路径 ②**:`webui.start` / `webui.stop` IPC handler(这俩 IPC
   调用 `WebuiModalContent.tsx` 用)底层改为调
   `startWebHost({ backend: { kind: 'useExistingBackend', port: currentBackendPort } })`,
   `handle.stop()` 关 host,不关 backend
4. **切换路径 ③**:`restoreDesktopWebUIFromPreferences()` 自动恢复逻辑
   **保留在 `packages/desktop/`**(位置沿用 M1 后的实际路径,plan-writer 读
   M5 handoff 确认),但内部改为 `await startWebHost({ kind: 'useExistingBackend', ... })`。
   恢复策略(读 `webui.desktop.enabled` 并决定是否调 startWebHost)是桌面壳
   的编排,不迁到 web-host
5. **删除** `packages/desktop/src/process/webserver/` 整个目录
6. **写 E2E 测试**:`tests/e2e/cases/webui/` 下新增三个用例:
   - `desktop-ipc.e2e.ts`:桌面 IPC 模式,对话全链路通
   - `desktop-gui-switch.e2e.ts`:GUI Switch 开关控制,桌面 + 浏览器并用
   - `webui-headless.e2e.ts`:`--webui` 无头模式,浏览器登录对话
7. **清理** `packages/desktop/src/common/platform/register-node.ts`
   (设计文档里说的 standalone 遗留空文件,顺手删)

## 不做什么(边界)

- ❌ **不改** 前端 renderer 代码(`webui.start` / `webui.stop` IPC 接口保留,
  前端 `WebuiModalContent.tsx` 零感知)
- ❌ **不改** preload IPC 暴露的 `webuiResetPassword` / `webuiChangePassword`
  对外接口(底层改调 web-host auth 模块,接口不变)
- ❌ **不复活** 被 `b157719a` 清理的 standalone bun server
- ❌ **不动** aionui-backend 本身
- ❌ **不迁移** 用户数据(`webui.config.json` 路径和 schema 保持一致,M5
  已保证)
- ❌ **不优化**老 webserver 的逻辑("先等价切换,优化是后续 PR 的事")
- ❌ **不改**包分发策略(M7/M8 的事)
- ❌ **不补 auth 能力本身**:`resetPassword` / `changePassword` /
  `verifyPassword` / `loadConfig` / `saveConfig` 的实现和单元测试必须已由
  M5 全部完成。M6 只负责把桌面 preload / IPC handler **接线**到这些已存在
  的实现上,不得在 M6 新增 auth 函数或补 auth 单元测试。若接线时发现 M5
  有缺口,escalate 给 team-lead 决定是否回到 M5 修补,不自主扩 M6 范围

## 对 plan-writer 的额外要求(因 M6 E2E 环境敏感)

M6 是整条链最高风险的一步,且 e2e 同时涉及 Electron、浏览器、backend、
WebSocket 反代四条链路,对端口时序、日志位置、GUI 启动速度非常敏感。
plan-writer 在写 M6 detailed plan 时,**除了 executor 执行步骤之外,必须
额外产出一节"失败诊断清单"**,作为 M6 detailed plan 的必备章节,内容包括:

1. **日志文件定位**:
   - Electron 主进程日志文件绝对路径(例如 `~/Library/Logs/AionUi/main.log`)
   - aionui-backend 子进程日志文件路径
   - web-host static-server 的访问日志路径(如果有)
   - 浏览器端 console 日志怎么获取(playwright trace / console capture)
2. **端口读取方式**:
   - 从哪个日志 grep 才能拿到 backend 实际端口(有可能是随机分配的)
   - 从哪里拿 web-host 绑定的端口
   - 如何确认"GUI 开关里的 web-host 是否复用了同一个 backend 端口"
     (回答设计意图:只有 backend port 一致才算正确接线)
3. **等待条件**:
   - 桌面 IPC 模式下,什么日志行出现才算"桌面就绪"
   - WebUI 模式下,什么标志才算"host 就绪可接请求"
   - e2e 不得用固定 sleep N 秒,必须用日志等待或端口可连接等待
4. **失败后先看哪份日志**:
   - 症状 A(浏览器连不上)→ 先看 web-host 日志,再看 backend 日志
   - 症状 B(浏览器连上但业务失败)→ 先看 backend 日志,再看反代日志
   - 症状 C(Switch 关闭后 backend 死了)→ 说明 `handle.stop()` 误杀了
     backend,查 M6 接线处
   - 等等(plan-writer 按 e2e 用例逐个写)
5. **必须串行跑的 case 清单**:
   - 明确哪些 e2e 不能并行(比如同时开 GUI 和 `--webui` 会端口冲突)

**这一节不是 executor 的"执行步骤",而是 executor 在 e2e 失败时的"自助
诊断手册"**,plan-writer 不写这一节,plan 就不算完成。

## 已定决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| 切换方式 | **一次性切换**,不保留过渡开关 | 设计文档"一次性替换"原则,过渡态成本更高 |
| 老 webserver 目录处理 | **直接删除**,不保留注释/tag | 仓库干净;历史在 git log |
| GUI 开关关闭后 backend 处理 | backend 不停,继续服务桌面 IPC | 设计文档 E2 节 |
| 自动恢复逻辑归属 | **留在 `packages/desktop/`**,只是改为调 `@aionui/web-host.startWebHost(...)`。web-host 提供能力,桌面壳编排"是否恢复 / 何时恢复"的策略 | `webui.desktop.enabled` 是桌面壳专属偏好,不是 web-host 通用能力;避免 web-host 被污染桌面语义 |
| `webui.start` IPC 返回值 | 保持和老实现一致 | 前端 `WebuiModalContent` 代码零改动 |
| 三条路径的 `AppMetadata` 注入 | 桌面壳的入口统一构造一次,三条路径都用同一个 | 避免 drift |
| e2e 覆盖 | 三条路径各一个主流程 e2e,不做穷尽组合 | 核心场景覆盖,不过度 |
| 本里程碑是否包含回滚策略 | **包含**,failed e2e 时 revert 本 PR | 高风险必须可回滚 |
| `packages/desktop/src/common/platform/register-node.ts` 处理 | 同步删除 | 设计文档关键文件清单已列(M1 后路径已变) |
| 失败时的 backend 端口参数从哪获取(useExistingBackend) | 从 `BackendLifecycleManager` 的 `port` 属性(M4 保证可访问) | M4 已定 |

## 验收标准

**所有 e2e 全绿**:

```bash
bun run test:e2e tests/e2e/cases/webui/
# 预期:
# - desktop-ipc.e2e.ts PASS
# - desktop-gui-switch.e2e.ts PASS
# - webui-headless.e2e.ts PASS

# 已有 e2e 不回归
bun run test:e2e
# 预期:全绿
```

**老 webserver 彻底清理**:

```bash
# 目录应已删除
find packages/desktop/src/process/webserver -type f 2>&1 | wc -l
# 预期:0

# 无任何残留 import
grep -rn "from.*process/webserver" packages/desktop/src/
# 预期:无输出
```

**桌面 + 浏览器并用场景(e2e 重点验证)**:

```bash
# 1. 启动桌面 IPC 模式(bun run dev),打开桌面 UI
# 2. 在设置页点开 WebUI Switch
# 3. 浏览器访问 localhost:<port>,登录
# 4. 在桌面发消息 → 浏览器能看到对话更新
# 5. 在浏览器发消息 → 桌面能看到对话更新
# 6. 关闭 Switch → lsof -i :<backend-port> 仍有进程(backend 没停)
# 7. 退出 app 后再启动 → WebUI 自动恢复 on 状态
```

以上全部由 `desktop-gui-switch.e2e.ts` 自动化覆盖,用 playwright 同时
控制 Electron 和 Chromium。

**前端接口不变**:

```bash
# 前端 webui.start 调用应无改动
git diff origin/feat/m5-static-server-auth-migration \
    packages/desktop/src/renderer/ \
    packages/desktop/src/common/adapter/
# 预期:无改动(或只有无关的改动)
```

**backend 端口透传正确**(反代验证):

```bash
# 启动 GUI 开关后的 web-host port
BACKEND_PORT=<从日志读>
HOST_PORT=<从日志读>

curl -fsS http://127.0.0.1:$HOST_PORT/api/health
# 预期:200,说明 /api/* 成功反代到 backend

# WebSocket 反代
curl -fsS --include -H "Connection: Upgrade" -H "Upgrade: websocket" \
  http://127.0.0.1:$HOST_PORT/ws 2>&1 | head -5
# 预期:101 Switching Protocols 或类似响应
```

## 关键风险

| 风险 | 缓解 |
|---|---|
| GUI 开关切换时序和老实现不一致,导致重启后状态丢失 | e2e 覆盖"开 → 重启 → 验证仍 on";手动跑多次验证稳定性 |
| `useExistingBackend` 传入 port 为旧值(backend 已重启换端口) | M4 保证 `BackendLifecycleManager.port` 是 live 引用,不是缓存值;plan-writer 确认 getter 行为 |
| 删老 webserver 后某些 import 未被迁移(如 `extraResources` 路径) | 全仓 grep `webserver` 找残留;`bun run dev` 能启动且 e2e 全绿才算合格 |
| preload IPC 暴露的方法底层切换后行为微变(比如错误码) | 保持 IPC 响应格式和老实现一致,尤其 error 字段格式 |
| 反代 `/ws` 时 session cookie 透传不正确,浏览器登录状态丢失 | e2e 覆盖"登录后 WebSocket 连接有效",检查 cookie 透传 |
| 切换时 port 分配规则变化导致用户收藏的 URL 失效 | 默认 port 25808 保持不变 |
| e2e playwright 并行控制 Electron + Chromium 复杂,测试不稳定 | plan-writer 研究仓库现有 e2e(`tests/e2e/cases/teams/`)找类似双实例用例参考 |
| 本里程碑改动面最大,一次失败全链路 revert 代价高 | feature 分支上**跑完所有 e2e 才 push**;失败时 agent 不 push,escalate 给人类 |
| `restoreDesktopWebUIFromPreferences` 内部从老 webserver 改调 `startWebHost` 后,Electron 启动时机可能和原来不同(导致 WebUI 提前或延后) | `restoreDesktopWebUIFromPreferences` **保留在桌面壳**(不迁入 web-host),plan-writer 在桌面入口的原调用点就地改内部实现,保持调用时序不变 |

## 依赖上游

- **M5 已合入**:static-server + auth 在 web-host 里已实现,等价性已验证
- **M4 已合入**:backend-launcher 在 web-host 里已实现,`getPort()` 可用
- **M3 已合入**:接口类型稳定
- **读 M5 handoff**:取 auth 模块对外 HTTP 接口契约、等价性测试覆盖清单
- **读 M4 handoff**:取 `BackendLifecycleManager` 构造签名和 port 访问方式
- **读 M3 handoff**:取接口类型签名

## 分支与 handoff

- 上游分支:`origin/feat/m5-static-server-auth-migration`
- 本里程碑分支:`feat/m6-three-paths-cutover`
- handoff 位置:`docs/backend-migration/handoffs/M6-outcome.md`
- handoff 必须附:
  - 三条路径 e2e 的最终 PASS 证据(命令输出)
  - 产出的 e2e 文件路径清单
  - 老 webserver 删除前后的文件数对比
  - 任何 IPC 接口微变(如有,必须标注,影响前端)
- 完成后 push 前:必须 `git merge origin/feat/backend-migration`
- **failed push 策略**:如果 e2e 不全绿,agent **绝不 push**,在 handoff
  里列所有失败项并 SendMessage escalate

## 预计执行时间

12-20 小时(三条路径切换 + 写 3 个 e2e + 删老代码 + 验证。本里程碑是**最大
风险点**,预留充分 buffer)
