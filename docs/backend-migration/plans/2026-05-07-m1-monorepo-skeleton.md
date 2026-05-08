# M1 Monorepo 骨架实施计划

> **给执行 agent**:本计划自包含。只读本文件和下方列出的两份参考文档。
> 不要读其他 Mx 计划 —— 它们依赖 M1 先完成。

**目标**:把整个 `src/` 目录迁到 `packages/desktop/src/`,建立 bun
workspaces,把 `electron-builder.yml` 和 `electron.vite.config.ts` 迁进
`packages/desktop/`,并同步更新所有硬编码 `src/` 路径的配置文件 —— 保证
`bun run dev` / `bun run webui` / `bun run build` 一律不回退。

**架构**:纯结构性重构。除了因迁移必然的 import 路径变更外,不改任何运行期
逻辑。单 PR、单 revert 即可回退。

**技术栈**:bun workspaces、TypeScript path alias、vite / electron-vite /
electron-builder / vitest。

---

## 零上下文会话背景

你正在执行 9 个里程碑重构中的第 1 个(M1),目标是把 AionUi 的 WebUI 从
Electron 解耦。完整设计在
`docs/backend-migration/plans/2026-05-07-webui-decouple-electron-design.md`。
团队协作契约在
`docs/backend-migration/plans/2026-05-07-webui-decouple-team-playbook.md`。

**M1 的交付物**:仓库变为 bun workspaces monorepo。所有现有功能
(`bun run dev` / `webui` / `build`)照常工作。`src/` 目录消失,内容迁到
`packages/desktop/src/`。`electron-builder.yml` 和 `electron.vite.config.ts`
迁入 `packages/desktop/`。后续里程碑(M3 起)会在这个骨架上增加
`packages/web-host/` 和 `packages/web-cli/`。

**M1 不做的事**:不改任何业务逻辑;不新增 `packages/desktop/` 以外的包;
暂不引入 `@aionui/web-host`;不清理 `aionrs` 遗留(那是 M2 的事)。

**开始前的前置条件**:
- `git status` 干净
- 已装 Node 22+、bun
- 当前状态下 `bun install` 成功
- 当前状态下 `bun run dev` 能启动

**分支**:基于 `origin/feat/backend-migration` 创建 `feat/m1-monorepo-skeleton`
(不是基于 `main`)。整个 9 里程碑重构都发生在 `feat/backend-migration`
这条长期分支上。

```bash
git fetch origin
git checkout -b feat/m1-monorepo-skeleton origin/feat/backend-migration
git rev-parse --abbrev-ref HEAD   # 应为 feat/m1-monorepo-skeleton
```

PR 的 base 分支是 `feat/backend-migration`,不是 `main`。

## 参考文档

除本计划外,**只**读这两份:

1. `docs/backend-migration/plans/2026-05-07-webui-decouple-electron-design.md`
   —— "目标形态"、"仓库组织"、"M1 的隐蔽风险" 三节
2. `docs/backend-migration/plans/2026-05-07-webui-decouple-team-playbook.md`
   —— "M1 checkpoint" 一节

不要读其他里程碑计划。

---

## 文件清单

**迁移(git mv)**:
- `src/` → `packages/desktop/src/`
- `electron-builder.yml` → `packages/desktop/electron-builder.yml`
- `electron.vite.config.ts` → `packages/desktop/electron.vite.config.ts`

**新建**:
- `packages/desktop/package.json`

**修改(12 大类配置文件)**:
- `package.json`(根)
- `tsconfig.json`
- `vitest.config.ts`
- `uno.config.ts`
- `codecov.yml`
- `.oxlintrc.json`
- `.pre-commit-config.yaml`
- `scripts/build-with-builder.js`
- `scripts/postinstall.js`
- `AGENTS.md`
- `docs/conventions/file-structure.md`
- `.claude/skills/architecture/SKILL.md` + `references/process.md` + `references/renderer.md`
- `.github/workflows/README.md`
- `.github/workflows/gpt-review.yml`
- `tests/vitest.setup.ts` 以及 20+ 个测试文件(相对路径改 alias)

**验证不回退**(只跑,不改):
- `bun run dev`
- `bun run webui`
- `bun run build`
- `bun test`
- `bun run lint`
- `bunx tsc --noEmit`

---

## 阶段 0:建立基线快照

- [ ] **步骤 0.1:记录基线状态供后续对比**

```bash
cd /Users/zhoukai/Documents/github/AionUi

# 当前测试通过数量
bun test 2>&1 | tail -20 > /tmp/m1-baseline-test.log

# 当前 src/ 文件数
find src -type f | wc -l > /tmp/m1-baseline-file-count.txt

# 当前 package.json 脚本名单
bun run 2>&1 | head -50 > /tmp/m1-baseline-scripts.log
```

预期:`/tmp/m1-baseline-test.log` 中有测试通过数。这是基线,不要 commit。

- [ ] **步骤 0.2:从 feat/backend-migration 创建新分支**

```bash
git fetch origin
git checkout -b feat/m1-monorepo-skeleton origin/feat/backend-migration
git status
```

预期:干净,已切换到新分支。验证基线:
```bash
git merge-base --is-ancestor origin/feat/backend-migration HEAD && echo "base OK"
```

---

## 阶段 1:目录迁移(此阶段会暂时破坏构建,阶段 2 开始逐步修复)

- [ ] **步骤 1.1:创建 `packages/` 目录骨架**

```bash
mkdir -p packages/desktop
```

- [ ] **步骤 1.2:把 `src/` 迁到 `packages/desktop/`**

```bash
git mv src packages/desktop/src
```

预期:`packages/desktop/src/process/…` 等存在;根 `src/` 不再存在。

- [ ] **步骤 1.3:迁 `electron.vite.config.ts`**

```bash
git mv electron.vite.config.ts packages/desktop/electron.vite.config.ts
```

- [ ] **步骤 1.4:迁 `electron-builder.yml`**

```bash
git mv electron-builder.yml packages/desktop/electron-builder.yml
```

