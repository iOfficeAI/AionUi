\# AionUi-Campus Baseline



\## 1. 基线信息



\- 基线日期：2026-08-07

\- 基线标签：`baseline-20260807`

\- 基线 Commit：`f98d9f719de9c639f739470ea49f01a6b0a22687`



\## 2. Git 仓库



\### 团队仓库



\- Origin: `https://github.com/ai-campus-2026/AionUi-Campus.git`



\### AionUi 上游仓库



\- Upstream: `https://github.com/iOfficeAI/AionUi.git`



\## 3. 分支策略



\- `main`：稳定、可演示、可发布版本

\- `develop`：团队日常集成分支

\- `feat/\*`：功能开发分支

\- `fix/\*`：Bug 修复分支

\- `docs/\*`：文档修改分支

\- `test/\*`：测试与评测分支



\### 分支保护



\- \[x] `main` 已启用 GitHub Ruleset

\- \[x] `develop` 已启用 GitHub Ruleset

\- \[x] 禁止删除受保护分支

\- \[x] 禁止 Force Push

\- \[x] 修改必须通过 Pull Request

\- \[x] PR 至少需要 1 个 Approval



\## 4. 当前验证状态



\### AionUi-Campus



\- \[x] Git 仓库正常

\- \[x] 依赖环境已完成安装

\- \[x] Desktop UI 可以正常启动

\- \[ ] 真实大模型对话验证

\- \[ ] 团队五人环境全部验收



\### AionCore



### AionCore

- CLI 版本：`aioncore 0.1.61`
- Git 仓库：`https://github.com/iOfficeAI/AionCore.git`
- Git 分支：`main`
- Git Commit：`81ef258913e6ac5076a86d4adcc7edcc0f8f21ef`
- 工作区状态：Clean
- 管理方式：作为 AionUi-Campus 的上游/底层依赖使用，不建立团队 develop 分支，不向官方仓库推送比赛代码。


\## 5. 当前版本关系



`baseline-20260807`、`main` 与 `develop` 均从以下 Commit 开始：



`f98d9f719de9c639f739470ea49f01a6b0a22687`



\## 6. 后续要求



1\. 团队成员不得直接向 `main` 或 `develop` 推送比赛功能代码。

2\. 所有开发从最新 `develop` 创建独立分支。

3\. 通过 Pull Request 合并至 `develop`。

4\. 集成、测试通过后，再通过 Pull Request 合并至 `main`。

5\. API Key、个人账号、学号、隐私数据不得提交至仓库。

6\. 上游 AionUi 更新只由 1 号负责人统一处理。

> 注意：AionCore 当前锁定为上述版本。比赛开发期间如非确有必要，不随意升级 AionCore；如需升级，必须先在独立分支验证 AionUi-Campus 能正常启动和运行。