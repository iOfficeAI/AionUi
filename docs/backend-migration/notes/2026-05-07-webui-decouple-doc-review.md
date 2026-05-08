# WebUI 脱 Electron 文档审查记录

- **日期**: 2026-05-07
- **审查对象**:
  - [`docs/backend-migration/plans/2026-05-07-webui-decouple-electron-design.md`](../plans/2026-05-07-webui-decouple-electron-design.md)
  - [`docs/backend-migration/plans/2026-05-07-webui-decouple-team-playbook.md`](../plans/2026-05-07-webui-decouple-team-playbook.md)
  - [`docs/backend-migration/plans/2026-05-07-m1-monorepo-skeleton.md`](../plans/2026-05-07-m1-monorepo-skeleton.md)
  - [`docs/backend-migration/plans/2026-05-07-m2-aionrs-cleanup-requirements.md`](../plans/2026-05-07-m2-aionrs-cleanup-requirements.md)
  - [`docs/backend-migration/plans/2026-05-07-m3-web-host-skeleton-requirements.md`](../plans/2026-05-07-m3-web-host-skeleton-requirements.md)
  - [`docs/backend-migration/plans/2026-05-07-m4-backend-launcher-migration-requirements.md`](../plans/2026-05-07-m4-backend-launcher-migration-requirements.md)
  - [`docs/backend-migration/plans/2026-05-07-m5-static-server-auth-migration-requirements.md`](../plans/2026-05-07-m5-static-server-auth-migration-requirements.md)
  - [`docs/backend-migration/plans/2026-05-07-m6-three-paths-cutover-requirements.md`](../plans/2026-05-07-m6-three-paths-cutover-requirements.md)
  - [`docs/backend-migration/plans/2026-05-07-m7-prepare-backend-ci-requirements.md`](../plans/2026-05-07-m7-prepare-backend-ci-requirements.md)
  - [`docs/backend-migration/plans/2026-05-07-m8-web-cli-tarball-requirements.md`](../plans/2026-05-07-m8-web-cli-tarball-requirements.md)
  - [`docs/backend-migration/plans/2026-05-07-m9-install-web-script-requirements.md`](../plans/2026-05-07-m9-install-web-script-requirements.md)
- **目的**: 从执行可落地性、接口稳定性、里程碑衔接一致性三个角度，识别当前文档中不清晰或存在冲突的地方。

## 结论

当前文档组的总体方向是清楚的，分层目标、三条启动路径、里程碑拆分也基本合理。

但存在一批会直接影响执行的关键问题，主要集中在四类:

1. **同一能力的契约没有锁定**
2. **不同文档对同一规则的描述互相冲突**
3. **上游里程碑和下游里程碑之间的责任边界没有闭环**
4. **部分执行说明依赖特定工具体系，但文档没有显式限定适用环境**

如果不先修正这些点，后续最容易出现的情况不是“做慢一点”，而是:

- M6 或 M9 才发现前面接口不够用，被迫临时改契约
- 执行者按不同文档理解做出两套不兼容实现
- CI 产物已经能生成，但 install / release 链路无法闭环
- playbook 在非 Claude team 环境里不可执行

## 必须先澄清的问题

### 1. `install-web.sh` 的执行方式与脚本语言冲突

**现状**

- 设计文档把用户命令写成 `curl ... | sh`
- M9 也沿用了 `curl ... | sh`
- 但 M9 同时又写成“bash-only”
- M9 的决策表里还写了“POSIX sh 也可，由 plan-writer 决定”

**问题**

`curl ... | sh` 会直接用 `/bin/sh` 解释脚本，不会走脚本里的 shebang。
如果脚本最终用了 Bash 语法，用户按文档执行会直接失败。

**涉及位置**

- [`webui-decouple-electron-design.md`](../plans/2026-05-07-webui-decouple-electron-design.md) 第 213、215 行
- [`2026-05-07-m9-install-web-script-requirements.md`](../plans/2026-05-07-m9-install-web-script-requirements.md) 第 28、43、50 行

**建议**

必须二选一，不要留给 plan-writer 自行决定:

1. 统一锁定为 **POSIX `sh` 脚本**
2. 或统一改成 **Bash 脚本 + 用户命令改为 `| bash`**

当前更稳妥的做法是直接在 M9 文档里把“脚本语言”和“用户安装命令”一起锁死。

### 2. `webuiChangePassword` 的接口契约没有提前定义

**现状**

- 设计文档要求桌面 preload 的 `webuiChangePassword` 保留薄接口，底层改调 web-host auth
- M6 也要求对外 IPC 接口不变
- 但 M3 锁定的 web-host 对外接口只有 `startWebHost()` 和 `resetPassword()`
- M5 的 auth 迁移清单里也没有明确列出 `changePassword()` 级别的对外入口

**问题**

这意味着“改密码”这个跨壳能力直到 M6 才会第一次被真正定义。
到那一步如果发现接口不够用，只能临时破坏 M3 的契约冻结原则。

