# POUNDING 上游同步策略

本文档定义：未来从上游 `iOfficeAI/AionUi` 吸收修复与功能时，如何**有序同步**，同时**不破坏 POUNDING 的品牌化、COS 更新链路、模型托管与技能预装**。

## 目标

- 保持与上游的 bugfix / 安全修复同步
- 保留 POUNDING 的品牌、文案、图标、命名、更新源、默认模型托管逻辑
- 前端与后端分仓独立维护，避免互相污染
- 每次同步都可回滚、可复查、可验证

## 固定原则

1. **主分支不直接改**
   - `main` 只接收已经验证过的变更
   - 上游同步先进入专用分支，再 review / test / merge

2. **一层基线，一层品牌覆盖**
   - 上游代码视为“基线层”
   - POUNDING 的品牌化、COS、AionCore 兼容、skills 预装、模型托管视为“覆盖层”

3. **保护区优先**
   - 任何触碰以下内容的 upstream 改动，都必须人工确认：
     - 品牌名 / Logo / 文案 / 图标
     - 自动更新地址、GitHub Release / COS 分发
     - `AIONUI_*` / `POUNDING_*` 配置注入
     - 预装 skills / builtin assets / MCP 约定
     - 前端与 `AionCore` 后端联动

4. **先吸收修复，再吸收重构**
   - 优先合并：崩溃修复、兼容修复、构建修复、安全修复
   - 延后合并：大规模重构、命名清理、UI 改版、结构性迁移

5. **历史不一致时不硬 merge**
   - 如果本地 fork 与上游不是干净同源历史，禁止直接把 upstream 整条分支 merge 进来
   - 改用 `cherry-pick`、补丁移植、主题分支重放，或按文件/commit 逐项吸收

6. **冲突以本地产品目标为准**
   - 上游与 POUNDING 定制冲突时，优先保留 POUNDING 的产品目标
   - 上游逻辑尽量通过适配器、包装层、映射层接入，而不是直接覆盖本地定制

## 建议分支模型

### 1) 稳定线

- `main`
- 只放已验证的 POUNDING 稳定版本

### 2) 上游同步线

- `sync/upstream-<upstream-tag>`
- 例：`sync/upstream-v2.0.5-dev-fc2a899`
- 每次只处理一个上游基线

### 3) 主题修复线

- `feat/...` / `fix/...`
- 用于从同步线继续拆分特定改动

## 当前基线建议优先吸收的上游内容

基于当前 `2.0.2 -> 2.0.5` 与 `AionCore v0.1.7` 的差异，建议按下面顺序吸收：

### 批次 1：命名 / 包装层对齐（低风险）

先吸收只影响命名、脚本、打包布局的改动：

- `aea815adb` — `aionuiBackendVersion` / `prepareAioncore` / `resolveAioncoreVersion`
- `db5aad399` — `aioncli` → `aioncore` 的全局命名迁移
- `5b91faf4c` — 旧后端二进制名的历史兼容调整
- `973e784f4` — web-cli smoke test 目录名更新

这类改动适合先做，因为它们通常不改变业务行为，只改变名字、目录、产物和查找路径。

### 批次 2：聊天稳定性 / 交互修复（中低风险）

优先吸收会直接减少用户报错或卡顿的修复：

- `697c8c158` — conversation 丢失时返回首页
- `4f26f3309` — 停止请求错误不再导致未处理拒绝
- `1d2155825` — team mode 下 slash command 预热后再取
- `69fb9cb95` — ChatLayout DOM 结构统一，避免 preview 切换导致子节点卸载

这类修复通常不触碰品牌，但会明显改善稳定性，适合优先吸收。

### 批次 3：构建 / 测试 / CI 适配（中风险）

再吸收只影响构建、CI、烟雾测试与发布路径的改动：

