# M7 prepareAionuiBackend 接入打包 + 过渡开关 - 需求文档

- **日期**:2026-05-07
- **里程碑**:M7
- **上游**:M6(`feat/m6-three-paths-cutover` 已 merge)
- **对应设计文档节**:核心原则(backend 是硬依赖 + 过渡期 ALLOW_MISSING) +
  改造要点 G(aionui-web 的 GitHub Release 打包流程 + 桌面打包 bug 修复) +
  改造要点 F1(测试环境过渡期策略) + 里程碑清单 M7 行

## 做什么

1. **把核心下载函数抽到共享脚本**:`packages/shared-scripts/prepare-aionui-backend.js`
   导出 `prepareBackend({ targetDir, platform, arch, version })` 可参数化函数
2. **把 `prepareAionuiBackend()` 正式接入桌面打包流程**:
   `scripts/build-with-builder.js` 中(M1 后的实际位置)加一行调用,
   在 `prepareBundledBun()` / `prepareHubResources.js` 附近
   (M2 已删除 `prepareAionrs` 调用,位置对比 M1 plan 阶段 4 要重新定位)
3. **失败策略升级为硬失败**:
   - 默认:任何下载/解压失败 → 抛错,让 `bun run build` 非零退出
   - 过渡期开关:环境变量 `AIONUI_BACKEND_ALLOW_MISSING=1` 时降级为
     warn + 写 `skipped: true` 的 manifest(兼容 aionrs Release CI 尚未稳定
     的阶段)
4. **保留原 `scripts/prepareAionuiBackend.js`** 文件入口,内部改为
   require 新的 `packages/shared-scripts/` 并委托(薄代理,保持 CI 脚本
   现有调用方式不破坏)
5. **文档**:在 `CONTRIBUTING.md` 或独立 `docs/build.md`(按仓库惯例选)
   简单说明 `AIONUI_BACKEND_ALLOW_MISSING` 开关用法

## 不做什么(边界)

- ❌ **不动** aionui-backend 的 Rust 代码
- ❌ **不动** aionui-web tarball 打包(那是 M8)
- ❌ **不做** Docker / Homebrew / install.sh(那是 M8 / M9)
- ❌ **不做** CI 层 allow-list 绑定(过渡期开关由人类在 workflow 里手动
  加;M7 不自动加)
- ❌ **不改** backend 二进制的查找顺序;严格按设计文档 UC-2 的两档规则
  (生产模式严格查 bundled,开发模式才允许 env / PATH / 兄弟目录 fallback)
- ❌ **不清理**其他 `prepareXXX.js`(bun、hub 等继续保留)

## 已定决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| 核心函数位置 | `packages/shared-scripts/prepare-aionui-backend.js` | 跨包共享;M8 也会用 |
| 原 `scripts/prepareAionuiBackend.js` | 薄代理,不直接删 | 避免破坏外部 CI 调用 |
| 过渡期开关名 | `AIONUI_BACKEND_ALLOW_MISSING=1` | 设计文档已定 |
| 过渡期开关默认值 | **关闭**(硬失败是默认) | 设计文档已定 |
| 过渡期开关作用范围 | 仅 CI build 阶段;aionui-web postinstall 不受影响 | postinstall 由 M8 定义 |
| 硬失败的错误抛出方式 | `throw new Error('...')`,让调用方的 try/catch 捕获后以非零 exit 退出 | 保持与仓库其他 `prepareXXX` 风格一致 |
| manifest 文件 schema | `skipped: true` 时写 `{ platform, arch, version, skipped: true, reason }`;成功时写 `{ platform, arch, version, binary: 'aionui-backend' }` | 和 aionrs/bun 的 manifest 风格对齐 |
| 下载源 | `iOfficeAI/aionui-backend` GitHub Release | 设计文档已定 |
| 对已下载 backend 的缓存策略 | 不实现(每次重新下载) | aionrs 原脚本也不缓存,保持一致 |
| 本里程碑是否删除过渡开关 | **不删除**,等 backend CI 稳定后由人类提 follow-up 清理 | 设计文档已定 |

## 验收标准

**验证分层**(与 playbook checkpoint 语义一致):
- **Executor 放行门禁 - 本地**(push 前必须通过):函数抽取正确 + 硬失败
  生效 + 过渡开关生效 + 本地打包冒烟
- **Executor 放行门禁 - CI**(M7 feature 分支 CI 必须绿):完整
  `bun run build-mac:arm64` 在 CI 环境下产出 dmg 且
  `resources/bundled-aionui-backend/` 存在
- **发布链最终验证**:M7 本身不涉及 release 链路,无此层

**函数抽取**:

```bash
ls packages/shared-scripts/prepare-aionui-backend.js
# 预期:存在

# 函数对外签名正确
node -e "const p = require('./packages/shared-scripts/prepare-aionui-backend.js'); console.log(typeof p.prepareBackend);"
# 预期:function
```

**桌面打包流程接入**:

