# M7: Prepare Backend CI - Detailed Plan

**迁移目标**: 在 CI 中准备 aionui-backend 二进制,使桌面构建产物包含 bundled-aionui-backend,为后续 M8/M9 迁移提供预打包的后端二进制。

**前提条件**:
- M6 已完成:三条路径已切换到 `@aionui/web-host`,老 webserver 已删除
- `scripts/prepareAionuiBackend.js` 已存在,可以从 GitHub releases 下载 aionui-backend 二进制
- CI workflow `.github/workflows/_build-reusable.yml` 已配置

**核心任务**:
1. 在 CI build job 中添加 prepareAionuiBackend 调用
2. 配置外部依赖预检(确保 aionui-backend release 存在)
3. 添加 `AIONUI_BACKEND_ALLOW_MISSING=1` 环境变量作为过渡开关
4. 修改 prepareAionuiBackend.js 下载失败时的行为(从 warn 改为 hard fail when not allowed)
5. 将 prepareAionuiBackend.js 拆分为 module 形态(M8 的 `@aionui/shared-scripts` 需要)
6. 验证 CI 产物中包含 `resources/bundled-aionui-backend/{platform}-{arch}/aionui-backend[.exe]`
7. 在 M7 feature 分支上跑 CI checkpoint,确保 build job 绿且产物正确

---

## 阶段化分解

### Phase 0: Baseline & Pre-Flight

**目的**: 确认当前构建状态,记录未引入 backend 打包前的基线。

**操作**:

1. **确认分支基于 M6**:
   ```bash
   git fetch origin
   git checkout -b feat/m7-prepare-backend-ci origin/feat/m6-three-paths-cutover
   git log --oneline -1
   ```

2. **记录当前 CI 构建状态**:
   - 检查 `.github/workflows/_build-reusable.yml` 中 build job 的步骤
   - 确认 `scripts/prepareAionuiBackend.js` 已存在但未被 CI 调用
   - 检查 `scripts/build-with-builder.js` 是否调用 `prepareAionuiBackend`

   ```bash
   grep -n "prepareAionuiBackend" scripts/build-with-builder.js
   grep -n "prepareAionuiBackend" .github/workflows/_build-reusable.yml
   ```

3. **检查 electron-builder.yml 中的 extraResources 配置**:
   ```bash
   grep -A 5 "bundled-aionui-backend" packages/desktop/electron-builder.yml
   ```
   预期:已有 `from: resources/bundled-aionui-backend` 配置(M2 清理后保留)

4. **检查 aionui-backend release 是否存在**:
   ```bash
   gh api repos/iOfficeAI/aionui-backend/releases/latest --jq '.tag_name'
   ```
   如果失败,说明外部依赖不满足,需要先创建 aionui-backend release(超出 M7 scope,记录为 blocker)

**产出**:
- 分支 `feat/m7-prepare-backend-ci` 基于 M6
- 记录当前 CI 不调用 prepareAionuiBackend 的基线状态
- 确认 aionui-backend release 可访问(或记录 blocker)

---

### Phase 1: Add prepareAionuiBackend Call in build-with-builder.js

**目的**: 在本地构建流程中调用 prepareAionuiBackend,为 CI 集成铺路。

**操作**:

1. **修改 `scripts/build-with-builder.js`**:
   - 在 `prepareBundledBun()` 调用之前添加 `prepareAionuiBackend()` 调用
   - 位置:第 456 行左右,`prepareBundledBun()` 之前

   ```javascript
   // 5. Prepare bundled bun/bunx binaries (for packaged runtime usage)
   prepareBundledBun();

   // 5a. Prepare aionui-backend binary (for packaged runtime usage)
   const prepareAionuiBackend = require('./prepareAionuiBackend');
   prepareAionuiBackend();
   ```

2. **本地测试**:
   ```bash
   # 先清理已有的 bundled-aionui-backend
   rm -rf resources/bundled-aionui-backend

   # 运行构建(仅打包,不生成分发包)
   bun run build --pack-only

   # 验证产物
   ls -lh resources/bundled-aionui-backend/
   # 预期:看到 {platform}-{arch}/aionui-backend[.exe] 和 manifest.json
   ```

