# WebUI 脱 Electron 文档复审补充

- **日期**: 2026-05-07
- **背景**:
  - 第一轮审查记录见
    [`2026-05-07-webui-decouple-doc-review.md`](./2026-05-07-webui-decouple-doc-review.md)
  - 本文档只记录**上一轮修订后仍然残留的 4 个问题**
- **目的**: 方便继续交给其他人逐条确认和修文档

## 结论

这轮修改已经解决了大部分关键冲突，尤其是下面几项已经明显收敛:

- `install-web.sh` 统一成 `| bash`
- `BackendBinaryResolver` 改成按 `isPackaged` 分档
- M8 到 M9 的 release asset / `.sha256` 职责链基本闭环
- playbook 已经明确限定适用环境和 requirements / plan 的命名关系

目前剩下的问题不算“方向错了”，而是**局部文档没有同步到最新决策**。
这 4 个问题建议继续修掉，否则后续 executor 或 plan-writer 仍可能被旧表述带偏。

## 问题 1: M3 的验收清单没有同步到新的 auth 目录结构

### 现状

M3 前文已经改成:

- `packages/web-host/src/auth/index.ts` 承载对外公共 API
- `packages/web-host/src/auth/session.ts` 承载 session cookie 管理

但“文件存在性”验收仍在检查旧清单:

- `packages/web-host/src/auth/login.ts`
- 没有检查 `auth/index.ts`
- 没有检查 `auth/session.ts`

### 风险

这会导致两类问题:

1. executor 按验收清单交付旧结构，而不是按前文交付新结构
2. 就算实现已经按新结构完成，验收步骤也会误判失败

### 涉及位置

- [`2026-05-07-m3-web-host-skeleton-requirements.md`](../plans/2026-05-07-m3-web-host-skeleton-requirements.md) 第 20-28 行
- [`2026-05-07-m3-web-host-skeleton-requirements.md`](../plans/2026-05-07-m3-web-host-skeleton-requirements.md) 第 69-77 行

### 建议改法

把 M3 的文件存在性检查同步成与正文一致的结构，例如:

```bash
ls packages/web-host/package.json \
   packages/web-host/tsconfig.json \
   packages/web-host/src/index.ts \
   packages/web-host/src/types.ts \
   packages/web-host/src/backend-launcher.ts \
   packages/web-host/src/static-server.ts \
   packages/web-host/src/auth/index.ts \
   packages/web-host/src/auth/config.ts \
   packages/web-host/src/auth/session.ts
```

如果最终仍然希望保留 `auth/login.ts`，那就反过来把正文也改回去，重点是**正文和验收不能出现两套结构**。

## 问题 2: `restoreDesktopWebUIFromPreferences` 还有旧表述残留

### 现状

大方向已经改对了:

- M6 主体动作已明确写成“保留在 `packages/desktop/`，只改内部调用”
- 设计文档关键文件表也改成了“**不迁**”

但还有两处旧表述没同步:

1. M6 风险表里仍写着“`restoreDesktopWebUIFromPreferences` 迁到 web-host 后”
2. 设计文档里程碑总表的 M6 行仍写“`restoreDesktopWebUIFromPreferences` 迁移”

### 风险

这类残留最容易误导后续的 plan-writer。
因为他通常会同时读“正文 + 风险 + 里程碑表”，一旦三个位置里有一个还写旧说法，就可能重新把职责边界写散。

### 涉及位置

- [`2026-05-07-m6-three-paths-cutover-requirements.md`](../plans/2026-05-07-m6-three-paths-cutover-requirements.md) 第 61 行
- [`2026-05-07-m6-three-paths-cutover-requirements.md`](../plans/2026-05-07-m6-three-paths-cutover-requirements.md) 第 150 行
- [`2026-05-07-webui-decouple-electron-design.md`](../plans/2026-05-07-webui-decouple-electron-design.md) 第 686 行
- [`2026-05-07-webui-decouple-electron-design.md`](../plans/2026-05-07-webui-decouple-electron-design.md) 第 784 行

### 建议改法

把所有残留表述统一改成同一句意思:

- `restoreDesktopWebUIFromPreferences` **不迁入 web-host**
- 仍由 `packages/desktop/` 编排“是否恢复 / 何时恢复”
- web-host 只提供 `startWebHost()` 等能力