- `.github/workflows/_build-reusable.yml` 中和 backend / bundle 目录相关的修复
- `scripts/smoke-test-web-cli.sh` 的 bundled 目录名调整
- `scripts/pack-web-cli.js`、`scripts/build-with-builder.js` 的打包路径一致化

这类改动应在本地验证打包链路后再合并。

### 批次 4：产品层功能与重构（高风险）

最后才考虑吸收：

- 大面积组件重构
- 命名全面收敛
- 视觉改版
- 新的 assistant / skill / MCP 架构变更

这些内容最容易和 POUNDING 品牌层、模型托管层冲突，应该拆小后再移植。

### AionCore 后端同步顺序

后端仓库建议单独处理，优先吸收：

- `ae78cd1` / `30eeca3`：二进制命名迁移
- `a7b93e7`：provider env 注入
- `dfeece0`：OpenClaw 协议兼容
- `eb65dfe`：channel/model extra 传参修复
- `40a7e83`：AionUI → AionCore 命名说明同步

后端如果需要和前端配合，只通过发布产物、环境变量和协议约定协作，不建议直接把两个仓库混成一条提交线。

## 推荐同步流程

### Step 1：冻结当前 POUNDING 基线

先确认当前 fork 的可交付状态：

- 品牌化是否完整
- COS 更新是否可用
- AionCore 后端是否可拉取
- skills 预装是否存在
- 模型托管是否仍是零配置

### Step 2：拉取上游并生成 diff

比较对象建议为：

- 上游：`iOfficeAI/AionUi` 的目标 tag / branch
- 本地：当前 POUNDING 稳定基线

重点看：

- `packages/desktop/src/renderer/**`
- `packages/desktop/src/process/**`
- `.github/workflows/**`
- `scripts/**`
- `docs/**`

### Step 3：分流处理变更

把上游改动分成三类：

| 类别               | 处理方式                         |
| ------------------ | -------------------------------- |
| 可直接吸收         | 合并并补测试                     |
| 需要适配           | 抽成本地 wrapper / 映射 / 配置层 |
| 破坏品牌或发布链路 | 拒绝直接覆盖，改为局部移植       |

### Step 4：保护覆盖层不被冲掉

以下目录/文件建议作为“保护层”优先保留：

- `packages/desktop/src/renderer/services/i18n/locales/**`
- `packages/desktop/src/renderer/components/layout/**`
- `packages/desktop/src/common/config/sentry.ts`
- `packages/desktop/src/process/backend/binaryResolver.ts`
- `docs/guides/pounding-release-update.md`
- `docs/guides/skills-model-env.md`
- `.github/workflows/release-distribute.yml`

## 变更合并规则

### 规则 A：品牌命名不回退

- `POUNDING`、`POUNDING CLI`、`POUNDING API`、红色桃心 Logo 不允许被 upstream 覆盖回旧名

### 规则 B：更新链路不回退

- 更新源默认仍以 POUNDING 的 GitHub Release / COS 链路为准
- 上游新的更新实现只能通过“可选适配”接入

### 规则 C：模型与 skills 不回退

- 用户登录后自动配置的模型能力必须保持
- skills / MCP / builtin assets 继续复用宿主注入，不允许重新要求用户配置

### 规则 D：后端兼容层优先

- 当上游后端升级命名或目录结构时，优先做兼容层
- 兼容稳定后，再考虑逐步迁移调用点

## 禁止直接吸收的上游改动

以下文件即使上游有新提交，也**不能直接按 upstream 原样覆盖**，必须先人工比对，再以“局部移植”的方式吸收真正需要的 bugfix。

### 1) 品牌与产品身份层

- `packages/desktop/src/common/platform/index.ts`
  - 上游可能回退为 `AionUi-Dev`
  - 本地必须保留 `POUNDING-Dev`
- `packages/desktop/src/process/index.ts`
  - 上游日志标记可能回退为 `AionUi:process`
  - 本地必须保留 `[POUNDING:process]`