3. **验证 manifest.json 内容**:
   ```bash
   cat resources/bundled-aionui-backend/darwin-arm64/manifest.json
   ```
   预期字段:
   - `sourceType: "download"`
   - `version: "v0.x.x"` (实际版本)
   - `files: ["aionui-backend"]`
   - `skipped: false`

**产出**:
- `scripts/build-with-builder.js` 已添加 `prepareAionuiBackend()` 调用
- 本地构建验证通过,`resources/bundled-aionui-backend/` 产生正确结构

---

### Phase 2: Add AIONUI_BACKEND_ALLOW_MISSING Environment Variable

**目的**: 添加过渡开关,允许在 aionui-backend release 不存在时跳过打包(避免 CI 在 backend release 未就绪时全面红灯)。

**操作**:

1. **修改 `scripts/prepareAionuiBackend.js`**:
   - 在 `prepareAionuiBackend()` 函数开头检查环境变量 `AIONUI_BACKEND_ALLOW_MISSING`
   - 如果设置为 `"1"` 且下载失败,写 skip manifest 并返回(与当前行为一致)
   - 如果未设置或为 `"0"`,下载失败时抛出异常(hard fail)

   ```javascript
   function prepareAionuiBackend() {
     const allowMissing = process.env.AIONUI_BACKEND_ALLOW_MISSING === '1';
     // ... existing code ...

     // Write result
     if (sourcePath) {
       // ... success path ...
     }

     // Not found
     if (allowMissing) {
       const manifest = { /* ... */ skipped: true, reason: '...' };
       writeJson(path.join(targetDir, 'manifest.json'), manifest);
       console.warn(`  aionui-backend not found — skipping bundle (AIONUI_BACKEND_ALLOW_MISSING=1)`);
       return { prepared: false, reason: 'not_found' };
     } else {
       throw new Error('aionui-backend binary not found and AIONUI_BACKEND_ALLOW_MISSING is not set');
     }
   }
   ```

2. **本地测试 hard fail 行为**:
   ```bash
   # 模拟 release 不存在(设置错误的版本)
   AIONUI_BACKEND_VERSION=v999.999.999 bun run build --pack-only
   # 预期:抛出异常,构建失败

   # 设置 ALLOW_MISSING 开关
   AIONUI_BACKEND_VERSION=v999.999.999 AIONUI_BACKEND_ALLOW_MISSING=1 bun run build --pack-only
   # 预期:warn 并写 skip manifest,构建继续
   ```

3. **验证 skip manifest 内容**:
   ```bash
   cat resources/bundled-aionui-backend/darwin-arm64/manifest.json
   ```
   预期字段:
   - `sourceType: "none"`
   - `skipped: true`
   - `reason: "aionui-backend binary not found ..."`

**产出**:
- `scripts/prepareAionuiBackend.js` 支持 `AIONUI_BACKEND_ALLOW_MISSING` 开关
- 本地测试验证 hard fail 和 soft warn 两种行为

---

### Phase 3: Extract prepareAionuiBackend as Reusable Module

**目的**: 将 `scripts/prepareAionuiBackend.js` 拆分为 CommonJS module,供 M8 的 `@aionui/shared-scripts` 包使用。

**操作**:

1. **创建 `packages/shared-scripts/` 目录结构**(如果不存在):
   ```bash
   mkdir -p packages/shared-scripts/src
   ```