**涉及位置**

- [`webui-decouple-electron-design.md`](../plans/2026-05-07-webui-decouple-electron-design.md) 第 371-372 行
- [`2026-05-07-m3-web-host-skeleton-requirements.md`](../plans/2026-05-07-m3-web-host-skeleton-requirements.md) 第 190-191 行
- [`2026-05-07-m5-static-server-auth-migration-requirements.md`](../plans/2026-05-07-m5-static-server-auth-migration-requirements.md) 第 27 行
- [`2026-05-07-m6-three-paths-cutover-requirements.md`](../plans/2026-05-07-m6-three-paths-cutover-requirements.md) 第 42-43 行

**建议**

在 M3 或 M5 之前就把 auth 的最小公共接口补齐，至少明确下面两种之一:

1. `changePassword(opts): Promise<void>`
2. `createAuthService(...)` 返回 `resetPassword` / `changePassword` / `verifyPassword`

重点不是现在就实现，而是要把契约锁住，避免 M6 临时造接口。

### 3. `binaryResolver` 的查找顺序在设计文档和里程碑文档里不一致

**现状**

设计文档已经很明确:

- `isPackaged: true` 时只查 bundled 产物
- `isPackaged: false` 时才允许 `env` / `PATH` fallback

但 M4 和 M7 又把规则写成统一的“bundled -> env -> PATH”。

**问题**

这不是描述风格不同，而是实际行为不同。
如果按 M4/M7 实现，生产包可能误用用户机器上的旧 backend，直接违背设计文档的安全边界。

**涉及位置**

- [`webui-decouple-electron-design.md`](../plans/2026-05-07-webui-decouple-electron-design.md) 第 255-269 行
- [`2026-05-07-m4-backend-launcher-migration-requirements.md`](../plans/2026-05-07-m4-backend-launcher-migration-requirements.md) 第 39-40 行
- [`2026-05-07-m7-prepare-backend-ci-requirements.md`](../plans/2026-05-07-m7-prepare-backend-ci-requirements.md) 第 36 行

**建议**

把“生产模式”和“开发模式”两档规则原封不动抄到 M4、M7、M8 中，彻底删除“bundled -> env -> PATH”这种扁平表述。

### 4. M5 的测试口径自相矛盾

**现状**

- M5 一处写“所有测试全 mock，不起真 HTTP server 或真 backend”
- 但同一个验收章节又要求 `equivalence.test.ts` 同时启动老 webserver 和新 static-server，在两个真实端口上做响应对比

**问题**

执行者会不知道“起真 server”到底算不算越界。
这会直接影响测试实现方式，也会影响 plan-writer 对阶段拆分的判断。

**涉及位置**

- [`2026-05-07-m5-static-server-auth-migration-requirements.md`](../plans/2026-05-07-m5-static-server-auth-migration-requirements.md) 第 68-84 行

**建议**

把 M5 测试拆成两层并显式命名:

1. **unit**: 全 mock，不起真 backend，不起真 HTTP server
2. **integration / equivalence**: 可起真 HTTP server，对比老新两套实现，但 backend 仍可 mock

这样 M5 的执行边界会清楚很多。

### 5. M8 到 M9 的 release 责任链没有闭环

**现状**

- M8 说自己“不自动上传到 Release”，只保证 workflow artifact
- M9 却默认 tarball 已经是 release artifact，并且还要求 `.sha256`
- 但没有任何一个里程碑明确负责:
  - 把 M8 的 tarball 发布为 release asset
  - 为 tarball 生成 `.sha256`
  - 让 M9 的 install 脚本可以稳定消费这些 release asset

**问题**

当前链路只能保证“构建产物存在”，不能保证“用户可通过 release 安装”。
这会导致 M9 的 install 脚本依赖一个并未被上游正式交付的发布契约。

**涉及位置**

- [`2026-05-07-m8-web-cli-tarball-requirements.md`](../plans/2026-05-07-m8-web-cli-tarball-requirements.md) 第 47-48、109-114 行
- [`2026-05-07-m9-install-web-script-requirements.md`](../plans/2026-05-07-m9-install-web-script-requirements.md) 第 112-115、148 行

**建议**

在 M8 或 M9 里明确新增一条责任，不要悬空:

1. **方案 A**: M8 负责 release asset + tarball sha256，M9 只消费
2. **方案 B**: M8 只产 workflow artifact，M9 一并补 release publish 和 sha256

从里程碑边界看，更推荐方案 A。否则 M9 会同时背安装脚本和发布链收口，职责过重。

### 6. `restoreDesktopWebUIFromPreferences` 的归属不合理

**现状**

- 设计文档强调 `web-host` 只负责 backend/static/auth
- 但设计文档迁移表和 M6 决策又把 `restoreDesktopWebUIFromPreferences` 放进 `packages/web-host/src/auth/config.ts`

**问题**

“自动恢复桌面开关状态”本质上是 desktop shell 的启动策略，不是 auth/config 能力。
如果把这部分放进 web-host，shared host 会开始知道桌面专属偏好语义，边界会被污染。