- `packages/desktop/src/renderer/components/layout/Titlebar/index.tsx`
  - 上游可能回退窗口标题与 Logo
  - 本地必须保留 `POUNDING` 与桃心品牌图
- `packages/desktop/src/renderer/pages/login/index.tsx`
  - 上游可能替换登录页品牌图与文案
  - 本地只能吸收功能修复，不能回退品牌视觉

### 2) 更新与分发层

- `packages/desktop/src/common/update/updateTypes.ts`
  - 上游默认仓库说明可能指向 `iOfficeAI/AionUi`
  - 本地必须保留 POUNDING 的默认仓库 / 更新源说明
- `packages/desktop/src/process/services/autoUpdaterService.ts`
  - 上游可能移除或覆盖运行时 feed override
  - 本地必须保留 GitHub Release / COS 的自有更新链路能力
- `.github/workflows/**`
  - 任何涉及 release、publish、artifact upload、updater manifest 的改动都不能盲合
  - 必须确认不会把上传目标从 POUNDING 仓库/COS 切回上游默认

### 3) 桌面账户 / CLI 托管安装层

- `packages/desktop/src/process/bridge/newApiAccountBridge.ts`
- `packages/desktop/src/process/bridge/managedCliInstallerBridge.ts`
- `packages/desktop/src/process/bridge/index.ts`
- `packages/desktop/src/common/types/agent/managedCliInstaller.ts`
  - 上游如果删除或收敛这些桥接层，不能直接跟删
  - 本地要继续支持桌面账户、受管 CLI 安装/卸载、零配置模型接入

### 4) 内置 skills / AionCore 兼容层

- `packages/desktop/src/process/backend/binaryResolver.ts`
- `packages/shared-scripts/src/prepare-aioncore.js`
- `scripts/prepareAioncore.js`
- `scripts/resolveAioncoreVersion.js`
- `packages/desktop/electron-builder.yml`
  - 上游即使调整目录名或 bundle 名，也必须优先保留本地的 AionCore 兼容与打包产物约定

### 吸收方式要求

遇到以上保护区文件时，采用以下规则：

1. 先识别上游改动属于：
   - 纯 bugfix
   - 结构整理
   - 品牌/发布/产品策略回退
2. 只移植真正需要的 bugfix 片段
3. 不接受整文件覆盖
4. 合并后必须额外验证：
   - 品牌文案
   - 更新源
   - CLI 安装/卸载
   - AionCore 发现与启动
   - skills / 模型托管链路

## 每次同步前的检查清单

- [ ] 已确认上游目标 commit / tag
- [ ] 已创建独立同步分支
- [ ] 已保存当前 fork 的品牌化改动
- [ ] 已梳理会碰到的保护区文件
- [ ] 已准备回滚点 / baseline tag
- [ ] 已确认前端与后端仓库分别同步，不混合提交

## 每次同步后的验证清单

至少验证：

- `bunx tsc --noEmit`
- 相关 `vitest` / smoke test
- 受影响的 e2e / 更新链路检查
- 受影响的 i18n 检查
- 品牌化 UI 是否仍正确
- AionCore 后端是否仍可被前端正确识别

## 前后端协作方式

### 前端仓库

负责：

- UI / 品牌 / 更新 / 模型托管 / skills 注入入口
- 从 `AionCore` 发布产物拉取后端二进制

### 后端仓库 `AionCore`

负责：

- builtin skills
- agent/runtime 逻辑
- 后端能力升级
- 后端发布产物生成

### 协作原则

- 前端不直接拷贝后端源码
- 后端不直接改前端 UI
- 双方通过 release 产物、接口约定、配置约定协作

## 结论

**上游更新可以吸收，但必须先经过“同步分支 → 保护层审查 → 验证 → 合并”四步。**

这样既能持续获得上游修复，也不会把 POUNDING 的品牌化和国内可用链路冲掉。