2. **移动并重构 `prepareAionuiBackend.js`**:
   - 将 `scripts/prepareAionuiBackend.js` 的核心逻辑拆分为:
     - `packages/shared-scripts/src/prepare-aionui-backend.js` (纯函数,可导出)
     - `scripts/prepareAionuiBackend.js` 保留为 CLI wrapper(调用 shared-scripts 中的函数)

   ```javascript
   // packages/shared-scripts/src/prepare-aionui-backend.js
   /**
    * Prepare aionui-backend binary for packaging.
    * @param {object} options
    * @param {string} options.projectRoot - 项目根目录
    * @param {string} options.platform - 目标平台 (process.platform)
    * @param {string} options.arch - 目标架构 (process.arch)
    * @param {string} options.version - backend 版本 (default: 'latest')
    * @param {boolean} options.allowMissing - 是否允许 backend 缺失
    * @returns {{ prepared: boolean; dir?: string; sourceType?: string; reason?: string }}
    */
   function prepareAionuiBackend(options) {
     // ... move logic from scripts/prepareAionuiBackend.js ...
   }

   module.exports = { prepareAionuiBackend };
   ```

   ```javascript
   // scripts/prepareAionuiBackend.js (CLI wrapper)
   const path = require('path');
   const { prepareAionuiBackend } = require('../packages/shared-scripts/src/prepare-aionui-backend.js');

   const projectRoot = path.resolve(__dirname, '..');
   const platform = process.platform;
   const arch = process.env.AIONUI_BACKEND_ARCH || process.env.npm_config_target_arch || process.arch;
   const version = process.env.AIONUI_BACKEND_VERSION || 'latest';
   const allowMissing = process.env.AIONUI_BACKEND_ALLOW_MISSING === '1';

   try {
     prepareAionuiBackend({ projectRoot, platform, arch, version, allowMissing });
   } catch (error) {
     console.error('❌ prepareAionuiBackend failed:', error.message);
     process.exit(1);
   }
   ```

3. **更新 `scripts/build-with-builder.js` 调用**:
   - 保持调用 `scripts/prepareAionuiBackend.js`(CLI wrapper),不直接依赖 shared-scripts

4. **本地测试重构后的行为**:
   ```bash
   rm -rf resources/bundled-aionui-backend
   node scripts/prepareAionuiBackend.js
   ls -lh resources/bundled-aionui-backend/
   ```

5. **添加 unit test** `packages/shared-scripts/src/prepare-aionui-backend.test.js`:
   - 测试 `prepareAionuiBackend()` 的成功路径
   - 测试 `allowMissing=false` 时抛出异常
   - 测试 `allowMissing=true` 时写 skip manifest
   - Mock `execSync` / `execFileSync` / `fs` 操作

**产出**:
- `packages/shared-scripts/src/prepare-aionui-backend.js` 作为可复用 module
- `scripts/prepareAionuiBackend.js` 作为 CLI wrapper
- Unit test 覆盖核心逻辑
- 本地测试验证重构后功能不变

---

### Phase 4: Add prepareAionuiBackend Step in CI Workflow

**目的**: 在 CI 中调用 prepareAionuiBackend,确保构建产物包含 bundled-aionui-backend。

**操作**:

1. **修改 `.github/workflows/_build-reusable.yml`**:
   - 在 build job 的 "Build with electron-builder" 步骤之前添加新步骤
   - 位置:在 "Rebuild native modules for Electron" 之后,在 "Build with electron-builder" 之前

   ```yaml
   - name: Prepare aionui-backend binary
     shell: bash
     run: node scripts/prepareAionuiBackend.js
     env:
       AIONUI_BACKEND_VERSION: latest  # 或者从 secrets/vars 读取
       AIONUI_BACKEND_ALLOW_MISSING: '0'  # M7: hard fail
       GH_TOKEN: ${{ secrets.GH_TOKEN }}
       GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
   ```

2. **配置环境变量**:
   - `AIONUI_BACKEND_VERSION`:默认 `latest`,后续可改为 pinned version
   - `AIONUI_BACKEND_ALLOW_MISSING`:M7 设为 `'0'`(hard fail),M9 后可删除
   - `GH_TOKEN` / `GITHUB_TOKEN`:用于访问 GitHub API(避免 rate limit)