- [ ] **步骤 1.5:提交纯移动 commit**

```bash
git add -A
git status   # 验证只有迁移,没有文件内容修改
git commit -m "refactor(m1): move src/ and electron configs to packages/desktop/

Raw file moves only. Config updates in follow-up commits."
```

这个 commit 会让构建暂时坏掉,后续阶段依次修复。

---

## 阶段 2:创建 `packages/desktop/package.json`

- [ ] **步骤 2.1:创建 `packages/desktop/package.json`**

内容:

```json
{
  "name": "@aionui/desktop",
  "version": "0.0.0",
  "private": true,
  "description": "AionUi desktop Electron application",
  "main": "../../out/main/index.js"
}
```

`main` 指向 `../../out/main/index.js`,因为 electron-vite 输出仍在仓库根
`out/` 目录下(阶段 3 会保持这个约定)。

- [ ] **步骤 2.2:提交**

```bash
git add packages/desktop/package.json
git commit -m "refactor(m1): add packages/desktop/package.json"
```

---

## 阶段 3:更新根 `package.json`

- [ ] **步骤 3.1:声明 workspaces,修改 scripts**

编辑根 `package.json`。

**新增顶层字段**(插入到合适位置,例如 `keywords` 之后):

```json
  "workspaces": [
    "packages/*"
  ],
```

**修改** `scripts.test:bun`,从:
```json
"test:bun": "bun test src/process/services/database/drivers/*.bun.test.ts"
```
改为:
```json
"test:bun": "bun test packages/desktop/src/process/services/database/drivers/*.bun.test.ts"
```

其余 scripts 暂不改(阶段 4 会加 `--config` 参数)。

- [ ] **步骤 3.2:验证 `bun install` 能识别 workspace**

```bash
rm -rf node_modules bun.lock
bun install
```

预期:成功;`bun.lock` 内有 workspace 记录。

- [ ] **步骤 3.3:提交**

```bash
git add package.json bun.lock
git commit -m "refactor(m1): declare bun workspaces in root package.json"
```

---

## 阶段 4:构建脚本指向新 config 位置

`scripts/build-with-builder.js` 里有 **4 处**硬编码 `electron-vite` /
`electron-builder` 相关路径,逐一修复。

- [ ] **步骤 4.1:更新 `package.json` scripts 中 10 个 electron-vite 调用**

在 `package.json:12-67` 的 `scripts` 字段里,用 Edit 工具对每一项做精确替换。
涉及的 10 个 script 和完整替换(严格按此,不要简写):

```
"start": "electron-vite dev"
  → "electron-vite dev --config packages/desktop/electron.vite.config.ts"

"start:multi": "cross-env AIONUI_MULTI_INSTANCE=1 electron-vite dev"
  → "cross-env AIONUI_MULTI_INSTANCE=1 electron-vite dev --config packages/desktop/electron.vite.config.ts"

"cli": "electron-vite dev"
  → "electron-vite dev --config packages/desktop/electron.vite.config.ts"

"webui": "rm -rf out/renderer && electron-vite dev -- --webui"
  → "rm -rf out/renderer && electron-vite dev --config packages/desktop/electron.vite.config.ts -- --webui"

"webui:remote": "rm -rf out/renderer && electron-vite dev -- --webui --remote"
  → "rm -rf out/renderer && electron-vite dev --config packages/desktop/electron.vite.config.ts -- --webui --remote"

"webui:prod": "cross-env NODE_ENV=production electron-vite dev -- --webui"
  → "cross-env NODE_ENV=production electron-vite dev --config packages/desktop/electron.vite.config.ts -- --webui"

"webui:prod:remote": "cross-env NODE_ENV=production electron-vite dev -- --webui --remote"
  → "cross-env NODE_ENV=production electron-vite dev --config packages/desktop/electron.vite.config.ts -- --webui --remote"

"resetpass": "electron-vite dev -- --resetpass"
  → "electron-vite dev --config packages/desktop/electron.vite.config.ts -- --resetpass"

"package": "electron-vite build"
  → "electron-vite build --config packages/desktop/electron.vite.config.ts"

"make": "electron-vite build"
  → "electron-vite build --config packages/desktop/electron.vite.config.ts"
```

- [ ] **步骤 4.2:更新 `scripts/build-with-builder.js` 第 54-55 行的增量构建 hash 清单**

`computeSourceHash` 函数(L46-87)用这几个文件做增量构建缓存判断。迁移后
路径全变了,缓存判断会失效(一直触发全量重建或一直命中旧缓存)。

Edit 原文件 L49-57:
```js
  const filesToHash = [
    'package.json',
    'package-lock.json',
    'bun.lock',
    'tsconfig.json',
    'electron.vite.config.ts',
    'electron-builder.yml',
    'justfile',
  ];
```
改为:
```js
  const filesToHash = [
    'package.json',
    'package-lock.json',
    'bun.lock',
    'tsconfig.json',
    'packages/desktop/electron.vite.config.ts',
    'packages/desktop/electron-builder.yml',
    'justfile',
  ];
```

再改 L68:
```js
  const hashDirs = ['src', 'public', 'scripts'];
```
改为:
```js
  const hashDirs = ['packages/desktop/src', 'packages', 'public', 'scripts'];
```

(加了 `packages` 本身,以便将来新增的 `packages/web-host/` 等子包也能
触发增量缓存失效。)

- [ ] **步骤 4.3:更新 `scripts/build-with-builder.js` L322 的 config 读取路径**

`getTargetArchFromConfig` 函数(L320-341)读取 `electron-builder.yml` 解析
目标架构。Edit L322:
```js
    const configPath = path.resolve(__dirname, '../electron-builder.yml');
```
改为:
```js
    const configPath = path.resolve(__dirname, '../packages/desktop/electron-builder.yml');
```

- [ ] **步骤 4.4:为 `electron-builder` 命令补 `--config` 参数**

