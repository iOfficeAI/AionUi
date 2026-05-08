# M2 aionrs 遗留清理 - 需求文档

- **日期**:2026-05-07
- **里程碑**:M2
- **上游**:M1(`feat/m1-monorepo-skeleton` 已 merge)
- **对应设计文档节**:`2026-05-07-webui-decouple-electron-design.md` →
  背景节前提 3(aionrs 静态编译) + 改造要点 G 的"aionrs 遗留代码清理" + 里程碑清单 M2 行

## 做什么

`aionrs` 已通过 Cargo git 依赖**静态编译进 aionui-backend** 的 Rust 二进制,
运行期是 in-process 调用,**不需要独立的 aionrs CLI 二进制**。本里程碑清理
仓库中残留的 aionrs 二进制打包相关代码和配置。

具体动作:

1. 删除 `scripts/prepareAionrs.js`
2. 从 `scripts/build-with-builder.js` 中移除 `prepareAionrs()` 的 `require`
   和调用
3. 从 `packages/desktop/electron-builder.yml` 中删除 `extraResources` 里的
   `bundled-aionrs` 条目(注意:M1 已把此文件迁到 packages/desktop/)
4. 从 `.gitignore` 中删除 `resources/bundled-aionrs` 条目
5. 从 `.github/workflows/_build-reusable.yml` 中删除 `AIONRS_VERSION`
   环境变量声明
6. 手动删除本地 `resources/bundled-aionrs/` 目录(若存在,避免污染后续构建)

## 不做什么(边界)

- ❌ **不动** renderer 里的业务标签(`src/renderer/` 中 `AgentType: 'aionrs'`
  / `'aion-cli'` 等字符串用法)—— 这些是 agent 类型标识,和 aionrs 二进制
  分发完全无关
- ❌ **不动** aionui-backend 的 `Cargo.toml` 里 `aion-agent` / `aion-types` /
  `aion-protocol` / `aion-config` / `aion-mcp` 等 Cargo 依赖 —— 这才是 aionrs
  的实际来源,它们是静态编译进 backend 的来源
- ❌ **不顺手清理其他"看起来也没用"的东西**(例如 `bundled-bun`、`hub`
  等其他 extraResources)—— 本里程碑 scope 只限 aionrs
- ❌ **不改 aionrs 相关的文档**(例如 README 里对 aionrs agent 的介绍)
  —— 那是面向用户的功能说明,和二进制分发无关

## 已定决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| 是否清理 aionrs 遗留 | **是** | 打包无用产物让 dmg/exe 体积多十几 MB,且误导后续 agent |
| 是否保留 CLI 查找回退 | **否** | `binaryResolver` 里 aionrs 的 PATH 查找逻辑同步删除 |
| 是否保留配置文件中的 aionrs 字段 | **否**,全部删净 | grep 应无残留 |
| 版本控制粒度 | 一个 commit 完成所有清理 | 清理内容高度关联,不拆 |

## 验收标准

**自动化门禁**(agent 必须全部跑过):

```bash
# 1. 全仓 grep,应无 aionrs 二进制分发残留
grep -rE "bundled-aionrs|prepareAionrs|AIONRS_VERSION" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs \
  --exclude-dir=out --exclude-dir=dist --exclude-dir=resources
# 预期:无输出(docs 目录排除是因为本需求文档本身会提到这些词)

# 2. 本地 resources 目录清理
ls resources/bundled-aionrs 2>&1
# 预期:ls: resources/bundled-aionrs: No such file or directory

# 3. 打包后验证
bun run build-mac:arm64
bunx @electron/asar list dist/mac-arm64/*.app/Contents/Resources/*.asar \
  | grep -c "bundled-aionrs" || echo 0
# 预期:0
find dist/mac-arm64/*.app/Contents/Resources -name "bundled-aionrs" 2>&1
# 预期:无输出

# 4. aionrs 业务功能未回归:
#    启动 app,创建类型为 'aionrs' / 'aion-cli' 的 agent,创建对话,
#    发送 "hello" 能得到回复(in-process Rust API 调用仍能工作)
#    这一条可以手动或 e2e 验证,agent 用现有 e2e 脚本即可
```

**产出摘要对比**:

- dmg 体积相比 M1 产出应**减少 10-20MB**(aionrs 二进制大小量级)
- `asar list` 结果的行数应比 M1 产出略少

## 关键风险

| 风险 | 缓解 |
|---|---|
| `electron-builder.yml` 被 M1 挪到了 `packages/desktop/`,M2 要先读 M1 handoff 确认实际路径 | plan-writer 写具体 plan 时,先 `cat docs/backend-migration/handoffs/M1-outcome.md` 确认 electron-builder.yml 所在位置和新的 `extraResources` 结构 |
| `scripts/build-with-builder.js:18` 的 `const prepareAionrs = require('./prepareAionrs');` 和 `scripts/build-with-builder.js:460` 的 `prepareAionrs();` 需要同步删除,不能只删一处 | plan-writer 读源码确认两处位置,逐行 Edit 删除 |
| `binaryResolver` 里对 aionrs 的 PATH 查找回退(如有)需要同步评估,但它不影响 backend,可安全删除 | 先 grep 确认是否存在,如有影响 aionrs agent 类型再决定是否保留(应该不会,in-process 不走 PATH) |
| 如果 M1 已经误删了 aionrs 配置,M2 变成空改动 | M2 先验收"清理目标",若已清理干净则直接写 handoff 说明并快速通过 |

## 依赖上游

- **M1 必须已合入**:因为 `electron-builder.yml` 挪到了 `packages/desktop/`,
  `build-with-builder.js` 的路径也有 M1 的修改
- **读 M1 handoff** 确认实际交付:`docs/backend-migration/handoffs/M1-outcome.md`

## 分支与 handoff

- 上游分支:`origin/feat/m1-monorepo-skeleton`
- 本里程碑分支:`feat/m2-aionrs-cleanup`
- handoff 位置:`docs/backend-migration/handoffs/M2-outcome.md`
- 完成后 push 前:必须 `git merge origin/feat/backend-migration`(基线同步)

## 预计执行时间

1-2 小时(纯清理,改动面小,主要时间在验证打包产物)