**涉及位置**

- [`webui-decouple-electron-design.md`](../plans/2026-05-07-webui-decouple-electron-design.md) 第 46-47 行
- [`webui-decouple-electron-design.md`](../plans/2026-05-07-webui-decouple-electron-design.md) 第 607 行
- [`2026-05-07-m6-three-paths-cutover-requirements.md`](../plans/2026-05-07-m6-three-paths-cutover-requirements.md) 第 58 行

**建议**

把职责拆开:

- `web-host` 只提供 config 读写和 host 启停能力
- `packages/desktop/` 保留“是否自动恢复、何时恢复”的编排逻辑

也就是说，恢复逻辑应当 **调用** web-host，而不是 **迁入** web-host。

### 7. Team playbook 的适用环境没有显式限定

**现状**

- playbook 直接依赖 `TeamCreate`、`Agent`、`SendMessage` 这套 team-mode 工具
- 还明确写了“只有 M1 plan 已经写好，M2-M9 在执行时分批产出”
- 但仓库里目前已经存在的 M2-M9 文档实际上是 requirement docs，不是 detailed execution plans

**问题**

如果读者不在 Claude team 环境里，playbook 其实不可执行。
同时，“requirements”和“detailed plan”两层文档的关系也没有命名清楚，容易误读。

**涉及位置**

- [`webui-decouple-team-playbook.md`](../plans/2026-05-07-webui-decouple-team-playbook.md) 第 111-118 行
- [`webui-decouple-team-playbook.md`](../plans/2026-05-07-webui-decouple-team-playbook.md) 第 283-314 行
- [`2026-05-07-m2-aionrs-cleanup-requirements.md`](../plans/2026-05-07-m2-aionrs-cleanup-requirements.md) 第 1-7 行
- [`2026-05-07-m8-web-cli-tarball-requirements.md`](../plans/2026-05-07-m8-web-cli-tarball-requirements.md) 第 1-8 行

**建议**

建议补两句硬约束:

1. 明确标注“该 playbook 仅适用于 Claude Code team-mode”
2. 明确命名关系:
   - `*-requirements.md` 负责“做什么”
   - `*-plan.md` 负责“怎么做”

否则同一个里程碑现在既像“需求说明”，又像“执行计划”，语义会混。

## 次要但建议尽快修的问题

### 1. M9 的 Windows 口径前后不一致

M9 的“做什么”里写了 Windows 安装目录，但“边界”又写本里程碑不覆盖 Windows。

**建议**

直接删掉做什么里的 Windows 安装目录描述，只保留一句:
“Windows 用户本里程碑通过手动解压 zip 使用，不走 install-web.sh。”

### 2. M9 出现了未在参数列表声明的 `--no-path`

M9 决策表里说支持 `--no-path`，但前面的参数列表和验收命令都没有它。

**建议**

二选一:

1. 正式把 `--no-path` 加到参数支持和验收标准里
2. 或从决策表删掉 `--no-path`

不要让实现者自己判断这个参数到底存不存在。

### 3. M6 里还有 pre-M1 的旧路径写法

M6 还在写 `src/common/platform/register-node.ts`，但文档整体上下文已经进入 `packages/desktop/` 结构。

**建议**

在 M6 中统一改成 M1 之后的真实路径，避免执行时 grep 不到文件。

## 建议的修正文档顺序

为了尽量少返工，建议按这个顺序修:

1. 先修设计文档中的公共规则
2. 再同步修 M3 / M4 / M5 / M6 / M8 / M9 的需求文档
3. 最后修 playbook 对 requirements / plan 的命名和适用环境说明

具体优先级如下:

1. **P0**
   - `install-web.sh` 的 `sh` / `bash` 口径
   - `binaryResolver` 的 packaged / dev 两档查找规则
   - `webuiChangePassword` 的公共接口契约
   - M8 → M9 的 release asset / sha256 闭环
2. **P1**
   - `restoreDesktopWebUIFromPreferences` 的职责归属
   - M5 的 unit / integration 测试分层
3. **P2**
   - playbook 适用环境说明
   - M9 Windows 口径
   - `--no-path`
   - M6 的旧路径

## 建议的最小改法

如果目标是最短时间内把这套文档修到“可执行”，可以只做下面这些最小改动:

1. 在设计文档新增一个“统一约束补充”小节，锁定:
   - install 脚本执行方式
   - binary resolver 两档规则
   - auth 对外公共接口
2. 在 M5 验收里把测试明确拆成 `unit` 与 `equivalence`
3. 在 M8 或 M9 中明确谁负责 release asset 与 `.sha256`
4. 在 M6 中把自动恢复逻辑的归属改成“桌面壳编排，调用 web-host”
5. 在 playbook 开头标明“只适用于 Claude team-mode”，并把 requirements / plan 两层命名固定下来

完成这几步后，整套文档的执行风险会明显下降。