`scripts/build-with-builder.js:544` 的:
```js
  const builderCommand = `bunx electron-builder ${builderArgs} ${archFlag} ${nsisInclude} ${publishArg}`;
```
改为:
```js
  const builderCommand = `bunx electron-builder --config packages/desktop/electron-builder.yml ${builderArgs} ${archFlag} ${nsisInclude} ${publishArg}`;
```

同时 L226 的 DMG 重试路径:
```js
  execSync(`bunx electron-builder --mac dmg --${targetArch} --prepackaged "${appPath}" --publish=never`, {
```
改为:
```js
  execSync(`bunx electron-builder --config packages/desktop/electron-builder.yml --mac dmg --${targetArch} --prepackaged "${appPath}" --publish=never`, {
```

- [ ] **步骤 4.5:注意 `package.json.main` 的自动覆盖**

`scripts/build-with-builder.js:386-394` 会**自动把根 `package.json.main`
改回 `./out/main/index.js`**:

```js
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
if (packageJson.main !== './out/main/index.js') {
  packageJson.main = './out/main/index.js';
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
}
```

**不要改这段**。M1 的约定是 electron-vite 输出仍放仓库根 `out/`,所以根
`package.json.main` 保持 `./out/main/index.js` 是正确的;
`packages/desktop/package.json.main` 单独指向 `../../out/main/index.js`
(阶段 2 已完成)。两者并存不冲突。

- [ ] **步骤 4.6:commit**

```bash
git add package.json scripts/build-with-builder.js
git commit -m "refactor(m1): point build scripts at packages/desktop/ configs"
```

---

## 阶段 5:更新 `packages/desktop/electron.vite.config.ts`

文件在阶段 1 已迁移。`resolve(...)` 是从 `electron-vite` import 的 `path`
模块别名(L3),**相对 `process.cwd()` 解析**。因为构建命令从仓库根执行
(`bun run dev` 等),所以 `resolve('src/...')` 会解析到**仓库根的 `src/`**,
迁移后这个目录不存在了,必须改成 `packages/desktop/src/...`。

共有 **12 处** `src/` 引用需要改,另外 1 处 Sentry 的正则也要改。

- [ ] **步骤 5.1:改 `mainAliases`(L48-55)**

```ts
const mainAliases = {
  '@': resolve('src'),
  '@common': resolve('src/common'),
  '@renderer': resolve('src/renderer'),
  '@process': resolve('src/process'),
  '@worker': resolve('src/process/worker'),
  '@xterm/headless': resolve('src/common/utils/shims/xterm-headless.ts'),
};
```
改为:
```ts
const mainAliases = {
  '@': resolve('packages/desktop/src'),
  '@common': resolve('packages/desktop/src/common'),
  '@renderer': resolve('packages/desktop/src/renderer'),
  '@process': resolve('packages/desktop/src/process'),
  '@worker': resolve('packages/desktop/src/process/worker'),
  '@xterm/headless': resolve('packages/desktop/src/common/utils/shims/xterm-headless.ts'),
};
```

- [ ] **步骤 5.2:改 Sentry `rewriteSources` 正则(L66-71)**

```ts
      rewriteSources: (source: string) => {
        // Normalize Windows backslashes and strip leading relative prefixes
        // so Sentry paths match the GitHub repo structure (e.g. src/process/...)
        return source.replace(/\\/g, '/').replace(/^(\.\.\/)+(src\/)/, '$2');
      },
```
改为:
```ts
      rewriteSources: (source: string) => {
        // Normalize Windows backslashes and strip leading relative prefixes
        // so Sentry paths match the GitHub repo structure (e.g.
        // packages/desktop/src/process/...)
        return source.replace(/\\/g, '/').replace(/^(\.\.\/)+(packages\/desktop\/src\/)/, '$2');
      },
```

- [ ] **步骤 5.3:改 viteStaticCopy 资源路径(L103)**

```ts
                  { src: 'src/renderer/assets/logos/*', dest: 'static/images' },
```
改为:
```ts
                  { src: 'packages/desktop/src/renderer/assets/logos/*', dest: 'static/images' },
```

- [ ] **步骤 5.4:改 main 进程 entry(L117)**

```ts
            index: resolve('src/index.ts'),
```
改为:
```ts
            index: resolve('packages/desktop/src/index.ts'),
```

- [ ] **步骤 5.5:改 preload alias 和 entry(L142、L150-153)**

L142:
```ts
        alias: { '@': resolve('src'), '@common': resolve('src/common') },
```
改为:
```ts
        alias: { '@': resolve('packages/desktop/src'), '@common': resolve('packages/desktop/src/common') },
```

L150-153:
```ts
            index: resolve('src/preload/main.ts'),
            petPreload: resolve('src/preload/petPreload.ts'),
            petHitPreload: resolve('src/preload/petHitPreload.ts'),
            petConfirmPreload: resolve('src/preload/petConfirmPreload.ts'),
```
改为:
```ts
            index: resolve('packages/desktop/src/preload/main.ts'),
            petPreload: resolve('packages/desktop/src/preload/petPreload.ts'),
            petHitPreload: resolve('packages/desktop/src/preload/petHitPreload.ts'),
            petConfirmPreload: resolve('packages/desktop/src/preload/petConfirmPreload.ts'),
```

- [ ] **步骤 5.6:改 renderer alias(L176-184)**

```ts
        alias: {
          '@': resolve('src'),
          '@common': resolve('src/common'),
          '@renderer': resolve('src/renderer'),
          '@process': resolve('src/process'),
          '@worker': resolve('src/process/worker'),
          // Force ESM version of streamdown
          streamdown: resolve('node_modules/streamdown/dist/index.js'),
        },
```
改为:
```ts
        alias: {
          '@': resolve('packages/desktop/src'),
          '@common': resolve('packages/desktop/src/common'),
          '@renderer': resolve('packages/desktop/src/renderer'),
          '@process': resolve('packages/desktop/src/process'),
          '@worker': resolve('packages/desktop/src/process/worker'),
          // Force ESM version of streamdown
          streamdown: resolve('node_modules/streamdown/dist/index.js'),
        },
```