3. **添加外部依赖预检步骤**(可选,推荐):
   - 在 code-quality job 中添加预检,提前发现 backend release 不存在的问题

   ```yaml
   - name: Pre-check aionui-backend release
     shell: bash
     run: |
       TAG=$(gh api repos/iOfficeAI/aionui-backend/releases/latest --jq '.tag_name' || echo "")
       if [ -z "$TAG" ]; then
         echo "::error::aionui-backend latest release not found"
         exit 1
       fi
       echo "✅ aionui-backend latest release: $TAG"
     env:
       GH_TOKEN: ${{ secrets.GH_TOKEN }}
   ```

4. **本地模拟 CI 环境测试**:
   ```bash
   # 模拟 CI 环境变量
   export CI=true
   export AIONUI_BACKEND_VERSION=latest
   export AIONUI_BACKEND_ALLOW_MISSING=0
   export GH_TOKEN=<your_token>

   # 清理并重新构建
   rm -rf resources/bundled-aionui-backend out
   bun run build --pack-only

   # 验证产物
   ls -lh resources/bundled-aionui-backend/
   ```

**产出**:
- `.github/workflows/_build-reusable.yml` 已添加 prepareAionuiBackend 步骤
- 可选:code-quality job 中添加外部依赖预检
- 本地模拟 CI 环境测试通过

---

### Phase 5: CI Checkpoint on M7 Feature Branch

**目的**: 在 M7 feature 分支上跑完整 CI,验证 build job 绿且产物包含 bundled-aionui-backend。

**操作**:

1. **提交所有变更到 feature 分支**:
   ```bash
   git add -A
   git commit -m "feat(ci): add prepareAionuiBackend step in CI build

   - Add prepareAionuiBackend() call in build-with-builder.js
   - Add AIONUI_BACKEND_ALLOW_MISSING env var for transition
   - Extract prepareAionuiBackend as reusable module in shared-scripts
   - Add prepareAionuiBackend step in CI workflow before electron-builder
   - Add optional pre-check for aionui-backend release in code-quality job"

   git push origin feat/m7-prepare-backend-ci
   ```

2. **触发 CI 构建**:
   - 方式 1:通过 GitHub UI 手动触发 `build-manual.yml`
   - 方式 2:推送到 feature 分支,等待 CI 自动触发

   ```bash
   # 查看 CI 状态
   gh run list --branch feat/m7-prepare-backend-ci --limit 5
   gh run watch <run-id>
   ```

3. **验证 build job 输出**:
   - 检查 "Prepare aionui-backend binary" 步骤的日志
   - 预期输出:
     ```
     Resolved aionui-backend "latest" → v0.x.x
     Preparing aionui-backend for darwin-arm64 (version: v0.x.x)
       Downloading aionui-backend from https://github.com/iOfficeAI/aionui-backend/releases/download/v0.x.x/...
       Downloaded from GitHub releases
       Bundled aionui-backend prepared: resources/bundled-aionui-backend/darwin-arm64/aionui-backend [source=download]
     ```

4. **下载 CI 产物并验证**:
   ```bash
   # 下载 artifact
   gh run download <run-id> --name aionui-macos-arm64

   # 解压并验证
   unzip AionUi-*.dmg || hdiutil attach AionUi-*.dmg
   # 检查 .app 中是否包含 bundled-aionui-backend
   # 路径:AionUi.app/Contents/Resources/bundled-aionui-backend/
   ```

5. **验证 electron-builder 打包结果**:
   - 确认 `resources/bundled-aionui-backend/` 被正确复制到 app bundle 的 extraResources

**产出**:
- M7 feature 分支 CI 全绿
- 构建产物中包含 `bundled-aionui-backend/{platform}-{arch}/aionui-backend[.exe]`
- manifest.json 显示 `sourceType: "download"` 且 `skipped: false`

---

### Phase 6: Verify Packaged Backend Binary

**目的**: 验证打包后的 backend 二进制可执行且版本正确。

**操作**:

