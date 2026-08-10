# 原始二开源码包（固定来源备份）

这里是为了实施时快速找到正确代码而保留的原版源码快照。两个 UI 版本已经物理分开；共同的 AionCore 配套单独存放。所有文件均从 `AionTeamSuite` 的固定提交提取，**不从当前被重写过的 worktree 复制**，也不包含 v2.1.52 重做线代码。

## 两个原版 UI 包

| 目录 | 原始项目与固定提交 | 内容 | 文件数 |
| --- | --- | --- | ---: |
| [`01-临时团队-adf8dfaa4/`](./01-临时团队-adf8dfaa4/) | AionUi `adf8dfaa432625cd1688459b2990156140be1fd7` | 临时团队运行时归属、入口和会话交互 | 10 |
| [`02-专家团-e3f154559/`](./02-专家团-e3f154559/) | AionUi `e3f154559ec4cbb68816bf35e914b49f3221b9e2` | 专家团预设 UI、i18n、bridge、类型和测试 | 31 |

## 共同后端配套

[`共享-AionCore-eb0c884e/`](./共享-AionCore-eb0c884e/) 来自 AionCore `eb0c884ecbed47f96d5a80b0ea603933fd4cf668`，包含迁移 034–037 及其测试。两个 UI 包需要同一份 Core 配套，避免复制两份造成版本漂移。

## 使用边界

- 这里的目录是**原版代码快照**，用于查找、比对和提取；不是直接覆盖新版宿主的安装目录。
- A/B/C 宿主交织文件仍须按 [01-原版二开资产清单](../01-原版二开资产清单.md) 的 anchor/patch 规则处理。
- 需要完整变更序列、恢复脚本、SHA 清单或 149 项 curated team-only 包时，使用 [`AionTeamSuite`](../../../../../AionTeamSuite/README.md)。该目录是权威完整归档；本目录是就近的人可读代码备份。
- 来源、文件数量和校验以 [`AionTeamSuite/manifests/SHA-MANIFEST.json`](../../../../../AionTeamSuite/manifests/SHA-MANIFEST.json) 为准。

## 快速定位

- 临时团队入口/会话：`01-临时团队-adf8dfaa4/packages/desktop/src/renderer/pages/conversation/`
- 专家团预设：`02-专家团-e3f154559/packages/desktop/src/renderer/pages/team/TeamPresets/`
- 专家团多语言：`02-专家团-e3f154559/packages/desktop/src/renderer/services/i18n/locales/`
- Core 迁移：`共享-AionCore-eb0c884e/crates/aionui-db/migrations/`

本地快照校验清单见 [`SHA256SUMS.txt`](./SHA256SUMS.txt)。如需确认这些快照仍与权威归档逐字一致，可对照 `AionTeamSuite/sources/` 后运行 `diff -qr`。