- [ ] **步骤 5.7:改 renderer entry(L202-205)**

```ts
            index: resolve('src/renderer/index.html'),
            pet: resolve('src/renderer/pet/pet.html'),
            'pet-hit': resolve('src/renderer/pet/pet-hit.html'),
            'pet-confirm': resolve('src/renderer/pet/pet-confirm.html'),
```
改为:
```ts
            index: resolve('packages/desktop/src/renderer/index.html'),
            pet: resolve('packages/desktop/src/renderer/pet/pet.html'),
            'pet-hit': resolve('packages/desktop/src/renderer/pet/pet-hit.html'),
            'pet-confirm': resolve('packages/desktop/src/renderer/pet/pet-confirm.html'),
```

- [ ] **步骤 5.8:验证(不跑 lint/tsc,那是阶段 12;这里只验启动)**

```bash
# 先 tsc 快速扫一下,只看语法性错误
bunx tsc --noEmit packages/desktop/electron.vite.config.ts 2>&1 | head -20

# dev 启动冒烟
timeout 20s bun run dev > /tmp/m1-phase5-dev.log 2>&1 &
DEV_PID=$!
sleep 18
grep -qE "(built in|ready in|DevTools)" /tmp/m1-phase5-dev.log && echo "DEV_READY" || (echo "DEV_NOT_READY"; cat /tmp/m1-phase5-dev.log)
kill -TERM $DEV_PID 2>/dev/null || true
wait $DEV_PID 2>/dev/null || true

# webui 启动冒烟
timeout 25s bun run webui > /tmp/m1-phase5-webui.log 2>&1 &
WEBUI_PID=$!
sleep 20
PORT=$(grep -oE "http://(127.0.0.1|localhost):[0-9]+" /tmp/m1-phase5-webui.log | head -1 | grep -oE "[0-9]+$")
echo "WEBUI_PORT=$PORT"
[ -n "$PORT" ] && curl -fsS -o /dev/null -w "HTTP_STATUS=%{http_code}\n" "http://127.0.0.1:$PORT/" || echo "no port parsed"
kill -TERM $WEBUI_PID 2>/dev/null || true
wait $WEBUI_PID 2>/dev/null || true
```

预期:`DEV_READY`、`WEBUI_PORT` 非空、`HTTP_STATUS=200`。

如果 `electron-vite dev` 报"Cannot find entry: src/index.ts",说明某处
遗漏改了;`grep -n "'src/" packages/desktop/electron.vite.config.ts`
应无输出(注意带单引号,排除注释里的 `src/process/...` 这种描述)。

- [ ] **步骤 5.9:commit**

```bash
git add packages/desktop/electron.vite.config.ts
git commit -m "refactor(m1): update all 12 src/ path references in electron.vite.config.ts"
```

---

## 阶段 6:更新 `packages/desktop/electron-builder.yml`

electron-builder 的路径有两种解析规则:
- `directories` / `extraResources[].from` / `afterPack` / `afterSign` / `icon` 等
  **相对 yml 本身所在目录解析**,迁到 `packages/desktop/` 后需要 `../../` 前缀
- `files[]` glob 默认**相对 `appDir`**(通过 `directories.app` 控制),也需要
  `../../` 前缀

本阶段改动多但规则统一:**凡是指向仓库根或 `out/` / `node_modules/` 的路径,
前面都加 `../../`**。

- [ ] **步骤 6.1:保持 `directories.output`,新增 `directories.app`**

原 L14-16:
```yaml
directories:
  output: out
  buildResources: resources
```
改为:
```yaml
directories:
  app: ../..
  output: ../../out
  buildResources: ../../resources
```

`directories.app: ../..` 告诉 electron-builder 应用根目录是仓库根
(`package.json` 在那、`out/` 在那、`node_modules/` 在那)。这样 `files[]`
里的 `out/**` 和 `node_modules/**` 都能直接命中,不用加前缀。

**注意**:因为设了 `directories.app: ../..`,阶段 6 里**所有 `files[]` 相关
路径都不需要加 `../../` 前缀**(appDir 已经指向仓库根)。需要加前缀的是
`extraResources[].from` / `afterPack` / `afterSign` / `icon` 这些路径。

- [ ] **步骤 6.2:`files[]` 保持不变**

由于上一步设了 `directories.app: ../..`,`files[]` 里的 `out/main/**` /
`node_modules/better-sqlite3/**` 等都继续相对仓库根解析,**L18-99 整段
不需要修改**。

但是**补充防御性排除**,阻止未来的 web-host / web-cli 被扫进 asar。在
L66(`'!**/node_modules/*.d.ts'` 之前)**新增**:
```yaml
  # Defensive: exclude sibling packages from desktop bundle
  - '!packages/web-host/**'
  - '!packages/web-cli/**'
  - '!packages/shared-scripts/**'
  - '!packages/desktop/src/**'
```

(最后一行 `!packages/desktop/src/**` 是因为源码已经被 electron-vite
编译到 `out/` 里,asar 不需要再装一份源码。)

- [ ] **步骤 6.3:`extraResources[]` 全部加 `../../` 前缀**

原 L101-115:
```yaml
extraResources:
  - from: public
    to: .
  - from: resources/app.png
    to: app.png
  - from: resources/bundled-bun
    to: bundled-bun
  # aionrs binary (pre-compiled per platform/arch)
  - from: resources/bundled-aionrs
    to: bundled-aionrs
  # aionui-backend binary (pre-compiled per platform/arch)
  - from: resources/bundled-aionui-backend
    to: bundled-aionui-backend
  - from: resources/hub
    to: hub
```
改为:
```yaml
extraResources:
  - from: ../../public
    to: .
  - from: ../../resources/app.png
    to: app.png
  - from: ../../resources/bundled-bun
    to: bundled-bun
  # aionrs binary (pre-compiled per platform/arch)
  - from: ../../resources/bundled-aionrs
    to: bundled-aionrs
  # aionui-backend binary (pre-compiled per platform/arch)
  - from: ../../resources/bundled-aionui-backend
    to: bundled-aionui-backend
  - from: ../../resources/hub
    to: hub
```