1. **本地验证**(macOS 为例):
   ```bash
   # 构建 DMG
   bun run build --mac dmg

   # 挂载 DMG
   hdiutil attach out/AionUi-*.dmg

   # 检查 backend 二进制
   BACKEND_PATH="/Volumes/AionUi/AionUi.app/Contents/Resources/bundled-aionui-backend/darwin-arm64/aionui-backend"
   ls -lh "$BACKEND_PATH"

   # 验证可执行
   "$BACKEND_PATH" --version
   # 预期输出:aionui-backend v0.x.x

   # 卸载 DMG
   hdiutil detach /Volumes/AionUi
   ```

2. **Windows 验证**(在 CI artifact 中):
   ```bash
   # 下载 Windows artifact
   gh run download <run-id> --name aionui-windows-x64

   # 解压 exe
   unzip AionUi-*-win-x64.zip -d win-test

   # 检查 backend 二进制(需要 Windows 环境或 WSL)
   ls -lh win-test/resources/bundled-aionui-backend/win32-x64/aionui-backend.exe
   ```

3. **Linux 验证**(在 CI artifact 中):
   ```bash
   # 下载 Linux artifact
   gh run download <run-id> --name aionui-linux-x64

   # 提取 deb
   dpkg-deb -x AionUi-*.deb linux-test

   # 检查 backend 二进制
   ls -lh linux-test/opt/AionUi/resources/bundled-aionui-backend/linux-x64/aionui-backend
   linux-test/opt/AionUi/resources/bundled-aionui-backend/linux-x64/aionui-backend --version
   ```

**产出**:
- 所有平台的打包产物中都包含可执行的 aionui-backend 二进制
- 二进制版本与 GitHub release 版本一致

---

### Phase 7: Document & Handoff

**目的**: 记录 M7 的交付物和已知限制,为 M8/M9 提供清晰的接口。

**操作**:

1. **创建 `docs/backend-migration/handoffs/M7-outcome.md`**:
   ```markdown
   # M7 Outcome: Backend CI Preparation

   ## 交付物

   1. **CI 集成**:
      - `.github/workflows/_build-reusable.yml` 已添加 prepareAionuiBackend 步骤
      - 环境变量:`AIONUI_BACKEND_VERSION=latest`, `AIONUI_BACKEND_ALLOW_MISSING=0`

   2. **构建脚本**:
      - `scripts/build-with-builder.js` 已集成 prepareAionuiBackend 调用
      - `scripts/prepareAionuiBackend.js` 作为 CLI wrapper
      - `packages/shared-scripts/src/prepare-aionui-backend.js` 作为可复用 module

   3. **产物结构**:
      - `resources/bundled-aionui-backend/{platform}-{arch}/aionui-backend[.exe]`
      - `resources/bundled-aionui-backend/{platform}-{arch}/manifest.json`

   4. **manifest.json 字段**:
      ```json
      {
        "platform": "darwin",
        "arch": "arm64",
        "version": "v0.x.x",
        "generatedAt": "2026-05-08T...",
        "sourceType": "download",
        "source": { "url": "https://github.com/..." },
        "files": ["aionui-backend"],
        "skipped": false
      }
      ```

   ## 已知限制

   1. **外部依赖**: 依赖 `iOfficeAI/aionui-backend` GitHub release 存在
   2. **版本管理**: 当前使用 `latest`,未 pin 版本(M9 可能需要改进)
   3. **过渡开关**: `AIONUI_BACKEND_ALLOW_MISSING` 仅用于过渡,M9 后应删除
   4. **平台支持**: 仅支持 darwin/linux/win32 × x64/arm64 的组合

   ## M8 接口约定

   - M8 的 `@aionui/web-cli` 可导入 `packages/shared-scripts/src/prepare-aionui-backend.js`
   - 函数签名:
     ```javascript
     function prepareAionuiBackend(options: {
       projectRoot: string;
       platform: string;
       arch: string;
       version: string;
       allowMissing: boolean;
     }): { prepared: boolean; dir?: string; sourceType?: string; reason?: string }
     ```

   ## 回滚方案

   如果 M7 导致 CI 不稳定,可临时设置 `AIONUI_BACKEND_ALLOW_MISSING=1` 降级为 soft warn。
   ```

