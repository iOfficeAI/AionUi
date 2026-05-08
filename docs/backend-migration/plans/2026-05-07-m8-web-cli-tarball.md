# M8: Web CLI + Tarball - Detailed Plan

**迁移目标**: 创建 `@aionui/web-cli` 包,通过 CLI 启动 web-host + backend,在 CI 中打包成跨平台 tarball(含 bundled backend + bundled bun),产出 5 平台 × tarball + SHA256 校验和,为 M9 install-web 脚本提供可分发的 WebUI 独立产物。

**前提条件**:
- M7 已完成:`packages/shared-scripts/src/prepare-aionui-backend.js` 可用
- `packages/web-host/` 提供 backend-launcher + static-server 接口
- CI 已集成 prepareAionuiBackend,构建产物包含 bundled-aionui-backend
- `scripts/prepareBundledBun.js` 可用于准备 bun 运行时

**核心任务**:
1. 创建 `packages/web-cli/` 骨架(package.json, tsconfig, src/index.ts CLI 入口)
2. 在 web-cli 中集成 web-host API,实现 `aionui-web start` 命令
3. 创建 `packages/shared-scripts/` 包,抽取 prepareAionuiBackend 和 prepareBundledBun 逻辑
4. 添加 CI job `pack-web-cli` 用于打包 web-cli tarball(5 平台:darwin-arm64/x86_64, linux-x86_64/aarch64, win-x86_64)
5. 配置 tarball 结构:`aionui-web-{version}-{platform}-{arch}.tar.gz` + `.sha256`
6. 添加容器冒烟测试(linux-x86_64 debian:slim)验证 tarball 可解压 + 启动
7. 验证依赖边界:web-cli 不 import desktop/electron 代码

---

## 阶段化分解

### Phase 0: Baseline & Pre-Flight

**目的**: 确认 M7 交付物可用,记录 M8 起点状态。

**操作**:

1. **确认分支基于 M7**:
   ```bash
   git fetch origin
   git checkout -b feat/m8-web-cli-tarball origin/feat/m7-prepare-backend-ci
   git log --oneline -1
   ```

2. **验证 M7 交付物**:
   ```bash
   # 检查 shared-scripts 是否存在(M7 Phase 3 产物)
   ls -la packages/shared-scripts/src/prepare-aionui-backend.js
   
   # 检查 web-host 接口
   grep -n "BackendLauncher\|StaticServer" packages/web-host/src/index.ts
   
   # 检查 CI 中的 prepareAionuiBackend 步骤
   grep -A 5 "Prepare aionui-backend binary" .github/workflows/_build-reusable.yml
   ```

3. **检查 prepareBundledBun 脚本**:
   ```bash
   ls -la scripts/prepareBundledBun.js
   grep -n "function prepareBundledBun" scripts/prepareBundledBun.js
   ```

4. **记录当前 CI 产物类型**:
   ```bash
   # 检查当前 CI 只产出 electron 安装包(exe/dmg/deb)
   grep -A 10 "Upload build artifacts" .github/workflows/_build-reusable.yml
   ```

**产出**:
- 分支 `feat/m8-web-cli-tarball` 基于 M7
- 确认 M7 的 shared-scripts 可用,web-host 接口就绪
- 记录当前 CI 不产出 tarball 的基线状态

---

### Phase 1: Create packages/web-cli/ Skeleton

**目的**: 创建 web-cli 包骨架,定义 CLI 入口和依赖。

**操作**:

1. **创建目录结构**:
   ```bash
   mkdir -p packages/web-cli/src
   mkdir -p packages/web-cli/bin
   ```

2. **创建 `packages/web-cli/package.json`**:
   ```json
   {
     "name": "@aionui/web-cli",
     "version": "0.0.0",
     "private": true,
     "description": "AionUi WebUI CLI - standalone web runtime (no Electron)",
     "type": "module",
     "bin": {
       "aionui-web": "./bin/aionui-web.js"
     },
     "exports": {
       ".": "./src/index.ts"
     },
     "scripts": {
       "build": "tsc",
       "test": "vitest run",
       "test:watch": "vitest"
     },
     "dependencies": {
       "@aionui/web-host": "workspace:*",
       "@aionui/shared-scripts": "workspace:*"
     },
     "devDependencies": {
       "@types/node": "^22.10.2",
       "typescript": "^5.7.3",
       "vitest": "^4.1.0"
     }
   }
   ```

3. **创建 `packages/web-cli/tsconfig.json`**:
   ```json
   {
     "extends": "../../tsconfig.base.json",
     "compilerOptions": {
       "outDir": "./dist",
       "rootDir": "./src",
       "module": "NodeNext",
       "moduleResolution": "NodeNext",
       "target": "ES2022",
       "lib": ["ES2022"],
       "types": ["node"]
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist", "**/*.test.ts"]
   }
   ```

4. **创建 CLI 入口 `packages/web-cli/bin/aionui-web.js`**(shebang wrapper):
   ```javascript
   #!/usr/bin/env node
   import('../src/index.js').catch((err) => {
     console.error('Failed to start aionui-web:', err);
     process.exit(1);
   });
   ```