`bundled-aionrs` 留在 M1,M2 会整条删除。

- [ ] **步骤 6.4:`win.icon` 加前缀(L121)**

```yaml
  icon: resources/app.ico # Use the checked-in Windows icon resource for executable metadata/icon patching
```
改为:
```yaml
  icon: ../../resources/app.ico # Use the checked-in Windows icon resource for executable metadata/icon patching
```

- [ ] **步骤 6.5:`mac.icon` 和 `entitlements` 加前缀(L138、L143-144)**

```yaml
  icon: resources/app.icns
```
→
```yaml
  icon: ../../resources/app.icns
```

```yaml
  entitlements: entitlements.plist
  entitlementsInherit: entitlements.plist
```
→
```yaml
  entitlements: ../../entitlements.plist
  entitlementsInherit: ../../entitlements.plist
```

- [ ] **步骤 6.6:`afterPack` / `afterSign` 加前缀(L165-166)**

```yaml
afterPack: scripts/afterPack.js
afterSign: scripts/afterSign.js
```
改为:
```yaml
afterPack: ../../scripts/afterPack.js
afterSign: ../../scripts/afterSign.js
```

- [ ] **步骤 6.7:`linux.icon` 加前缀(L171)**

```yaml
  icon: resources/app.png
```
→
```yaml
  icon: ../../resources/app.png
```

- [ ] **步骤 6.8:commit(暂不运行 build)**

```bash
git add packages/desktop/electron-builder.yml
git commit -m "refactor(m1): update all electron-builder paths for packages/desktop/ location"
```

阶段 7-9 修完剩余配置后才跑 `bun run build`,因为 build 流程内部还会跑
tsc / oxlint。

- [ ] **步骤 6.9:提前冒烟 build 的配置解析(不跑完整 build)**

快速验证 electron-builder 能读懂新路径,不实际打包:

```bash
# 干跑 electron-builder,只解析 config,不执行打包
bunx electron-builder --config packages/desktop/electron-builder.yml --help 2>&1 | head -5
```

预期:命令输出 help 信息,无 "cannot resolve" / "file not found" 之类错误。

如果想验证 `directories.app: ../..` 解析正确,检查它能否找到根 package.json:
```bash
# 先检查引用路径都存在
ls -la entitlements.plist resources/app.icns resources/app.png scripts/afterPack.js scripts/afterSign.js 2>&1 | head
```

应全部显示文件存在。

---

## 阶段 7:更新根 `tsconfig.json`

- [ ] **步骤 7.1:修改 `paths`**

把:
```json
"paths": {
  "@/*": ["./src/*"],
  "@process/*": ["./src/process/*"],
  "@renderer/*": ["./src/renderer/*"],
  "@worker/*": ["./src/process/worker/*"]
}
```
改为:
```json
"paths": {
  "@/*": ["./packages/desktop/src/*"],
  "@process/*": ["./packages/desktop/src/process/*"],
  "@renderer/*": ["./packages/desktop/src/renderer/*"],
  "@worker/*": ["./packages/desktop/src/process/worker/*"]
}
```

- [ ] **步骤 7.2:修改 `include`**

```json
"include": [
  "packages/desktop/src/**/*",
  "uno.config.ts",
  "packages/desktop/electron.vite.config.ts",
  "playwright.config.ts",
  "packages/desktop/src/renderer/types.d.ts"
]
```

- [ ] **步骤 7.3:修改 `exclude`**

```json
"exclude": [
  "packages/desktop/src/process/services/database/drivers/BunSqliteDriver.ts",
  "packages/desktop/src/process/services/database/drivers/BunSqliteDriver.bun.test.ts"
]
```

- [ ] **步骤 7.4:验证 tsc 通过**

```bash
bunx tsc --noEmit 2>&1 | tee /tmp/m1-phase7-tsc.log | tail -30
```

预期:退出码 0。若有 `Cannot find module '../../src/...'` 类错误,是测试
文件的相对路径问题,阶段 10 会统一修复,暂时可接受。

- [ ] **步骤 7.5:提交**

```bash
git add tsconfig.json
git commit -m "refactor(m1): update tsconfig paths for packages/desktop/"
```

---

## 阶段 8:更新 `vitest.config.ts`

- [ ] **步骤 8.1:修改 alias**

```ts
const aliases = {
  '@/': path.resolve(__dirname, './packages/desktop/src') + '/',
  '@process/': path.resolve(__dirname, './packages/desktop/src/process') + '/',
  '@renderer/': path.resolve(__dirname, './packages/desktop/src/renderer') + '/',
  '@worker/': path.resolve(__dirname, './packages/desktop/src/process/worker') + '/',
  '@mcp/models/': path.resolve(__dirname, './packages/desktop/src/common/models') + '/',
  '@mcp/types/': path.resolve(__dirname, './packages/desktop/src/common') + '/',
  '@mcp/': path.resolve(__dirname, './packages/desktop/src/common') + '/',
};
```

- [ ] **步骤 8.2:修改 coverage include/exclude**

`include`:
```ts
include: ['packages/desktop/src/**/*.{ts,tsx}', 'packages/**/src/**/*.{ts,tsx}', 'scripts/prepareBundledBun.js'],
```

`exclude`:
```ts
exclude: [
  'packages/**/src/**/*.d.ts',
  'packages/desktop/src/index.ts',
  'packages/desktop/src/preload.ts',
  'packages/desktop/src/common/utils/shims/**',
  'packages/desktop/src/common/types/**',
  'packages/desktop/src/renderer/**/*.json',
  'packages/desktop/src/renderer/**/*.svg',
  'packages/desktop/src/renderer/**/*.css',
  'packages/desktop/src/common/config/i18n-config.json',
],
```

- [ ] **步骤 8.3:跑测试**

```bash
bun test 2>&1 | tee /tmp/m1-phase8-test.log | tail -20
```

预期:通过数与 `/tmp/m1-baseline-test.log` 一致。