2. **更新 `CLAUDE.md` 或项目文档**(如需要):
   - 记录 prepareAionuiBackend 的用途和环境变量

3. **Commit handoff 文档**:
   ```bash
   git add docs/backend-migration/handoffs/M7-outcome.md
   git commit -m "docs(backend-migration): add M7 handoff document"
   git push origin feat/m7-prepare-backend-ci
   ```

**产出**:
- `docs/backend-migration/handoffs/M7-outcome.md` 已创建
- M8 可基于 M7 的接口约定进行开发

---

## 验收标准

M7 完成的标志:

1. ✅ **CI 构建成功**: `.github/workflows/_build-reusable.yml` 中的 build job 全绿
2. ✅ **产物包含 backend**: 所有平台的构建产物中都有 `bundled-aionui-backend/{platform}-{arch}/aionui-backend[.exe]`
3. ✅ **manifest 正确**: `manifest.json` 中 `sourceType: "download"`, `skipped: false`
4. ✅ **二进制可执行**: 下载的 backend 二进制可以运行 `--version` 并返回版本号
5. ✅ **module 拆分完成**: `packages/shared-scripts/src/prepare-aionui-backend.js` 可被 M8 导入使用
6. ✅ **过渡开关生效**: `AIONUI_BACKEND_ALLOW_MISSING=1` 时可跳过,`=0` 时 hard fail
7. ✅ **handoff 文档完整**: `docs/backend-migration/handoffs/M7-outcome.md` 已创建

---

## 风险与缓解

| 风险 | 影响 | 缓解方案 |
|------|------|----------|
| aionui-backend release 不存在 | CI 全红 | 添加外部依赖预检步骤,提前发现;设置 `AIONUI_BACKEND_ALLOW_MISSING=1` 临时降级 |
| GitHub API rate limit | 下载失败 | 使用 `GH_TOKEN` / `GITHUB_TOKEN` 提高限额;添加 retry 逻辑 |
| 跨平台构建失败 | 部分平台产物缺失 | 在 CI 中分平台测试;本地多平台验证 |
| manifest 字段缺失 | M8/M9 运行时解析失败 | 添加 unit test 验证 manifest schema;code review 检查 |
| 过渡开关误用 | 产物静默跳过 backend | CI 中设为 `AIONUI_BACKEND_ALLOW_MISSING=0`,确保 hard fail |

---

## 时间预估

| 阶段 | 预计时间 |
|------|----------|
| Phase 0: Baseline & Pre-Flight | 10 分钟 |
| Phase 1: Add prepareAionuiBackend Call | 15 分钟 |
| Phase 2: Add ALLOW_MISSING Env Var | 20 分钟 |
| Phase 3: Extract as Module | 30 分钟 |
| Phase 4: Add CI Workflow Step | 20 分钟 |
| Phase 5: CI Checkpoint | 15 分钟(等待 CI) |
| Phase 6: Verify Packaged Binary | 20 分钟 |
| Phase 7: Document & Handoff | 15 分钟 |
| **总计** | **~2.5 小时** |

*(实际时间可能因 CI 队列、网络速度等因素浮动)*

---

## 参考文档

- `scripts/prepareAionuiBackend.js` — 当前实现
- `scripts/build-with-builder.js` — 构建入口
- `packages/desktop/electron-builder.yml` — extraResources 配置
- `.github/workflows/_build-reusable.yml` — CI workflow
- `packages/web-host/src/backend-launcher.ts` — BackendBinaryResolver 接口(M4)
- `docs/backend-migration/handoffs/M1-outcome.md` ~ `M6-outcome.md` — 前序里程碑交付

---

## 后续里程碑依赖

- **M8 (web-cli + tarball)**: 使用 `packages/shared-scripts/src/prepare-aionui-backend.js` 准备 backend 二进制
- **M9 (install-web script)**: 依赖 M8 产出的 tarball 中包含 bundled-aionui-backend

---

*本计划由 plan-writer-m7 生成,基于 M5/M6 格式模板和源码探查结果。*