```bash
# 打包前的 resources/ 状态
rm -rf resources/bundled-aionui-backend

# 正常打包(需要网络访问 GitHub Release)
bun run build-mac:arm64
# 预期:退出 0,且
ls resources/bundled-aionui-backend/darwin-arm64/aionui-backend
# 预期:文件存在

# asar 产物中 backend 存在
bunx @electron/asar list dist/mac-arm64/*.app/Contents/Resources/*.asar 2>&1 | head
# 或(更可能 backend 是 extraResources):
find dist/mac-arm64/*.app/Contents/Resources/bundled-aionui-backend -type f
# 预期:找到 aionui-backend 二进制
```

**硬失败生效**:

```bash
# 模拟下载失败:断网或用不存在的 tag
AIONUI_BACKEND_VERSION=v999.999.999-nonexistent bun run build-mac:arm64 2>&1 | tail -5
echo "exit_code=$?"
# 预期:exit_code 非 0;stderr 有明确错误信息
```

**过渡开关生效**:

```bash
# 带 ALLOW_MISSING 重跑
AIONUI_BACKEND_VERSION=v999.999.999-nonexistent \
AIONUI_BACKEND_ALLOW_MISSING=1 \
  bun run build-mac:arm64 2>&1 | tail -10
echo "exit_code=$?"
# 预期:exit_code 0;stderr/stdout 有 warn;
ls resources/bundled-aionui-backend/darwin-arm64/manifest.json
# 预期:存在,内容包含 skipped: true
```

**原 scripts/prepareAionuiBackend.js 仍可用**:

```bash
node scripts/prepareAionuiBackend.js 2>&1 | head -5
# 预期:能跑(走到核心函数)
```

**不影响其他流程**:

```bash
bun run dev &   # 桌面启动不回归
bun run webui & # WebUI 启动不回归
bun test        # 全仓测试通过
```

## 关键风险

| 风险 | 缓解 |
|---|---|
| `prepareAionuiBackend()` 调用点在 M1+M2 后的位置与设计文档里"`build-with-builder.js:460`"不同 | plan-writer 先 `grep -n "prepareBundledBun\|prepareHubResources" scripts/build-with-builder.js` 找实际调用点 |
| 抽函数后老 API 签名不兼容原脚本期望 | 先读原 `scripts/prepareAionuiBackend.js` 完整逻辑,新函数的参数/返回值和原来一致或超集 |
| 硬失败策略让 backend CI 本身的 bug 被放大(CI 挂后所有下游 CI 挂) | 过渡期开关 `AIONUI_BACKEND_ALLOW_MISSING=1` 作为逃生门;文档说明如何启用 |
| CI pipeline 在某些场景(比如 lint-only job)不需要 backend | plan-writer 检查 `.github/workflows/*.yml`,只在实际 build job 里跑 `prepareAionuiBackend`,lint / test job 不跑 |
| 下载的 backend 二进制对当前 builder 平台不兼容(例如 CI 运行 cross-compile) | 沿用 aionrs 原脚本里 `AIONUI_BACKEND_ARCH` / `npm_config_target_arch` 的 cross-compile 支持 |
| `AIONUI_BACKEND_ALLOW_MISSING` 开关被误用(生产 release 忘关) | 在 `scripts/prepareAionuiBackend.js` 里,当 `CI=true` 且 `ALLOW_MISSING=1` 时打印显眼警告到 stderr;`verify-release-assets.sh` 加一条"若 skipped=true 则 release 审查拒绝" |
| 抽共享函数后跨包 import 需要打通 workspace | `packages/shared-scripts/package.json` 声明为 workspace 成员;桌面脚本通过 `require('@aionui/shared-scripts/prepare-aionui-backend')` 或相对路径 `require('../../packages/shared-scripts/...')` 调用 —— plan-writer 决定 |

## 依赖上游

- **M6 已合入**:整条 WebUI 链路已完工,`packages/desktop/` 目录结构
  稳定,backend 启动路径唯一
- **M1/M2 已合入**:`scripts/build-with-builder.js` 路径调整(移除
  `prepareAionrs`)已完成
- **读 M6 handoff**:确认是否有 IPC 接口微变(如有可能影响 build 脚本?一般不会)
- **读 M2 handoff**:确认 `prepareAionrs()` 在 `build-with-builder.js` 的
  删除位置,本里程碑新增调用应在类似位置

## 分支与 handoff

- 上游分支:`origin/feat/m6-three-paths-cutover`
- 本里程碑分支:`feat/m7-prepare-backend-ci`
- handoff 位置:`docs/backend-migration/handoffs/M7-outcome.md`
- handoff 必须附:
  - `prepareBackend()` 函数的参数/返回值签名(给 M8 用)
  - 在 `build-with-builder.js` 的具体调用位置(行号 + 上下文)
  - `AIONUI_BACKEND_ALLOW_MISSING` 开关的启用方式示例
- 完成后 push 前:必须 `git merge origin/feat/backend-migration`

## 预计执行时间

3-5 小时(主要是抽函数、接入打包流程、三组验证:正常路径 / 硬失败 /
过渡开关)