如果有 `Cannot resolve '../../src/...'` 这种失败,都是测试里硬编码相对路径
的问题,阶段 10 会统一修复。

- [ ] **步骤 8.4:提交**

```bash
git add vitest.config.ts
git commit -m "refactor(m1): update vitest aliases and coverage globs"
```

---

## 阶段 9:更新其余质量门禁配置

- [ ] **步骤 9.1:`uno.config.ts`**

```bash
grep -n "src/" uno.config.ts
```

把 content 扫描 glob 从 `src/**/*.tsx` 改成 `packages/desktop/src/**/*.tsx`。

```bash
git add uno.config.ts
git commit -m "refactor(m1): point unocss content scan at packages/desktop/src"
```

- [ ] **步骤 9.2:`codecov.yml`**

把 `ignore:` 段的所有 `src/` 替换为 `packages/desktop/src/`。

```bash
grep -n "src/" codecov.yml
```

预期:除 `packages/desktop/src/` 外无其他 `src/` 引用。

```bash
git add codecov.yml
git commit -m "refactor(m1): update codecov ignore paths for packages/desktop"
```

- [ ] **步骤 9.3:`.oxlintrc.json`**

```bash
grep -n "src/" .oxlintrc.json
```

把引用到 `src/agent/gemini/cli/` 之类旧路径的 ignore 项改为
`packages/desktop/src/agent/gemini/cli/`。如果该目录在 `packages/desktop/src/`
下也不存在(表示已失效的陈旧引用),直接删除该条。

```bash
git add .oxlintrc.json
git commit -m "refactor(m1): update oxlint ignore paths"
```

- [ ] **步骤 9.4:`.pre-commit-config.yaml`**

把 `files: ^src/renderer/services/i18n/locales/`(约 L79)改为:
```yaml
files: ^packages/desktop/src/renderer/services/i18n/locales/
```

```bash
git add .pre-commit-config.yaml
git commit -m "refactor(m1): update pre-commit hook file patterns"
```

- [ ] **步骤 9.5:`scripts/postinstall.js`**

```bash
grep -n "src/" scripts/postinstall.js
```

若有引用就修,大概率没有。若有,commit:

```bash
git add scripts/postinstall.js
git commit -m "refactor(m1): update postinstall paths"
```

---

## 阶段 10:修复测试里硬编码的 `../../src/` import

- [ ] **步骤 10.1:列出所有用相对 `src/` import 的测试文件**

```bash
grep -rln "from '\.\./\.\./src/\|from '\.\./src/\|from '\.\./\.\./\.\./src/\|vi.mock('\.\./\.\./src/" tests/
```

约有 20+ 个文件。

- [ ] **步骤 10.2:分模块批量替换为 alias**

⚠️ 下面的 `sed -i ''` 是 macOS 语法,Linux 环境用 `sed -i`:

```bash
# ../../src/process/... → @process/...
grep -rln "from '\.\./\.\./src/process/" tests/ | xargs -I{} sh -c "sed -i '' \"s|from '../../src/process/|from '@process/|g\" {}"

# ../../src/renderer/... → @renderer/...
grep -rln "from '\.\./\.\./src/renderer/" tests/ | xargs -I{} sh -c "sed -i '' \"s|from '../../src/renderer/|from '@renderer/|g\" {}"

# ../../src/common/... → @mcp/...(跟 vitest alias 一致)
grep -rln "from '\.\./\.\./src/common/" tests/ | xargs -I{} sh -c "sed -i '' \"s|from '../../src/common/|from '@mcp/|g\" {}"

# ../../src/worker/... → @worker/...
grep -rln "from '\.\./\.\./src/worker/" tests/ | xargs -I{} sh -c "sed -i '' \"s|from '../../src/worker/|from '@worker/|g\" {}"

# 剩下的 catch-all:../../src/… → @/…
grep -rln "from '\.\./\.\./src/" tests/ | xargs -I{} sh -c "sed -i '' \"s|from '../../src/|from '@/|g\" {}"

# vi.mock 同样处理
grep -rln "vi.mock('\.\./\.\./src/process/" tests/ | xargs -I{} sh -c "sed -i '' \"s|vi.mock('../../src/process/|vi.mock('@process/|g\" {}"
grep -rln "vi.mock('\.\./\.\./src/renderer/" tests/ | xargs -I{} sh -c "sed -i '' \"s|vi.mock('../../src/renderer/|vi.mock('@renderer/|g\" {}"
grep -rln "vi.mock('\.\./\.\./src/common/" tests/ | xargs -I{} sh -c "sed -i '' \"s|vi.mock('../../src/common/|vi.mock('@mcp/|g\" {}"
grep -rln "vi.mock('\.\./\.\./src/worker/" tests/ | xargs -I{} sh -c "sed -i '' \"s|vi.mock('../../src/worker/|vi.mock('@worker/|g\" {}"
grep -rln "vi.mock('\.\./\.\./src/" tests/ | xargs -I{} sh -c "sed -i '' \"s|vi.mock('../../src/|vi.mock('@/|g\" {}"
```

- [ ] **步骤 10.3:验证没有遗漏**

```bash
grep -rln "from '\.\./\.\./src/\|vi.mock('\.\./\.\./src/\|from '\.\./src/" tests/
```

预期:无输出。

- [ ] **步骤 10.4:跑测试**

```bash
bun test 2>&1 | tee /tmp/m1-phase10-test.log | tail -20
```

预期:通过数与基线一致,无 `Cannot resolve` 错误。

- [ ] **步骤 10.5:提交**

```bash
git add tests/
git commit -m "refactor(m1): replace relative src/ imports with aliases in tests"
```

---

## 阶段 11:更新文档

这些文档不影响 build/test,但对后续 AI agent 找对路径至关重要。

- [ ] **步骤 11.1:`AGENTS.md`**

把所有 `src/process/` / `src/renderer/` / `src/common/` 改成
`packages/desktop/src/process/` 等。

```bash
grep -n "src/" AGENTS.md
```