也就是说，统一改成“**保留在 desktop，内部改调 web-host**”，不要再出现“迁移”这个词。

## 问题 3: `changePassword` 的实现责任没有在 M5 明确落地

### 现状

现在契约层已经锁住了:

- 设计文档 UC-3 定义了 `changePassword()`
- M3 也要求在 `auth/index.ts` 中定义其签名

但 M5 作为“auth 迁移”里程碑，动作清单仍然只显式列了:

- `config.ts`
- `login.ts`
- `resetPassword.ts`

没有把 `changePassword()` / `verifyPassword()` 的实现归属明确写进 M5。

### 风险

这会把一个本应在 M5 落地的 auth 能力，继续拖到 M6。
而 M6 已经是三条路径切换 + 老 webserver 删除的高风险里程碑，不应该再背 auth 功能补齐工作。

### 涉及位置

- [`2026-05-07-webui-decouple-electron-design.md`](../plans/2026-05-07-webui-decouple-electron-design.md) 第 364-399 行
- [`2026-05-07-m3-web-host-skeleton-requirements.md`](../plans/2026-05-07-m3-web-host-skeleton-requirements.md) 第 204-217 行
- [`2026-05-07-m5-static-server-auth-migration-requirements.md`](../plans/2026-05-07-m5-static-server-auth-migration-requirements.md) 第 23-28 行
- [`2026-05-07-m6-three-paths-cutover-requirements.md`](../plans/2026-05-07-m6-three-paths-cutover-requirements.md) 第 45-46 行

### 建议改法

直接在 M5 的“迁移 auth 模块”动作里补齐一条明确说明，例如:

- `auth/index.ts`:对外导出 `resetPassword()` / `changePassword()` / `verifyPassword()`
- `changePassword()` 供桌面 preload 的 `webuiChangePassword` 在 M6 接线时直接复用

重点是让 M5 明确成为“**auth 能力落地**”的里程碑，M6 只负责“**把已有能力接上线**”。

## 问题 4: M9 的本地容器验收还不是可机械判定的验证

### 现状

M9 文档虽然写了“容器验证(agent 本地可跑)”，但示例命令实际只是:

- 复制脚本
- 注释说明“需要 release 或 mock”
- 最后打印一行 `skipping in M9 local smoke`

### 风险

这意味着表面上有“本地容器验证”，但实际上没有给 executor 一个可复制、可判定 PASS/FAIL 的本地验证路径。

结果会是:

1. executor 无法判断是否算完成
2. 不同执行者会用不同方式自造验证
3. 文档要求的“机械化验证”在这里落空

### 涉及位置

- [`2026-05-07-m9-install-web-script-requirements.md`](../plans/2026-05-07-m9-install-web-script-requirements.md) 第 100-115 行

### 建议改法

这里建议二选一，明确到底采用哪种验证模式:

1. **方案 A: 本地提供可执行 smoke**
   - 用 `--mirror` 指向本地 mock HTTP server
   - mock server 提供 tarball 与 `.sha256`
   - 容器内真实跑 `install-web.sh`，最后校验 `aionui-web --version`

2. **方案 B: 明确本地不做强制验证**
   - 把这一节改名为“本地可选演练”
   - 把强制验收证据改为 CI release job
   - 本地只要求 `bash -n` + `--help` + 可能的 unit 级脚本测试

如果不准备补 mock mirror，我更建议方案 B，因为它更诚实，也更符合“机械化验证”的原则。

## 建议优先级

### P1

- 问题 1: M3 验收清单同步
- 问题 2: `restoreDesktopWebUIFromPreferences` 残留旧表述清理

### P2

- 问题 3: M5 明确承担 `changePassword` / `verifyPassword` 的实现责任
- 问题 4: M9 把“本地容器验证”改成真正可执行，或改成非强制演练

## 建议的最小修法

如果只想最小成本收口这 4 个问题，可以这样改:

1. 改 M3 一处验收清单
2. 改 M6 一处风险表 + 设计文档里程碑总表一处表述
3. 改 M5 的 auth 动作列表，补一行 `changePassword` / `verifyPassword`
4. 改 M9 的容器验证一节标题和验收定义，明确它到底是不是强制门禁

做完这几步后，剩余问题基本都会从“文档冲突”降到“实现细节选择”。
