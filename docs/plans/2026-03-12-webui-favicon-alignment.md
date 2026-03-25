# WebUI Favicon Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 WebUI 浏览器页签稳定显示 favicon，并将实现收敛到仓库现有图标资产链路，不再依赖不稳定的 `/favicon.ico -> app.getAppPath()/resources/app.ico` 读取。

**Architecture:** 仅保留 renderer 侧的 favicon 接入，复用现有图标源资产，通过 Vite 构建链路把资源纳入 `out/renderer`。服务端不再单独兜底一个运行时读取 `app.ico` 的 `/favicon.ico` 分支，避免 packaged WebUI 下的路径不确定性。

**Tech Stack:** Electron 37、electron-vite 5、React 19、TypeScript 5.8、Vitest 4

---

### Task 1: 收敛 favicon 资源来源

**Files:**

- Modify: `src/renderer/index.html`
- Delete: `src/renderer/favicon.png`
- Reference: `resources/icon.png`

**Step 1: 确认当前资源来源与目标引用**

Run: `shasum resources/icon.png src/renderer/favicon.png`
Expected: 两个文件 hash 相同，证明当前 `favicon.png` 是重复副本

**Step 2: 修改 renderer 入口，直接复用现有图标源**

- 将 `src/renderer/index.html` 中的 favicon 引用改成通过构建链路引用 `resources/icon.png`
- 优先选择能被 Vite 稳定打包进 `out/renderer/assets/` 的写法
- 不再继续维护 `src/renderer/favicon.png`

**Step 3: 删除重复资产**

- 删除 `src/renderer/favicon.png`
- 确保最终只保留一套 favicon 源资产

**Step 4: 运行最小构建验证**

Run: `bun run package`
Expected: `out/renderer/index.html` 中存在 favicon 引用，且 `out/renderer/assets/` 下存在对应图片资源

**Step 5: 提交**

```bash
git add src/renderer/index.html resources/icon.png docs/plans/2026-03-12-webui-favicon-alignment.md
git add -u src/renderer/favicon.png
git commit -m "fix(webui): align favicon asset with shared icon resource"
```

### Task 2: 回退不稳定的 `/favicon.ico` 服务端逻辑

**Files:**

- Modify: `src/webserver/routes/staticRoutes.ts`

**Step 1: 写失败前提的测试或断言用例**

- 新增一个针对 WebUI 静态路由的测试文件，例如 `tests/unit/webuiStaticRoutes.test.ts`
- 目标不是验证浏览器是否真的显示图标，而是验证生产静态路由不会依赖 `app.getAppPath()/resources/app.ico` 这样的 packaged 不稳定路径

**Step 2: 运行单测确认当前实现不满足预期**

Run: `bunx vitest run tests/unit/webuiStaticRoutes.test.ts`
Expected: FAIL，指出当前 `/favicon.ico` 逻辑依赖错误路径或不应存在该分支

**Step 3: 做最小实现**

- 删除当前 `expressApp.get('/favicon.ico', ...)` 中读取 `app.getAppPath()/resources/app.ico` 的逻辑
- 回到简单、可预期的行为
- 如果实现时确认 Express 静态资源已能覆盖 favicon 请求，则不要额外再加第二套路由

**Step 4: 运行单测确认通过**

Run: `bunx vitest run tests/unit/webuiStaticRoutes.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add src/webserver/routes/staticRoutes.ts tests/unit/webuiStaticRoutes.test.ts
git commit -m "fix(webui): remove unstable favicon ico fallback"
```

### Task 3: 为打包产物补充回归验证

**Files:**

- Create or Modify: `tests/integration/webui-favicon-build.test.ts`
- Reference: `tests/integration/i18n-packaged.test.ts`
- Possible update: `vitest.config.ts`

**Step 1: 复用现有 packaged 测试模式设计回归测试**