预期:只剩 `packages/desktop/src/` 引用。

```bash
git add AGENTS.md
git commit -m "docs(m1): update AGENTS.md paths for monorepo layout"
```

- [ ] **步骤 11.2:`docs/conventions/file-structure.md`**

在文档顶部加一节:

```markdown
## Monorepo 布局(M1 之后)

本项目采用 bun workspaces monorepo 结构:

- `packages/desktop/` —— Electron 桌面应用(原根 `src/`)
- `packages/web-host/` —— (M3 添加)共享的 WebUI 核心
- `packages/web-cli/` —— (M8 添加)独立的 Node CLI

以下所有路径都以 `packages/desktop/src/` 作为桌面包根;之前的 `src/` 前缀
已废弃。
```

然后把正文里所有 `src/process/` / `src/renderer/` / `src/common/` 改成
`packages/desktop/src/...`。

```bash
git add docs/conventions/file-structure.md
git commit -m "docs(m1): update file-structure doc for monorepo layout"
```

- [ ] **步骤 11.3:`.claude/skills/architecture/`**

替换以下三个文件里的 `src/process/` / `src/renderer/` / `src/common/` /
`src/process/worker/` 为 `packages/desktop/src/...`:
- `.claude/skills/architecture/SKILL.md`
- `.claude/skills/architecture/references/process.md`
- `.claude/skills/architecture/references/renderer.md`

```bash
grep -rn "src/" .claude/skills/architecture/
```

预期:只剩 `packages/desktop/src/` 引用。

```bash
git add .claude/skills/architecture/
git commit -m "docs(m1): update architecture skill for monorepo layout"
```

- [ ] **步骤 11.4:`.github/workflows/gpt-review.yml` 和 `README.md`**

```bash
grep -n "src/" .github/workflows/gpt-review.yml .github/workflows/README.md
```

把引用改成 `packages/desktop/src/...`。

```bash
git add .github/workflows/
git commit -m "docs(m1): update workflow docs for monorepo layout"
```

---

## 阶段 12:全量验证

- [ ] **步骤 12.1:干净重装**

```bash
rm -rf node_modules bun.lock out dist
bun install
```

预期:成功,workspace 符号链接建立。

- [ ] **步骤 12.2:TypeScript 检查**

```bash
bunx tsc --noEmit 2>&1 | tee /tmp/m1-final-tsc.log | tail -20
```

预期:退出码 0,无错误。

- [ ] **步骤 12.3:Lint**

```bash
bun run lint 2>&1 | tee /tmp/m1-final-lint.log | tail -20
```

预期:退出码 0。

- [ ] **步骤 12.4:单元测试**

```bash
bun test 2>&1 | tee /tmp/m1-final-test.log | tail -20
```

预期:通过数与 `/tmp/m1-baseline-test.log` 一致。

- [ ] **步骤 12.5:桌面 dev 启动自动化冒烟**

```bash
timeout 20s bun run dev > /tmp/m1-final-dev.log 2>&1 &
DEV_PID=$!
sleep 18
ps -p $DEV_PID > /dev/null && echo "DEV_RUNNING" || echo "DEV_DEAD"
grep -qE "(built in|ready in|DevTools)" /tmp/m1-final-dev.log && echo "DEV_READY" || echo "DEV_NOT_READY"
kill -TERM $DEV_PID 2>/dev/null || true
wait $DEV_PID 2>/dev/null || true
```

预期:打印 `DEV_RUNNING` 和 `DEV_READY`。

- [ ] **步骤 12.6:WebUI dev 启动自动化冒烟**

```bash
timeout 25s bun run webui > /tmp/m1-final-webui.log 2>&1 &
WEBUI_PID=$!
sleep 20
PORT=$(grep -oE "http://(127.0.0.1|localhost):[0-9]+" /tmp/m1-final-webui.log | head -1 | grep -oE "[0-9]+$")
echo "WEBUI_PORT=$PORT"
[ -n "$PORT" ] && curl -fsS -o /dev/null -w "HTTP_STATUS=%{http_code}\n" "http://127.0.0.1:$PORT/" || echo "no port parsed"
kill -TERM $WEBUI_PID 2>/dev/null || true
wait $WEBUI_PID 2>/dev/null || true
```

预期:`WEBUI_PORT` 非空,`HTTP_STATUS=200`。

- [ ] **步骤 12.7:生产构建**

```bash
bun run build-mac:arm64
```

(或本机对应平台命令。)

预期:退出码 0;`ls dist/*.dmg` 至少一个文件。

- [ ] **步骤 12.8:asar 产物审计**

```bash
# 找到实际 app.asar 路径
APP_ASAR=$(find dist -name "app.asar" -type f | head -1)
echo "APP_ASAR=$APP_ASAR"

# 检查没有 web-cli / web-host 残留(当前还没这些包,值应为 0)
bunx @electron/asar list "$APP_ASAR" | grep -cE "packages/(web-cli|web-host)"
```

预期:`APP_ASAR` 非空,grep count 为 0。

- [ ] **步骤 12.9:pre-commit 全量检查**

```bash
prek run --from-ref origin/feat/backend-migration --to-ref HEAD 2>&1 | tail -30
```

预期:全部通过。

- [ ] **步骤 12.10:写 handoff notes**

按 playbook 的模板创建 `docs/backend-migration/handoffs/M1-outcome.md`,
字数控制在 500 字以内,内容包括:
- 新建目录:`packages/desktop/`
- 迁移的文件(见阶段 1)
- 修改的配置文件(12 大类)
- 验证证据(tsc / lint / test / dev / webui / build 全绿)
- 偏离本计划的地方及原因
- 对 M2 的提示(主要是:M2 需要改的是
  `packages/desktop/electron-builder.yml`,不是已删除的根目录那个)

---

## 阶段 13:同步基线 + 推分支 + 向 team-lead 报告

本方案**不创建 PR**。teammate 只把 feature 分支 push 到 origin,让下游
teammate 能基于此分支起步;PR 由人类在整条 9 里程碑链完成后统一处理。

