# Pull Request

> 提交前请阅读 [CONTRIBUTING.md](../CONTRIBUTING.md)。忽略以下规则的 PR 可能会被关闭，并要求重新提交。

## 说明

<!-- 请清晰、简洁地说明本 PR 做了什么以及为什么这样做。 -->

## 关联 Issue

<!-- 请关联相关 Issue。合并时，“Closes #123”或“Fixes #123”会自动关闭对应 Issue。 -->

- Closes #

## 变更类型

- [ ] `fix` — Bug 修复（修复问题且不引入破坏性变更）
- [ ] `feat` — 新功能（增加功能且不引入破坏性变更）
- [ ] `perf` — 性能改进
- [ ] `refactor` — 代码重构（不改变行为）
- [ ] 破坏性变更（会破坏现有功能的修复或新功能）
- [ ] `docs` — 文档更新

## 原子 PR 检查清单（规则 1）

- [ ] 本 PR **只包含一个**无法继续拆分的功能或 Bug 修复
- [ ] PR 标题遵循 Conventional Commit 格式：`<type>(<scope>): <subject>`（英文）

## 本地检查（规则 3）

<!-- 推送前请运行以下检查；如果失败，CI 将拒绝该 PR。 -->

- [ ] `bun run format` — 格式化通过
- [ ] `bun run lint` — 无 lint 错误（未修改 `.ts`/`.tsx` 时可跳过）
- [ ] `bunx tsc --noEmit` — 无类型错误（未修改 `.ts`/`.tsx` 时可跳过）
- [ ] `bunx vitest run` — 测试通过
- [ ] 已验证 i18n（`bun run i18n:types` + `node scripts/check-i18n.js`）— 仅当修改了 `src/renderer/`、`locales/` 或 `src/common/config/i18n/` 时适用，否则填 N/A
- [ ] 新增或修改的用户可见文本使用 i18n 键（没有硬编码字符串）

## 运行时验证

<!-- 实际在哪些平台运行并验证过？ -->

- [ ] 已在 macOS 上验证
- [ ] 已在 Windows 上验证
- [ ] 已在 Linux 上验证
- [ ] 已自行审查本次代码变更

## 截图

<!-- 如适用，请添加截图或录屏，帮助说明变更。 -->

## 其他背景

<!-- 请在此补充 PR 的其他背景信息。 -->

---

<!-- Commit 和 PR 标题不得包含 AI 签名（Co-Authored-By、“Generated with”等）。 -->

**感谢你为 AionUi 做出贡献！🎉**