- 参考 `tests/integration/i18n-packaged.test.ts`
- 检查 `out/renderer/index.html` 中是否存在 favicon 链接
- 检查该链接对应的资源是否被包含进 `app.asar` 或 renderer 构建产物中

**Step 2: 先运行新测试，确认在未完成实现前失败或跳过逻辑符合预期**

Run: `bunx vitest run tests/integration/webui-favicon-build.test.ts`
Expected: 在缺少构建产物时合理跳过，存在构建产物时能准确暴露问题

**Step 3: 调整实现或测试边界到最小必要范围**

- 避免把整个 WebUI 行为都塞进这个测试
- 只验证 favicon 构建与打包链路

**Step 4: 运行验证**

Run: `bun run package`
Run: `bunx vitest run tests/integration/webui-favicon-packaged.test.ts`
Expected: PASS

**Step 5: 提交**

```bash
git add tests/integration/webui-favicon-build.test.ts vitest.config.ts
git commit -m "test(webui): cover packaged favicon asset delivery"
```

### Task 4: 整体验证、文档与收尾

**Files:**

- Modify: `docs/plans/2026-03-12-webui-favicon-alignment.md`
- Optional: `readme.md` only if behavior documentation truly changes

**Step 1: 格式化与静态检查**

Run: `bun run lint:fix`
Expected: exit 0

**Step 2: 运行本次改动的核心验证**

Run: `bunx vitest run tests/unit/webuiStaticRoutes.test.ts tests/integration/webui-favicon-build.test.ts`
Expected: PASS

**Step 3: 运行全量测试，记录当前仓库真实状态**

Run: `bun run test`
Expected: 允许保留仓库当前已知失败项，但必须在总结中明确说明，不得把它们误报为本次改动引入

**Step 4: 更新阶段文档**

- 在本计划文档末尾补充实施结果
- 记录最终采用的 favicon 资源来源
- 记录 `/favicon.ico` 是否完全移除定制逻辑

**Step 5: 整理工作区并确认 git 状态**

Run: `git status --short`
Expected: 仅剩待提交的本次改动，或工作区干净

**Step 6: 最终提交**

```bash
git add docs/plans/2026-03-12-webui-favicon-alignment.md
git add src/renderer/index.html src/webserver/routes/staticRoutes.ts tests/unit/webuiStaticRoutes.test.ts tests/integration/webui-favicon-build.test.ts vitest.config.ts
git add -u src/renderer/favicon.png
git commit -m "fix(webui): align favicon delivery with webui asset pipeline"
```

## Notes

- 不要继续读取 `app.getAppPath()/resources/app.ico` 作为 WebUI favicon 来源。
- 优先复用已有的 `resources/icon.png`，避免维护重复资产。
- 如果实现过程中发现 `resources/icon.png` 不能被 renderer 构建稳定引用，再退一步考虑将 favicon 显式迁入 `public/`，但那应作为第二选择，而不是默认方案。

## Implementation Result

- 最终 favicon 资源来源采用 `resources/icon.png`
- `src/renderer/index.html` 已改为直接引用共享图标源，构建后会落到 `out/renderer/assets/icon-*.png`
- 重复资产 `src/renderer/favicon.png` 已删除
- `src/webserver/routes/staticRoutes.ts` 中自定义 `/favicon.ico` 路由已移除，不再依赖 `app.getAppPath()/resources/app.ico`
- 新增回归测试：
  - `tests/unit/webuiStaticRoutes.test.ts`
  - `tests/integration/webui-favicon-build.test.ts`

## Verification Evidence

- `bun run package`
  - 通过，`out/renderer/index.html` 引用 `./assets/icon-*.png`
- `bun run lint:fix`
  - 通过，但仓库仍存在大量既有 ESLint warning，无新增 error
- `bunx vitest run tests/unit/webuiStaticRoutes.test.ts tests/integration/webui-favicon-build.test.ts`
  - 通过，`2 passed`
- `bun run test`
  - 通过，`33 passed | 2 skipped (35 files)`，无失败项