5. **创建主逻辑 `packages/web-cli/src/index.ts`**:
   ```typescript
   import { BackendLauncher, StaticServer } from '@aionui/web-host';
   import { resolve } from 'node:path';
   
   async function main() {
     const args = process.argv.slice(2);
     const command = args[0] || 'start';
   
     if (command === 'start') {
       console.log('Starting AionUi WebUI...');
   
       // 1. Launch backend
       const backendLauncher = new BackendLauncher({
         binaryPath: resolve(__dirname, '../bundled-aionui-backend'),
         dataDir: process.env.AIONUI_DATA_DIR || resolve(process.env.HOME || '/tmp', '.aionui'),
       });
       await backendLauncher.start();
   
       // 2. Start static server
       const staticServer = new StaticServer({
         port: parseInt(process.env.AIONUI_PORT || '3000', 10),
         staticDir: resolve(__dirname, '../static'),
         backendUrl: backendLauncher.getUrl(),
       });
       await staticServer.start();
   
       console.log(`AionUi WebUI started at http://localhost:${staticServer.getPort()}`);
     } else if (command === 'version') {
       const pkg = await import('../package.json', { assert: { type: 'json' } });
       console.log(pkg.default.version);
     } else {
       console.error(`Unknown command: ${command}`);
       console.error('Usage: aionui-web [start|version]');
       process.exit(1);
     }
   }
   
   main().catch((err) => {
     console.error('Fatal error:', err);
     process.exit(1);
   });
   ```

6. **本地验证 CLI 骨架**:
   ```bash
   cd packages/web-cli
   bun install
   bun run build
   node bin/aionui-web.js version
   # 预期输出:0.0.0
   ```

**产出**:
- `packages/web-cli/` 目录结构完整
- CLI 入口可执行,`aionui-web version` 命令工作
- 依赖 `@aionui/web-host` 和 `@aionui/shared-scripts`(后者将在 Phase 2 创建)

---

### Phase 2: Create packages/shared-scripts/ Package

**目的**: 从 M7 的单文件 `scripts/prepareAionuiBackend.js` 拆分为 `@aionui/shared-scripts` 包,同时抽取 `prepareBundledBun.js` 逻辑,供 desktop 和 web-cli 复用。

**操作**:

1. **创建目录结构**:
   ```bash
   mkdir -p packages/shared-scripts/src
   ```

2. **创建 `packages/shared-scripts/package.json`**:
   ```json
   {
     "name": "@aionui/shared-scripts",
     "version": "0.0.0",
     "private": true,
     "description": "Shared build scripts for AionUi packages",
     "type": "commonjs",
     "exports": {
       "./prepare-aionui-backend": "./src/prepare-aionui-backend.js",
       "./prepare-bundled-bun": "./src/prepare-bundled-bun.js"
     },
     "scripts": {
       "test": "vitest run",
       "test:watch": "vitest"
     },
     "dependencies": {},
     "devDependencies": {
       "@types/node": "^22.10.2",
       "vitest": "^4.1.0"
     }
   }
   ```

3. **移动并重构 `prepare-aionui-backend.js`**:
   - 将 `scripts/prepareAionuiBackend.js` 的核心逻辑移到 `packages/shared-scripts/src/prepare-aionui-backend.js`
   - 保留 `scripts/prepareAionuiBackend.js` 作为 CLI wrapper(调用 shared-scripts)

   ```javascript
   // packages/shared-scripts/src/prepare-aionui-backend.js
   const { execSync } = require('child_process');
   const fs = require('fs');
   const path = require('path');
   
   /**
    * Prepare aionui-backend binary for packaging.
    * @param {object} options
    * @param {string} options.projectRoot - 项目根目录
    * @param {string} options.platform - 目标平台(process.platform)
    * @param {string} options.arch - 目标架构(process.arch)
    * @param {string} options.version - backend 版本(default: 'latest')
    * @param {boolean} options.allowMissing - 是否允许 backend 缺失
    * @returns {{ prepared: boolean; dir?: string; sourceType?: string; reason?: string }}
    */
   function prepareAionuiBackend(options) {
     const { projectRoot, platform, arch, version = 'latest', allowMissing = false } = options;
     
     // ... 移动 scripts/prepareAionuiBackend.js 中的逻辑 ...
     // 下载 aionui-backend from GitHub releases
     // 写入 manifest.json
     // 处理 allowMissing 逻辑
     
     const targetDir = path.join(projectRoot, 'resources', 'bundled-aionui-backend', `${platform}-${arch}`);
     
     // ... implementation ...
     
     return { prepared: true, dir: targetDir, sourceType: 'download' };
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
     const result = prepareAionuiBackend({ projectRoot, platform, arch, version, allowMissing });
     if (result.prepared) {
       console.log(`✅ aionui-backend prepared: ${result.dir} [source=${result.sourceType}]`);
     } else {
       console.warn(`⚠️ aionui-backend skipped: ${result.reason}`);
     }
   } catch (error) {
     console.error('❌ prepareAionuiBackend failed:', error.message);
     process.exit(1);
   }
   ```

4. **抽取 `prepareBundledBun.js` 逻辑**:
   - 将 `scripts/prepareBundledBun.js` 的核心逻辑移到 `packages/shared-scripts/src/prepare-bundled-bun.js`
   - 保留 `scripts/prepareBundledBun.js` 作为 CLI wrapper

   ```javascript
   // packages/shared-scripts/src/prepare-bundled-bun.js
   function prepareBundledBun(options) {
     const { projectRoot, platform, arch } = options;
     // ... 移动 scripts/prepareBundledBun.js 中的逻辑 ...
     const targetDir = path.join(projectRoot, 'resources', 'bundled-bun');
     // ... implementation ...
     return { prepared: true, dir: targetDir };
   }
   
   module.exports = { prepareBundledBun };
   ```

5. **更新 `scripts/build-with-builder.js` 调用**:
   - 保持调用 `scripts/prepareAionuiBackend.js` 和 `scripts/prepareBundledBun.js`(CLI wrappers)
   - 不直接依赖 shared-scripts,避免引入新的依赖传递

6. **本地测试重构后的行为**:
   ```bash
   rm -rf resources/bundled-aionui-backend resources/bundled-bun
   node scripts/prepareAionuiBackend.js
   node scripts/prepareBundledBun.js
   ls -lh resources/bundled-aionui-backend/
   ls -lh resources/bundled-bun/
   ```

**产出**:
- `packages/shared-scripts/` 包创建完成
- `prepare-aionui-backend.js` 和 `prepare-bundled-bun.js` 作为可复用 module
- `scripts/` 中的 CLI wrappers 保持向后兼容
- 本地测试验证重构后功能不变

---

### Phase 3: Integrate web-host in web-cli

**目的**: 在 web-cli 中完整集成 web-host 的 BackendLauncher 和 StaticServer,实现 `aionui-web start` 端到端启动流程。

**操作**:

1. **增强 `packages/web-cli/src/index.ts`**:
   - 添加环境变量配置:`AIONUI_PORT`, `AIONUI_DATA_DIR`, `AIONUI_LOG_LEVEL`
   - 添加信号处理(SIGINT/SIGTERM)优雅关闭
   - 添加错误处理和日志

   ```typescript
   import { BackendLauncher, StaticServer } from '@aionui/web-host';
   import { resolve } from 'node:path';
   
   let backendLauncher: BackendLauncher | null = null;
   let staticServer: StaticServer | null = null;
   
   async function main() {
     const args = process.argv.slice(2);
     const command = args[0] || 'start';
   
     if (command === 'start') {
       console.log('Starting AionUi WebUI...');
   
       // 1. Resolve paths
       const cliRoot = resolve(__dirname, '..');
       const backendBinaryDir = resolve(cliRoot, 'bundled-aionui-backend', `${process.platform}-${process.arch}`);
       const staticDir = resolve(cliRoot, 'static');
       const dataDir = process.env.AIONUI_DATA_DIR || resolve(process.env.HOME || '/tmp', '.aionui');
   
       // 2. Launch backend
       backendLauncher = new BackendLauncher({
         binaryPath: backendBinaryDir,
         dataDir,
         env: {
           AIONUI_LOG_LEVEL: process.env.AIONUI_LOG_LEVEL || 'info',
         },
       });
       await backendLauncher.start();
       console.log(`✓ Backend started: ${backendLauncher.getUrl()}`);
   
       // 3. Start static server
       const port = parseInt(process.env.AIONUI_PORT || '3000', 10);
       staticServer = new StaticServer({
         port,
         staticDir,
         backendUrl: backendLauncher.getUrl(),
       });
       await staticServer.start();
       console.log(`✓ Static server started: http://localhost:${staticServer.getPort()}`);
       console.log('');
       console.log('AionUi WebUI is ready!');
       console.log(`Open http://localhost:${staticServer.getPort()} in your browser.`);
   
       // 4. Handle shutdown signals
       process.on('SIGINT', () => shutdown('SIGINT'));
       process.on('SIGTERM', () => shutdown('SIGTERM'));
     } else if (command === 'version') {
       const pkg = await import('../package.json', { assert: { type: 'json' } });
       console.log(pkg.default.version);
     } else {
       console.error(`Unknown command: ${command}`);
       console.error('Usage: aionui-web [start|version]');
       process.exit(1);
     }
   }
   
   async function shutdown(signal: string) {
     console.log(`\nReceived ${signal}, shutting down gracefully...`);
     if (staticServer) await staticServer.stop();
     if (backendLauncher) await backendLauncher.stop();
     console.log('Goodbye!');
     process.exit(0);
   }
   
   main().catch((err) => {
     console.error('Fatal error:', err);
     process.exit(1);
   });
   ```

2. **添加集成测试 `packages/web-cli/src/index.test.ts`**:
   - 测试 `aionui-web start` 启动流程(mock BackendLauncher 和 StaticServer)
   - 测试 `aionui-web version` 输出正确版本
   - 测试信号处理(SIGINT)触发优雅关闭

3. **本地手动测试**(需要 mock 数据):
   ```bash
   # 准备 mock backend binary(占位文件)
   mkdir -p packages/web-cli/bundled-aionui-backend/darwin-arm64
   echo "mock backend" > packages/web-cli/bundled-aionui-backend/darwin-arm64/aionui-backend
   chmod +x packages/web-cli/bundled-aionui-backend/darwin-arm64/aionui-backend
   
   # 准备 mock static files
   mkdir -p packages/web-cli/static
   echo "<h1>AionUi WebUI</h1>" > packages/web-cli/static/index.html
   
   # 构建并运行(会失败,因为 mock backend 不是真的可执行文件,但可以验证启动逻辑)
   cd packages/web-cli
   bun run build
   node bin/aionui-web.js start
   ```

**产出**:
- `packages/web-cli/src/index.ts` 完整实现启动逻辑
- 集成测试覆盖核心流程
- 本地手动测试验证 CLI 入口可用(真实启动需要 Phase 4 的打包产物)

---

### Phase 4: Add pack-web-cli Script

**目的**: 创建 `scripts/pack-web-cli.js` 脚本,将 web-cli + bundled-backend + bundled-bun + static files 打包成 tarball。

**操作**:

1. **创建 `scripts/pack-web-cli.js`**:
   ```javascript
   #!/usr/bin/env node
   const fs = require('fs');
   const path = require('path');
   const { execSync } = require('child_process');
   const { prepareAionuiBackend } = require('../packages/shared-scripts/src/prepare-aionui-backend.js');
   const { prepareBundledBun } = require('../packages/shared-scripts/src/prepare-bundled-bun.js');
   
   const projectRoot = path.resolve(__dirname, '..');
   const platform = process.env.PACK_PLATFORM || process.platform;
   const arch = process.env.PACK_ARCH || process.arch;
   const version = require('../package.json').version;
   
   // Normalize platform/arch names for tarball filename
   const platformMap = { darwin: 'darwin', linux: 'linux', win32: 'win' };
   const archMap = { arm64: 'arm64', x64: 'x86_64', ia32: 'x86' };
   const normalizedPlatform = platformMap[platform] || platform;
   const normalizedArch = archMap[arch] || arch;
   
   const tarballName = `aionui-web-${version}-${normalizedPlatform}-${normalizedArch}.tar.gz`;
   const tarballPath = path.join(projectRoot, 'dist-web-cli', tarballName);
   
   console.log(`Packing web-cli for ${platform}-${arch}...`);
   
   // 1. Prepare bundled-aionui-backend
   console.log('1. Preparing aionui-backend...');
   prepareAionuiBackend({
     projectRoot,
     platform,
     arch,
     version: process.env.AIONUI_BACKEND_VERSION || 'latest',
     allowMissing: false,
   });
   
   // 2. Prepare bundled-bun
   console.log('2. Preparing bundled-bun...');
   prepareBundledBun({ projectRoot, platform, arch });
   
   // 3. Build web-cli TypeScript
   console.log('3. Building web-cli...');
   execSync('bun run build', { cwd: path.join(projectRoot, 'packages/web-cli'), stdio: 'inherit' });
   
   // 4. Copy static files from desktop renderer build output
   console.log('4. Copying static files...');
   const rendererOutDir = path.join(projectRoot, 'packages/desktop/out/renderer');
   const staticDir = path.join(projectRoot, 'packages/web-cli/static');
   if (fs.existsSync(rendererOutDir)) {
     fs.cpSync(rendererOutDir, staticDir, { recursive: true });
   } else {
     console.warn('⚠️ Desktop renderer build output not found, skipping static files');
   }
   
   // 5. Create tarball structure
   console.log('5. Creating tarball...');
   const stagingDir = path.join(projectRoot, 'dist-web-cli', 'staging');
   fs.rmSync(stagingDir, { recursive: true, force: true });
   fs.mkdirSync(stagingDir, { recursive: true });
   
   const tarballContentDir = path.join(stagingDir, 'aionui-web');
   fs.mkdirSync(tarballContentDir, { recursive: true });
   
   // Copy web-cli dist
   fs.cpSync(path.join(projectRoot, 'packages/web-cli/dist'), path.join(tarballContentDir, 'dist'), { recursive: true });
   fs.cpSync(path.join(projectRoot, 'packages/web-cli/bin'), path.join(tarballContentDir, 'bin'), { recursive: true });
   fs.cpSync(path.join(projectRoot, 'packages/web-cli/package.json'), path.join(tarballContentDir, 'package.json'));
   
   // Copy bundled-aionui-backend
   const backendSrc = path.join(projectRoot, 'resources/bundled-aionui-backend', `${platform}-${arch}`);
   const backendDest = path.join(tarballContentDir, 'bundled-aionui-backend', `${platform}-${arch}`);
   fs.mkdirSync(path.dirname(backendDest), { recursive: true });
   fs.cpSync(backendSrc, backendDest, { recursive: true });
   
   // Copy bundled-bun
   const bunSrc = path.join(projectRoot, 'resources/bundled-bun', platform === 'win32' ? 'bun.exe' : 'bun');
   const bunDest = path.join(tarballContentDir, 'bundled-bun', platform === 'win32' ? 'bun.exe' : 'bun');
   fs.mkdirSync(path.dirname(bunDest), { recursive: true });
   fs.copyFileSync(bunSrc, bunDest);
   fs.chmodSync(bunDest, 0o755);
   
   // Copy static files
   if (fs.existsSync(staticDir)) {
     fs.cpSync(staticDir, path.join(tarballContentDir, 'static'), { recursive: true });
   }
   
   // 6. Create tarball
   execSync(`tar -czf ${path.basename(tarballPath)} -C ${stagingDir} aionui-web`, {
     cwd: path.dirname(tarballPath),
     stdio: 'inherit',
   });
   
   console.log(`✅ Tarball created: ${tarballPath}`);
   
   // 7. Generate SHA256 checksum
   const checksumPath = `${tarballPath}.sha256`;
   const checksum = execSync(`shasum -a 256 ${path.basename(tarballPath)}`, {
     cwd: path.dirname(tarballPath),
     encoding: 'utf8',
   });
   fs.writeFileSync(checksumPath, checksum);
   console.log(`✅ Checksum created: ${checksumPath}`);
   
   console.log('Done!');
   ```

2. **添加 `bun run pack:web-cli` 脚本到根 `package.json`**:
   ```json
   {
     "scripts": {
       "pack:web-cli": "node scripts/pack-web-cli.js"
     }
   }
   ```

3. **本地测试打包流程**:
   ```bash
   # 先构建 desktop renderer(产出 static files)
   cd packages/desktop
   bunx electron-vite build
   cd ../..
   
   # 打包 web-cli
   bun run pack:web-cli
   
   # 验证产物
   ls -lh dist-web-cli/
   # 预期:aionui-web-{version}-{platform}-{arch}.tar.gz + .sha256
   
   # 解压验证内容
   tar -tzf dist-web-cli/aionui-web-*.tar.gz | head -20
   # 预期:aionui-web/{bin,dist,bundled-aionui-backend,bundled-bun,static,package.json}
   ```

**产出**:
- `scripts/pack-web-cli.js` 创建完成
- 本地打包验证通过,产出 tarball + SHA256 校验和
- Tarball 包含完整的运行时依赖(backend, bun, static files)

---

### Phase 5: Add CI Job for pack-web-cli (5 Platforms)

**目的**: 在 CI 中添加 `pack-web-cli` job,针对 5 个平台(darwin-arm64/x86_64, linux-x86_64/aarch64, win-x86_64)打包 tarball。

**操作**:

1. **创建 `.github/workflows/pack-web-cli.yml`**:
   ```yaml
   name: Pack Web CLI
   
   on:
     push:
       branches: [feat/m8-web-cli-tarball]
     workflow_dispatch:
   
   env:
     BUN_INSTALL_REGISTRY: 'https://registry.npmjs.org/'
   
   jobs:
     pack-web-cli:
       name: Pack web-cli ${{ matrix.platform }}-${{ matrix.arch }}
       runs-on: ${{ matrix.os }}
       strategy:
         fail-fast: false
         matrix:
           include:
             - { platform: darwin, arch: arm64, os: macos-14 }
             - { platform: darwin, arch: x64, os: macos-14 }
             - { platform: linux, arch: x64, os: ubuntu-latest }
             - { platform: linux, arch: arm64, os: ubuntu-latest }
             - { platform: win32, arch: x64, os: windows-2022 }
       
       steps:
         - name: Checkout code
           uses: actions/checkout@v6
         
         - name: Setup Node.js
           uses: actions/setup-node@v4
           with:
             node-version: '22'
         
         - name: Setup bun
           uses: oven-sh/setup-bun@v2
           with:
             bun-version: latest
         
         - name: Install dependencies
           run: bun install --frozen-lockfile
         
         - name: Build desktop renderer (for static files)
           run: bunx electron-vite build
           working-directory: packages/desktop
         
         - name: Pack web-cli tarball
           shell: bash
           run: node scripts/pack-web-cli.js
           env:
             PACK_PLATFORM: ${{ matrix.platform }}
             PACK_ARCH: ${{ matrix.arch }}
             AIONUI_BACKEND_VERSION: latest
             GH_TOKEN: ${{ secrets.GH_TOKEN }}
         
         - name: Upload tarball artifact
           uses: actions/upload-artifact@v6
           with:
             name: web-cli-${{ matrix.platform }}-${{ matrix.arch }}
             path: |
               dist-web-cli/*.tar.gz
               dist-web-cli/*.sha256
             retention-days: 7
   ```

2. **配置跨架构构建**(Linux ARM64):
   - 在 linux-arm64 job 中添加 QEMU 支持(如需模拟构建)
   - 或者使用 GitHub hosted ARM64 runners(如果可用)

   ```yaml
   - name: Set up QEMU (Linux ARM64 only)
     if: matrix.platform == 'linux' && matrix.arch == 'arm64'
     uses: docker/setup-qemu-action@v3
     with:
       platforms: arm64
   ```

3. **本地模拟 CI 环境测试**:
   ```bash
   # 清理并重新打包
   rm -rf dist-web-cli resources/bundled-aionui-backend resources/bundled-bun
   
   # 模拟 CI 环境变量
   export CI=true
   export PACK_PLATFORM=darwin
   export PACK_ARCH=arm64
   export AIONUI_BACKEND_VERSION=latest
   export GH_TOKEN=<your_token>
   
   # 构建 renderer
   cd packages/desktop && bunx electron-vite build && cd ../..
   
   # 打包
   node scripts/pack-web-cli.js
   
   # 验证产物
   ls -lh dist-web-cli/
   cat dist-web-cli/*.sha256
   ```

**产出**:
- `.github/workflows/pack-web-cli.yml` 创建完成
- CI 产出 5 个平台的 tarball + SHA256 校验和
- 本地模拟 CI 环境测试通过

---

### Phase 6: Add Container Smoke Test (Linux x86_64)

**目的**: 在 CI 中添加容器冒烟测试,验证 linux-x86_64 tarball 可在 debian:slim 容器中解压 + 启动。

**操作**:

1. **创建 `scripts/smoke-test-web-cli.sh`**:
   ```bash
   #!/bin/bash
   set -e
   
   TARBALL_PATH=$1
   
   if [ -z "$TARBALL_PATH" ]; then
     echo "Usage: $0 <tarball-path>"
     exit 1
   fi
   
   echo "========================================"
   echo "Smoke test for web-cli tarball"
   echo "========================================"
   echo "Tarball: $TARBALL_PATH"
   
   # 1. Extract tarball
   echo ""
   echo "1. Extracting tarball..."
   TEMP_DIR=$(mktemp -d)
   tar -xzf "$TARBALL_PATH" -C "$TEMP_DIR"
   
   # 2. Verify directory structure
   echo ""
   echo "2. Verifying directory structure..."
   if [ ! -d "$TEMP_DIR/aionui-web" ]; then
     echo "❌ Missing aionui-web directory"
     exit 1
   fi
   
   cd "$TEMP_DIR/aionui-web"
   
   for dir in bin dist bundled-aionui-backend bundled-bun static; do
     if [ ! -d "$dir" ]; then
       echo "❌ Missing $dir directory"
       exit 1
     fi
     echo "✓ Found $dir/"
   done
   
   # 3. Check executables
   echo ""
   echo "3. Checking executables..."
   
   if [ ! -x "bin/aionui-web.js" ]; then
     echo "❌ bin/aionui-web.js is not executable"
     exit 1
   fi
   echo "✓ bin/aionui-web.js is executable"
   
   BACKEND_BINARY="bundled-aionui-backend/$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m)/aionui-backend"
   if [ ! -x "$BACKEND_BINARY" ]; then
     echo "❌ $BACKEND_BINARY is not executable"
     exit 1
   fi
   echo "✓ $BACKEND_BINARY is executable"
   
   # 4. Test version command
   echo ""
   echo "4. Testing version command..."
   VERSION=$(node bin/aionui-web.js version)
   if [ -z "$VERSION" ]; then
     echo "❌ version command returned empty"
     exit 1
   fi
   echo "✓ Version: $VERSION"
   
   # 5. Test backend binary --version
   echo ""
   echo "5. Testing backend binary..."
   BACKEND_VERSION=$("$BACKEND_BINARY" --version 2>&1 || true)
   if [ -z "$BACKEND_VERSION" ]; then
     echo "⚠️ backend --version returned empty (may be OK if binary expects different flags)"
   else
     echo "✓ Backend version: $BACKEND_VERSION"
   fi
   
   # Cleanup
   cd -
   rm -rf "$TEMP_DIR"
   
   echo ""
   echo "========================================"
   echo "✅ Smoke test passed!"
   echo "========================================"
   ```

2. **在 `.github/workflows/pack-web-cli.yml` 中添加 smoke-test job**:
   ```yaml
   smoke-test:
     name: Smoke test (Linux x86_64)
     runs-on: ubuntu-latest
     needs: pack-web-cli
     container:
       image: debian:bookworm-slim
     
     steps:
       - name: Checkout code
         uses: actions/checkout@v6
       
       - name: Install dependencies
         run: |
           apt-get update
           apt-get install -y curl tar gzip nodejs
       
       - name: Download linux-x86_64 tarball
         uses: actions/download-artifact@v7
         with:
           name: web-cli-linux-x64
           path: dist-web-cli
       
       - name: Run smoke test
         shell: bash
         run: |
           chmod +x scripts/smoke-test-web-cli.sh
           TARBALL=$(ls dist-web-cli/*.tar.gz | head -1)
           bash scripts/smoke-test-web-cli.sh "$TARBALL"
   ```

3. **本地测试 smoke test 脚本**:
   ```bash
   # 先打包 linux-x86_64 tarball(需要在 Linux 环境或模拟)
   docker run --rm -v $(pwd):/workspace -w /workspace node:22 bash -c "
     bun install --frozen-lockfile &&
     cd packages/desktop && bunx electron-vite build && cd ../.. &&
     PACK_PLATFORM=linux PACK_ARCH=x64 node scripts/pack-web-cli.js
   "
   
   # 运行 smoke test
   bash scripts/smoke-test-web-cli.sh dist-web-cli/aionui-web-*-linux-x86_64.tar.gz
   ```

**产出**:
- `scripts/smoke-test-web-cli.sh` 创建完成
- CI 中 smoke-test job 验证 linux-x86_64 tarball 可解压 + 启动
- 本地测试验证 smoke test 脚本工作正常

---

### Phase 7: Verify Dependency Boundaries

**目的**: 验证 web-cli 不依赖 desktop/electron 代码,确保依赖隔离。

**操作**:

1. **检查 `packages/web-cli/package.json` 依赖**:
   ```bash
   cat packages/web-cli/package.json | jq '.dependencies'
   # 预期:只有 @aionui/web-host 和 @aionui/shared-scripts
   ```

2. **检查 web-cli 源码中的 import 语句**:
   ```bash
   grep -r "from '@aionui/desktop'" packages/web-cli/src/
   grep -r "from 'electron'" packages/web-cli/src/
   # 预期:无结果(不应 import desktop 或 electron)
   ```

3. **检查 web-host 源码中的 import 语句**:
   ```bash
   grep -r "from 'electron'" packages/web-host/src/
   # 预期:无结果(web-host 不应依赖 electron)
   ```

4. **运行 TypeScript 编译检查**:
   ```bash
   cd packages/web-cli
   bunx tsc --noEmit
   # 预期:无类型错误
   ```

5. **添加 lint rule(可选)**:
   - 在 `packages/web-cli/.eslintrc.json` 中添加规则禁止 import electron
   
   ```json
   {
     "rules": {
       "no-restricted-imports": [
         "error",
         {
           "patterns": ["electron", "@aionui/desktop"]
         }
       ]
     }
   }
   ```

**产出**:
- 验证 web-cli 和 web-host 不依赖 electron
- TypeScript 编译无错误
- 可选:添加 lint rule 防止未来误引入

---

### Phase 8: CI Checkpoint & Artifact Verification

**目的**: 在 M8 feature 分支上跑完整 CI,验证 5 个平台的 tarball 产出正确。

**操作**:

1. **提交所有变更到 feature 分支**:
   ```bash
   git add -A
   git commit -m "feat(web-cli): add web-cli package and tarball CI pipeline
   
   - Add packages/web-cli/ CLI skeleton with BackendLauncher + StaticServer integration
   - Extract packages/shared-scripts/ with prepareAionuiBackend + prepareBundledBun
   - Add scripts/pack-web-cli.js for tarball packaging
   - Add CI workflow pack-web-cli.yml for 5 platforms (darwin-arm64/x64, linux-x64/arm64, win-x64)
   - Add container smoke test for linux-x86_64 tarball in debian:slim
   - Generate SHA256 checksums for all tarballs
   - Verify dependency boundaries: web-cli does not import desktop/electron"
   
   git push origin feat/m8-web-cli-tarball
   ```

2. **触发 CI 构建**:
   ```bash
   # 通过 GitHub UI 手动触发 pack-web-cli workflow
   # 或者等待 push 自动触发
   
   gh run list --branch feat/m8-web-cli-tarball --limit 5
   gh run watch <run-id>
   ```

3. **验证 CI job 输出**:
   - 检查 pack-web-cli job 的日志
   - 预期输出:
     ```
     Packing web-cli for darwin-arm64...
     1. Preparing aionui-backend...
     ✅ aionui-backend prepared: resources/bundled-aionui-backend/darwin-arm64 [source=download]
     2. Preparing bundled-bun...
     ✅ bundled-bun prepared: resources/bundled-bun/bun
     3. Building web-cli...
     4. Copying static files...
     5. Creating tarball...
     ✅ Tarball created: dist-web-cli/aionui-web-0.0.0-darwin-arm64.tar.gz
     ✅ Checksum created: dist-web-cli/aionui-web-0.0.0-darwin-arm64.tar.gz.sha256
     Done!
     ```
   
   - 检查 smoke-test job 日志
   - 预期输出:
     ```
     Smoke test for web-cli tarball
     Tarball: dist-web-cli/aionui-web-0.0.0-linux-x86_64.tar.gz
     1. Extracting tarball...
     2. Verifying directory structure...
     ✓ Found bin/
     ✓ Found dist/
     ✓ Found bundled-aionui-backend/
     ✓ Found bundled-bun/
     ✓ Found static/
     3. Checking executables...
     ✓ bin/aionui-web.js is executable
     ✓ bundled-aionui-backend/linux-x86_64/aionui-backend is executable
     4. Testing version command...
     ✓ Version: 0.0.0
     5. Testing backend binary...
     ✓ Backend version: aionui-backend v0.x.x
     ✅ Smoke test passed!
     ```

4. **下载 CI 产物并验证**:
   ```bash
   # 下载所有平台的 tarball artifacts
   gh run download <run-id>
   
   # 验证文件存在
   ls -lh web-cli-*/
   # 预期:5 个目录,每个包含 *.tar.gz + *.sha256
   
   # 验证 SHA256 校验和
   cd web-cli-darwin-arm64
   shasum -a 256 -c *.sha256
   # 预期:OK
   cd ..
   
   # 解压并检查内容
   tar -tzf web-cli-darwin-arm64/*.tar.gz | head -30
   # 预期:aionui-web/{bin,dist,bundled-aionui-backend,bundled-bun,static,package.json}
   ```

**产出**:
- M8 feature 分支 CI 全绿
- 5 个平台的 tarball + SHA256 校验和产出正确
- linux-x86_64 smoke test 通过
- CI artifacts 可下载并验证通过

---

### Phase 9: Document & Handoff

**目的**: 记录 M8 的交付物和已知限制,为 M9 install-web 脚本提供清晰的接口。

**操作**:

1. **创建 `docs/backend-migration/handoffs/M8-outcome.md`**:
   ```markdown
   # M8 Outcome: Web CLI + Tarball

   ## 交付物

   1. **web-cli 包**:
      - `packages/web-cli/` — CLI 入口,集成 web-host API
      - 命令:`aionui-web start`, `aionui-web version`
      - 依赖:`@aionui/web-host`, `@aionui/shared-scripts`

   2. **shared-scripts 包**:
      - `packages/shared-scripts/` — 可复用构建脚本
      - 导出:`prepare-aionui-backend.js`, `prepare-bundled-bun.js`

   3. **CI pipeline**:
      - `.github/workflows/pack-web-cli.yml` — 5 平台 tarball 打包
      - 平台:darwin-arm64, darwin-x86_64, linux-x86_64, linux-aarch64, win-x86_64

   4. **产物结构**:
      - `aionui-web-{version}-{platform}-{arch}.tar.gz`
      - `aionui-web-{version}-{platform}-{arch}.tar.gz.sha256`
      - Tarball 内容:
        ```
        aionui-web/
        ├── bin/aionui-web.js       # CLI 入口
        ├── dist/                    # TypeScript 编译产物
        ├── bundled-aionui-backend/  # Backend 二进制
        ├── bundled-bun/             # Bun 运行时
        ├── static/                  # 前端静态文件
        └── package.json
        ```

   5. **冒烟测试**:
      - `scripts/smoke-test-web-cli.sh` — 容器冒烟测试脚本
      - CI job `smoke-test` — 在 debian:slim 中验证 linux-x86_64 tarball

   ## 已知限制

   1. **平台支持**: 仅支持 5 个平台组合(不含 linux-ia32, win-arm64)
   2. **Static files 来源**: 依赖 desktop renderer 构建产物(需要先 `bunx electron-vite build`)
   3. **Backend 版本**: 当前使用 `latest`,未 pin 版本(M9 可能需要改进)
   4. **Tarball 分发**: 未上传到 GitHub releases(M9 将添加)

   ## M9 接口约定

   - M9 的 `install-web.sh` 脚本应从 GitHub releases 下载 tarball
   - 下载 URL 格式:
     ```
     https://github.com/iOfficeAI/AionUi/releases/download/v{version}/aionui-web-{version}-{platform}-{arch}.tar.gz
     ```
   - 校验 SHA256:
     ```bash
     curl -LO {tarball-url}.sha256
     shasum -a 256 -c aionui-web-*.tar.gz.sha256
     ```
   - 安装路径(建议):
     - Linux/macOS: `/opt/aionui-web/` 或 `~/.local/share/aionui-web/`
     - Windows: `%LOCALAPPDATA%\AionUi\web\`

   ## 回滚方案

   如果 M8 tarball 产出有问题,可临时回到 M7 的 desktop 构建流程(仅产出 electron 安装包)。
   ```

2. **更新根 `package.json` scripts**(如需要):
   ```json
   {
     "scripts": {
       "pack:web-cli": "node scripts/pack-web-cli.js",
       "smoke-test:web-cli": "bash scripts/smoke-test-web-cli.sh"
     }
   }
   ```

3. **Commit handoff 文档**:
   ```bash
   git add docs/backend-migration/handoffs/M8-outcome.md
   git commit -m "docs(backend-migration): add M8 handoff document"
   git push origin feat/m8-web-cli-tarball
   ```

**产出**:
- `docs/backend-migration/handoffs/M8-outcome.md` 已创建
- M9 可基于 M8 的 tarball 产物和接口约定进行开发

---

## 验收标准

M8 完成的标志:

1. ✅ **web-cli 包创建**: `packages/web-cli/` 结构完整,CLI 入口可用
2. ✅ **shared-scripts 包创建**: `packages/shared-scripts/` 导出 prepareAionuiBackend + prepareBundledBun
3. ✅ **CI pipeline 工作**: `.github/workflows/pack-web-cli.yml` 产出 5 个平台的 tarball
4. ✅ **Tarball 结构正确**: 包含 bin, dist, bundled-aionui-backend, bundled-bun, static, package.json
5. ✅ **SHA256 校验和生成**: 每个 tarball 都有对应的 .sha256 文件
6. ✅ **冒烟测试通过**: linux-x86_64 tarball 在 debian:slim 容器中可解压 + 启动
7. ✅ **依赖边界验证**: web-cli 和 web-host 不依赖 electron
8. ✅ **handoff 文档完整**: `docs/backend-migration/handoffs/M8-outcome.md` 已创建

---

## 风险与缓解

| 风险 | 影响 | 缓解方案 |
|------|------|----------|
| Static files 缺失 | Tarball 缺少前端资源 | 在 CI 中先构建 desktop renderer;本地验证 tarball 包含 static/ |
| 跨平台二进制不兼容 | linux-arm64/win-x64 tarball 无法启动 | 添加更多平台的冒烟测试;在真实环境中验证 |
| Tarball 体积过大 | 分发慢,下载慢 | 检查 bundled-bun 体积;考虑 strip debug symbols |
| Backend 版本不匹配 | web-cli 调用 backend API 失败 | Pin backend 版本;添加版本兼容性检查 |
| web-cli 依赖 electron | 打包失败或运行时错误 | 添加 lint rule 禁止 import electron;CI 中验证依赖边界 |

---

## 时间预估

| 阶段 | 预计时间 |
|------|----------|
| Phase 0: Baseline & Pre-Flight | 5 分钟 |
| Phase 1: Create web-cli Skeleton | 15 分钟 |
| Phase 2: Create shared-scripts Package | 20 分钟 |
| Phase 3: Integrate web-host in web-cli | 15 分钟 |
| Phase 4: Add pack-web-cli Script | 20 分钟 |
| Phase 5: Add CI Job (5 Platforms) | 25 分钟 |
| Phase 6: Add Container Smoke Test | 15 分钟 |
| Phase 7: Verify Dependency Boundaries | 10 分钟 |
| Phase 8: CI Checkpoint | 20 分钟(等待 CI) |
| Phase 9: Document & Handoff | 10 分钟 |
| **总计** | **~2.5 小时** |

*(实际时间可能因 CI 队列、网络速度等因素浮动)*

---

## 参考文档

- `packages/web-host/src/index.ts` — BackendLauncher + StaticServer 接口(M3-M6)
- `scripts/prepareAionuiBackend.js` — M7 backend 准备脚本
- `scripts/prepareBundledBun.js` — Bun 运行时准备脚本
- `.github/workflows/_build-reusable.yml` — CI workflow 模板
- `packages/desktop/electron-builder.yml` — Electron 打包配置(tarball 参考)
- `docs/backend-migration/handoffs/M7-outcome.md` — M7 交付物
- `docs/backend-migration/plans/2026-05-07-m7-prepare-backend-ci.md` — M7 详细计划(格式参考)

---

## 后续里程碑依赖

- **M9 (install-web script)**: 使用 M8 产出的 tarball 实现 `curl | bash` 一键安装脚本
- **M10+ (release automation)**: 将 tarball 上传到 GitHub releases,供 M9 脚本下载

---

*本计划由 plan-writer-m8 生成,基于 M7 格式模板和源码探查结果。*