**在 push 之前,必须先把 `origin/feat/backend-migration` 合入本分支**,
避免分支偏离基准太远。见 playbook 的"基线同步规范"。

- [ ] **步骤 13.1:合入最新基线**

```bash
# 拉最新基线
git fetch origin feat/backend-migration

# 查看基线是否有新 commit
git log --oneline HEAD..origin/feat/backend-migration | head -10
```

- 如果输出为空,基线没变化,跳到步骤 13.2
- 如果有 commit,执行 merge:

```bash
git merge origin/feat/backend-migration --no-ff \
  -m "chore(m1): sync with feat/backend-migration"
```

**禁止用 `rebase`**,必须用 `merge`(保留 commit 历史,便于回滚和下游
teammate 拉分支时的 SHA 稳定性)。

**冲突处理**:
- 无冲突 → `git status` 看到 "All conflicts fixed" → 继续
- 有冲突且简单(不同文件或同文件不同段落)→ 手动解决,`git add` 后
  `git commit`(commit message 沿用 merge 自动生成的)
- 冲突复杂(同一段代码两方都改)→ **不要硬改**,直接进入步骤 13.4 向
  team-lead escalate,本 teammate 终止

- [ ] **步骤 13.2:合入后重跑自动化验证**

合入基线后代码变了,必须重跑阶段 12 的核心验证:

```bash
bunx tsc --noEmit 2>&1 | tail -10
bun run lint 2>&1 | tail -10
bun test 2>&1 | tail -10
# 关键冒烟(阶段 12.5 / 12.6 / 12.7)
```

预期:全部 PASS。

**如果失败**:
- 是基线引入的破坏性变更 → **不要尝试修**,进入步骤 13.4 escalate
- 是本里程碑和基线的隐性冲突(文件无冲突但语义冲突)→ 同样 escalate

- [ ] **步骤 13.3:push feature 分支到 origin**

```bash
git push -u origin feat/m1-monorepo-skeleton
git rev-parse HEAD > /tmp/m1-final-sha.txt
cat /tmp/m1-final-sha.txt
```

预期:push 成功,`git branch -vv` 显示 tracking
`origin/feat/m1-monorepo-skeleton`;SHA 保存到 `/tmp/m1-final-sha.txt`。

这个 SHA 会写进 handoff,作为 M2 teammate 的起点。

- [ ] **步骤 13.4:通过 SendMessage 向 team-lead 报告**

如果作为 team teammate 运行,用 SendMessage 工具向主会话报告。

**正常完成**:
```
SendMessage({
  to: "team-lead",
  message: "M1 完成。
  - 分支:feat/m1-monorepo-skeleton
  - SHA:<从 /tmp/m1-final-sha.txt 读>
  - 基线同步:origin/feat/backend-migration @ <基线 SHA> 已合入
  - Handoff:docs/backend-migration/handoffs/M1-outcome.md
  - 偏离计划:<无 / 列出>
  请启动 M2。"
})
```

**合入基线失败或验证失败**(escalate):
```
SendMessage({
  to: "team-lead",
  message: "M1 完成实施但基线同步/验证失败,需要人类决策。
  - 分支:feat/m1-monorepo-skeleton(本地,尚未 push)
  - 当前 SHA:<git rev-parse HEAD>
  - 问题:<合并冲突文件 / 验证失败原因>
  - 已尝试:<列出具体尝试>
  - Handoff 已写,详情见 docs/backend-migration/handoffs/M1-outcome.md 的
    Deviations 节。
  请决定如何处理。"
})
```

如果是独立执行(非 team 模式),直接在会话末尾打印上述信息即可。

**不要做**:
- 不要创建 PR(`gh pr create` 禁用)
- 不要 push / merge 到 `feat/backend-migration`
- 不要 rebase / force-push `feat/m1-monorepo-skeleton`(M2 会基于它)
- 不要在冲突/失败时硬改后 push(会让 M2 基于有问题的分支起步)

---

## 回滚

如果本里程碑完成后才发现问题:

- **本地未 push**:`git reset --hard origin/feat/backend-migration` 重来
- **已 push 但下游还没开始**:删远程分支重做
  ```bash
  git push origin --delete feat/m1-monorepo-skeleton
  ```
- **已 push 且下游 M2 已基于本分支开工**:不能直接删;在本分支上新建
  修复 commit(不 rebase 历史),让 M2 `git pull` 拿到修复
- **整条链已完成,才发现 M1 有方向性问题**:由人类决定重做 M1 链还是
  接受现状,teammate 不自主决策

---

## 常见踩坑(来自前期探查)

1. **`electron-vite` dev 模式可能不支持 `--config` 标志**
   — 补救:在仓库根创建一个桩 `electron.vite.config.ts` re-export
   `packages/desktop/electron.vite.config.ts`,仅在 `--config` 失效时启用。

2. **Sentry source maps 注释**(原 electron.vite.config.ts L69)
   — 注释里写 `src/process/...`,改为 `packages/desktop/src/process/...`,
   保证 Sentry 上报的路径能在 GitHub 上定位。

3. **`bun test` vs `bunx vitest`**
   — `test:bun` 脚本用的是 bun 自带 test runner,不是 vitest。本计划阶段 3
   更新的路径只涉及此脚本对应的 `.bun.test.ts` 文件。

4. **`husky` / `.husky/_/` 自动生成**
   — `bun install` 的 postinstall 会跑 `husky`,出问题时重跑 `bun install`,
   不要手工改 `.husky/_/` 目录。

5. **`@electron/asar` 工具**
   — 步骤 12.8 用 `bunx @electron/asar list <path>`。运行前先验证工具可用:
   `bunx @electron/asar --version`。

6. **文档替换时不要误改本方案自身**
   — 设计文档、playbook、本 M1 计划里本来就引用 `src/` 描述迁移前的状态。
   步骤 11 的 grep-and-replace 必须精确到目标文件,不要批量对整个
   `docs/backend-migration/` 目录操作。
