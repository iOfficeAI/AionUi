\# AionUi-Campus Git 团队协作与版本管理规范



\*\*项目：\*\* 2026 年第二届重庆市 AI 大模型创新应用大赛 · “创意 AI 校园”  

\*\*团队仓库：\*\* `ai-campus-2026/AionUi-Campus`  

\*\*文档名称：\*\* Git 团队协作与版本管理规范  

\*\*适用成员：\*\* 1～5号全体成员  

\*\*维护负责人：\*\* 1号负责人 / 队长  

\*\*当前版本：\*\* V1.0  

\*\*建立日期：\*\* 2026-08-10  



\---



\# 1. 文档目的



本文件用于统一 AionUi-Campus 团队在比赛开发期间的 Git 与 GitHub 使用方式。



本项目共 5 名成员，将同时进行：



\- Desktop UI 开发

\- Agent / Assistant / Skills 开发

\- RAG / MCP / 数据开发

\- 阿里云模型接入

\- 测试与评测

\- 集成与版本管理

\- 比赛材料整理



如果没有统一 Git 规范，容易出现：



\- 两个人同时修改同一个文件并互相覆盖；

\- 成员直接修改 `main`；

\- 成员直接修改 `develop`；

\- 不知道应该从哪个分支开始开发；

\- Pull Request 发错目标分支；

\- 错误合并到官方 AionUi 仓库；

\- API Key 被提交到 Git；

\- 多个成员各自维护不同版本；

\- 合并以后本地代码没有更新；

\- 删除 Squash 分支时误以为 Git 报错；

\- 上游 AionUi 更新导致比赛项目突然无法运行；

\- 比赛最终版本无法准确定位。



因此，所有成员正式参与代码开发前，都必须理解并遵守本文档。



\---



\# 2. 仓库关系



当前项目涉及两个主要 Git 仓库。



\---



\## 2.1 团队比赛仓库



团队仓库：



```text

https://github.com/ai-campus-2026/AionUi-Campus.git

```



本地名称：



```text

origin

```



这是团队比赛开发的唯一主仓库。



团队成员开发的：



\- UI

\- Agent

\- RAG

\- MCP

\- 阿里云接入

\- 测试

\- 文档

\- 集成代码



最终都应该进入：



```text

ai-campus-2026/AionUi-Campus

```



\---



\## 2.2 AionUi 官方上游仓库



官方仓库：



```text

https://github.com/iOfficeAI/AionUi.git

```



本地名称：



```text

upstream

```



该仓库只作为：



\- AionUi 官方更新来源；

\- 上游源码参考；

\- Bug 修复参考；

\- 新功能参考。



普通成员不要自行把 `upstream/main` 合入团队 `develop` 或 `main`。



上游同步统一由：



```text

1号负责人 / 队长

```



处理。



\---



\## 2.3 AionCore



AionCore 当前使用官方仓库：



```text

https://github.com/iOfficeAI/AionCore.git

```



当前团队锁定：



```text

AionCore Version:

0.1.61



Commit:

81ef258913e6ac5076a86d4adcc7edcc0f8f21ef

```



当前阶段：



\- AionCore 作为底层依赖使用；

\- 不建立团队比赛开发分支；

\- 不向官方 AionCore 仓库推送比赛代码；

\- 不随意升级；

\- 如确实需要修改，必须先由 1号负责人重新确认方案。



\---



\# 3. 当前项目基线



团队已经建立：



```text

baseline-20260807

```



对应 Commit：



```text

f98d9f719de9c639f739470ea49f01a6b0a22687

```



该 Tag 表示：



> 团队已经验证过的原始稳定开发起点。



详细信息见：



```text

BASELINE.md

```



注意：



```text

baseline-20260807

```



是历史坐标。



它不会因为：



```text

develop

main

```



继续开发而移动。



\---



\# 4. 当前分支体系



团队采用：



```text

main

develop

任务分支

```



三级结构。



整体关系：



```text

baseline-20260807

&#x20;       │

&#x20;       ├──────── main

&#x20;       │

&#x20;       └──────── develop

&#x20;                    │

&#x20;                    ├── feat/\*

&#x20;                    ├── fix/\*

&#x20;                    ├── docs/\*

&#x20;                    ├── test/\*

&#x20;                    └── ci/\*

```



\---



\# 5. main 分支



`main` 是稳定分支。



主要用于：



\- 阶段稳定版本；

\- 演示版本；

\- 比赛候选版本；

\- Release；

\- 最终提交版本。



原则：



```text

main = 随时应该可以拿出来演示

```



普通成员不得：



```powershell

git switch main

```



以后直接开始写业务功能。



更不得直接：



```powershell

git push origin main

```



所有进入 `main` 的修改必须通过：



```text

develop

&#x20;  ↓

Pull Request

&#x20;  ↓

Review

&#x20;  ↓

main

```



\---



\# 6. develop 分支



`develop` 是团队日常集成分支。



UI、Agent、RAG、测试等模块的开发成果：



```text

先进入 develop

```



经过阶段测试以后：



```text

再进入 main

```



原则：



```text

develop = 当前最新的团队集成版本

```



普通成员不能直接在 `develop` 上开发功能。



错误方式：



```powershell

git switch develop



\# 直接修改代码



git add .

git commit -m "..."

git push

```



这种流程禁止使用。



正确方式：



```text

develop

&#x20;  ↓

创建任务分支

&#x20;  ↓

开发

&#x20;  ↓

Push

&#x20;  ↓

Pull Request

&#x20;  ↓

Review

&#x20;  ↓

Squash and merge

&#x20;  ↓

develop

```



\---



\# 7. 当前分支保护规则



团队目前已经对：



```text

main

develop

```



建立 GitHub Ruleset。



当前核心规则包括：



\- 禁止删除受保护分支；

\- 禁止 Force Push；

\- 修改必须通过 Pull Request；

\- Pull Request 至少需要 1 个有效 Approval；

\- 新提交可能使之前的 Approval 失效；

\- Review conversation 未解决时不能合并；

\- `main` 和 `develop` 均不能由普通成员直接绕过规则。



\---



\# 8. 仓库权限



普通成员统一使用：



```text

Write

```



1号负责人 / 队长使用：



```text

Admin

```



普通成员不需要 Admin。



原因：



`Write` 已经能够满足：



\- Push 自己的任务分支；

\- 创建 PR；

\- Review；

\- Approve；

\- 参与正常团队开发。



\---



\# 9. 为什么 Reviewer 必须至少有 Write



当前 Ruleset 要求：



```text

至少 1 个有效 Approval

```



如果某成员只有：



```text

Read

```



即使他点击：



```text

Approve

```



GitHub 也可能显示：



```text

Approved with read-only permissions

```



这种审核不会满足 Required Review。



因此：



```text

参与代码审核的正式团队成员

```



应具备：



```text

Write

```



权限。



\---



\# 10. 任务分支类型



团队使用以下任务分支。



\---



\## 10.1 功能开发



```text

feat/\*

```



例如：



```text

feat/ui-campus

feat/agent-workflow

feat/campus-mcp-rag

feat/model-config

feat/integration

```



\---



\## 10.2 Bug 修复



```text

fix/\*

```



例如：



```text

fix/model-auth

fix/rag-empty-result

fix/ui-navigation

fix/mcp-connection

```



\---



\## 10.3 文档



```text

docs/\*

```



例如：



```text

docs/baseline

docs/runbook

docs/run-log

docs/git-workflow

```



\---



\## 10.4 测试



```text

test/\*

```



例如：



```text

test/evaluation

test/rag-retrieval

test/agent-tools

```



\---



\## 10.5 CI / DevOps



```text

ci/\*

```



例如：



```text

ci/competition-quality

ci/test-workflow

```



\---



\# 11. 当前五人推荐开发方向



\## 1号负责人



职责：



```text

产品

架构

集成

Git

```



推荐：



```text

feat/integration

```



\---



\## 2号负责人



职责：



```text

Desktop UI

交互

```



推荐：



```text

feat/ui-campus

```



\---



\## 3号负责人



职责：



```text

Agent

Assistant

Skills

```



推荐：



```text

feat/agent-workflow

```



\---



\## 4号负责人



职责：



```text

RAG

MCP

数据

阿里云

```



推荐：



```text

feat/campus-mcp-rag

```



\---



\## 5号负责人



职责：



```text

测试

评测

DevOps

材料

```



推荐：



```text

test/evaluation

```



\---



\# 12. 不建议一个分支长期使用整个比赛周期



虽然每个人都有自己的主要方向，但不要把：



```text

feat/ui-campus

```



从比赛第一天一直用到最后一天。



更推荐：



```text

feat/ui-shell



feat/ui-chat-panel



feat/ui-evidence-view

```



这种较小任务分支。



优点：



\- PR 更容易 Review；

\- 冲突更少；

\- 出问题容易回滚；

\- develop 历史更加清楚。



\---



\# 13. 第一次参与团队开发



新成员 Clone：



```powershell

git clone https://github.com/ai-campus-2026/AionUi-Campus.git

```



进入项目：



```powershell

cd AionUi-Campus

```



获取远端：



```powershell

git fetch origin

```



切换：



```powershell

git switch develop

```



同步：



```powershell

git pull

```



检查：



```powershell

git status

```



正常：



```text

On branch develop

Your branch is up to date with 'origin/develop'.



nothing to commit, working tree clean

```



\---



\# 14. 每次开始新任务



统一执行：



```powershell

git switch develop

git pull

git status

```



确认：



```text

working tree clean

```



以后创建任务分支。



例如：



```powershell

git switch -c feat/agent-workflow

```



确认：



```powershell

git branch --show-current

```



应该显示：



```text

feat/agent-workflow

```



这时候再开始写代码。



\---



\# 15. 为什么创建任务前必须先 pull



假设：



成员 A 昨天把：



```text

Agent基础功能

```



合进 develop。



成员 B 今天还停留在两天前的 develop。



如果 B 直接创建：



```text

feat/rag

```



那么他的分支基于旧代码。



之后合并时容易出现：



\- 冲突；

\- 覆盖别人代码；

\- 缺少依赖；

\- 接口不一致。



所以创建新任务前统一：



```powershell

git switch develop

git pull

```



\---



\# 16. 开发过程中查看状态



最常用命令：



```powershell

git status

```



建议经常执行。



可以看到：



\- 当前分支；

\- 修改文件；

\- 新文件；

\- 已暂存文件；

\- 未暂存文件。



\---



\# 17. 查看具体修改



提交前：



```powershell

git diff

```



查看尚未 Stage 的修改。



查看已经 Stage：



```powershell

git diff --staged

```



成员应知道自己到底准备提交什么。



\---



\# 18. git add 规则



推荐：



```powershell

git add <具体文件>

```



例如：



```powershell

git add packages/desktop/src/xxx.ts

```



或者：



```powershell

git add RUN\_LOG.md

```



不要形成无脑习惯：



```powershell

git add .

```



原因：



可能意外加入：



\- 临时日志；

\- API Key；

\- `.env`；

\- 测试文件；

\- 无关修改；

\- IDE 配置。



\---



\# 19. Commit Message 规范



推荐：



```text

类型(模块): 描述

```



\---



\## 19.1 feat



新功能：



```text

feat(ui): add evidence panel



feat(agent): add assistant workflow



feat(rag): add document retrieval

```



\---



\## 19.2 fix



修复：



```text

fix(ui): handle empty message



fix(mcp): handle connection timeout



fix(rag): avoid duplicate results

```



\---



\## 19.3 docs



文档：



```text

docs(runbook): update Electron troubleshooting



docs(git): add branch workflow

```



\---



\## 19.4 test



测试：



```text

test(eval): add retrieval evaluation cases

```



\---



\## 19.5 refactor



重构：



```text

refactor(agent): split tool dispatcher

```



\---



\## 19.6 ci



CI：



```text

ci(test): add pull request checks

```



\---



\## 19.7 chore



工程维护：



```text

chore(deps): update development config

```



\---



\# 20. 禁止使用的 Commit Message



不推荐：



```text

111



123



test



修改



改一下



最终版



final2



最终版真的



临时修改

```



原因：



以后无法知道该 Commit 做了什么。



\---



\# 21. Commit 尽量保持单一目的



例如：



不要一个 Commit 同时：



```text

修改 UI

修改 RAG

改 README

升级依赖

修 Agent Bug

```



更推荐拆成多个明确任务。



\---



\# 22. 标准提交步骤



先：



```powershell

git status

```



然后：



```powershell

git add <文件>

```



再次：



```powershell

git status

```



确认：



```text

Changes to be committed

```



再：



```powershell

git commit -m "feat(agent): add assistant workflow"

```



\---



\# 23. Push



第一次 Push 新分支：



```powershell

git push -u origin <分支>

```



例如：



```powershell

git push -u origin feat/agent-workflow

```



之后：



```powershell

git push

```



即可。



\---



\# 24. 禁止直接 Push main / develop



不要执行：



```powershell

git push origin main

```



不要执行：



```powershell

git push origin develop

```



正常情况下 Ruleset 也会阻止。



\---



\# 25. 创建 Pull Request



Push 后打开 GitHub：



```text

Pull requests

→ New pull request

```



普通任务必须选择：



```text

base: develop

compare: 任务分支

```



例如：



```text

base: develop

compare: feat/agent-workflow

```



\---



\# 26. 最容易犯的 PR 错误



不要：



```text

base: main

```



除非这是正式：



```text

develop → main

```



阶段发布。



同时一定确认仓库是：



```text

ai-campus-2026/AionUi-Campus

```



不要误发到：



```text

iOfficeAI/AionUi

```



\---



\# 27. PR 标题规范



推荐与主要 Commit 类似：



```text

feat(agent): add assistant workflow

```



或者：



```text

docs: add git workflow guide

```



\---



\# 28. PR 描述模板



普通功能 PR：



```markdown

\## Changes



\- 本次修改内容1

\- 本次修改内容2

\- 本次修改内容3



\## Reason



说明为什么需要这个修改。



\## Verification



\- \[ ] 已完成本地启动

\- \[ ] 已运行相关测试

\- \[ ] 已检查错误日志

\- \[ ] 未提交 API Key

\- \[ ] 未修改无关模块



\## Risk



说明可能影响的模块。



\## Notes



其他成员需要知道的信息。

```



\---



\# 29. PR Reviewer



PR 建立后：



把 PR 地址发给另一名有：



```text

Write

```



权限的成员。



例如：



```text

https://github.com/ai-campus-2026/AionUi-Campus/pull/XX

```



Reviewer 操作：



```text

Files changed

→ 检查代码

→ Review changes

→ Approve

→ Submit review

```



\---



\# 30. Reviewer 应该检查什么



至少检查：



\- 是否修改了正确模块；

\- 是否出现明显错误；

\- 是否误删代码；

\- 是否提交 API Key；

\- 是否提交 `.env`；

\- 是否提交隐私数据；

\- 是否修改无关内容；

\- PR 描述是否说明验证方式；

\- 是否可能影响其他负责人模块。



\---



\# 31. Approve 以后谁 Merge



普通团队流程：



```text

Reviewer

负责审核



PR作者 / 负责人

负责后续合并

```



成员不需要看到 PR 就随意点 Merge。



\---



\# 32. 任务分支 → develop 的合并方式



统一：



```text

Squash and merge

```



例如：



```text

feat/agent-workflow

&#x20;       ↓

&#x20;  develop

```



使用：



```text

Squash and merge

```



\---



\# 33. 为什么任务分支使用 Squash



例如成员开发过程中可能产生：



```text

commit 1

commit 2

commit 3

fix

fix again

final

```



如果全部直接 Merge：



develop 历史会很乱。



Squash 后：



```text

feat(agent): add assistant workflow

```



只保留一个任务级 Commit。



\---



\# 34. develop → main 的合并方式



阶段性稳定版本：



```text

develop

&#x20;  ↓

main

```



使用：



```text

Merge

```



而不是 Squash。



原因：



保留：



```text

develop

main

```



之间完整的阶段开发关系。



便于：



\- Release；

\- Tag；

\- 回滚；

\- 比赛版本证明；

\- 历史追踪。



\---



\# 35. PR 合并以后本地怎么处理



合并结束以后：



```powershell

git switch develop

git pull

git status

```



确认：



```text

nothing to commit, working tree clean

```



\---



\# 36. 删除旧任务分支



本地：



```powershell

git branch -d feat/your-task

```



例如：



```powershell

git branch -d docs/run-log

```



远端：



GitHub PR 页面：



```text

Delete branch

```



或者：



```powershell

git push origin --delete feat/your-task

```



\---



\# 37. Squash 后删除分支为什么会出现 warning



可能看到：



```text

warning: deleting branch ... that has been merged to

refs/remotes/origin/...

but not yet merged to HEAD

```



这是正常现象。



因为：



```text

Squash and merge

```



会创建新的 Commit。



例如原任务：



```text

A

```



Squash 后进入 develop：



```text

B

```



内容一样，但 Commit ID 不一样。



所以 Git 从 Commit 图上认为：



```text

A 并没有直接进入 HEAD

```



只要已经确认：



\- GitHub PR 显示 Merged；

\- `develop` 已 `git pull`；

\- 修改文件已经存在；



即可删除旧任务分支。



\---



\# 38. 删除前必须确认



不要看到 warning 就直接乱用：



```powershell

git branch -D

```



必须先：



```powershell

git switch develop

git pull

git status

```



然后确认代码已进入 develop。



\---



\# 39. 每天开发前推荐操作



每天开始：



```powershell

git switch develop

git pull

```



如果开始一个新任务：



```powershell

git switch -c feat/new-task

```



\---



\# 40. 已经在任务分支开发时如何获取 develop 新变化



假设你在：



```text

feat/ui-campus

```



期间 develop 已经发生变化。



先：



```powershell

git status

```



确保当前工作已 Commit。



然后：



```powershell

git fetch origin

```



推荐团队初期采用：



```powershell

git merge origin/develop

```



把最新 develop 合入自己的任务分支。



如果出现 Conflict：



不要随意解决。



按本文后面的冲突规范处理。



\---



\# 41. 当前团队不要求成员使用复杂 Rebase



比赛开发初期，为降低误操作风险：



普通成员不强制使用：



```powershell

git rebase

```



也不要求：



```powershell

git rebase -i

```



先使用：



```text

任务分支

\+

Pull Request

\+

Squash

```



已经足够保持历史清晰。



\---



\# 42. 未提交修改时不要随意切分支



如果：



```powershell

git status

```



显示：



```text

modified:

```



说明存在未完成修改。



这时候不要无脑：



```powershell

git switch develop

```



先决定：



\- 是否应该 Commit；

\- 是否应该继续完成；

\- 是否属于当前任务。



\---



\# 43. Git Stash



只有理解用途时使用：



```powershell

git stash

```



恢复：



```powershell

git stash pop

```



普通成员不要把 Stash 当作长期保存代码的方法。



Stash 只是临时保存。



正式成果必须 Commit。



\---



\# 44. Merge Conflict 是什么



如果两个人修改了同一文件相近位置：



Git 可能无法自动判断该保留谁。



这时会出现：



```text

CONFLICT

```



文件内部可能出现：



```text

<<<<<<< HEAD



自己的代码



=======



另一边代码



>>>>>>> ...

```



\---



\# 45. 冲突处理原则



出现冲突时：



不要：



```text

直接删除整个文件

整份覆盖

Force Push

乱点 Accept All

```



首先确认：



```text

自己的修改是什么

develop 新修改是什么

```



\---



\# 46. 跨模块冲突



如果冲突涉及：



```text

UI + Agent

Agent + RAG

RAG + 数据

```



不要一个人擅自决定。



由：



```text

相关模块负责人

\+

1号集成负责人

```



共同确认。



\---



\# 47. 解决冲突后的流程



修改冲突文件以后：



```powershell

git status

```



确认。



然后：



```powershell

git add <冲突文件>

```



再：



```powershell

git commit

```



之后必须重新：



```text

启动程序

运行相关测试

```



确认功能没有被冲突处理破坏。



\---



\# 48. 禁止 Force Push



普通开发中禁止：



```powershell

git push --force

```



以及：



```powershell

git push -f

```



特别是：



```text

main

develop

```



绝对禁止。



GitHub Ruleset 当前也已限制 Force Push。



\---



\# 49. 禁止删除长期分支



不得删除：



```text

main

develop

```



可删除：



```text

feat/\*

fix/\*

docs/\*

test/\*

ci/\*

```



前提：



对应 PR 已合并。



\---



\# 50. API Key 安全



严禁提交：



```text

API Key

AccessKey

Secret

密码

真实账号

Token

```



例如以后阿里云 DashScope Key：



不能直接写进：



```text

.ts

.js

.json

.md

```



然后提交。



\---



\# 51. .env



真实 `.env`：



原则上不进入 Git。



应该提交：



```text

.env.example

```



例如：



```text

DASHSCOPE\_API\_KEY=your\_key\_here

```



不能：



```text

DASHSCOPE\_API\_KEY=sk-真实密钥

```



\---



\# 52. 提交前敏感信息检查



每次：



```powershell

git status

```



确认没有：



```text

.env

\*.log

账号文件

密钥文件

本地数据库

隐私资料

```



\---



\# 53. 如果 API Key 已经误提交



立即：



1\. 停止继续 Push；

2\. 通知 1号负责人；

3\. 立即废弃 / 轮换该 Key；

4\. 处理 Git 历史；

5\. 不要认为“删掉当前文件”就安全了。



因为 Key 可能已经存在历史 Commit。



\---



\# 54. upstream 更新规则



官方 AionUi：



```text

upstream

```



不由普通成员直接同步。



原因：



AionUi 更新可能修改：



\- Electron；

\- Agent；

\- MCP；

\- UI；

\- 数据结构；

\- 构建系统；

\- 依赖版本。



直接同步可能让比赛项目突然无法运行。



\---



\# 55. upstream 更新原则



团队原则：



```text

稳定 > 最新

```



如果当前版本可以完成比赛：



不需要为了追官方最新版频繁同步。



\---



\# 56. upstream 同步负责人



仅：



```text

1号负责人

```



统一操作。



必要时：



```powershell

git fetch upstream

```



然后建立：



```text

chore/upstream-sync-日期

```



或类似临时分支。



先测试。



不要直接：



```text

upstream/main

→ develop

```



\---



\# 57. upstream 同步测试



至少验证：



\- AionUi 能启动；

\- AionCore 能连接；

\- Agent 能运行；

\- RAG 能运行；

\- MCP 能运行；

\- 阿里云模型正常；

\- UI 没有明显回归；

\- 测试能够运行。



确认没有严重问题后：



```text

临时同步分支

↓

PR

↓

develop

```



\---



\# 58. AionCore 更新规则



当前：



```text

aioncore 0.1.61

```



未经队长确认：



不要：



\- Pull 最新 AionCore 后直接重装；

\- 自行修改底层；

\- 自行更换版本；

\- 将比赛代码 Push 到官方 AionCore。



\---



\# 59. GitHub Ruleset 不得随意修改



目前：



```text

main

develop

```



都已经配置分支保护。



普通成员不要为了“方便合并”：



\- 关闭 Required Review；

\- 关闭 Force Push 保护；

\- 删除 Ruleset；

\- 临时把 develop 解除保护。



遇到流程阻塞先找：



```text

1号负责人

```



\---



\# 60. 为什么不能为了快绕过 Review



比赛项目后期多人并行时：



一个错误 Merge 可能同时影响：



```text

UI

Agent

RAG

Demo

答辩

```



所以：



```text

1个 Approval

```



不是形式主义，而是最低质量检查。



\---



\# 61. 测试与 PR



当前项目已经提供：



```powershell

bun run lint

bun run format:check

bun run test

bun run test:coverage

bun run test:e2e

```



普通 PR 至少根据改动范围运行相关检查。



例如简单 Agent 修改：



```powershell

bun run lint

bun run test

```



\---



\# 62. 未来 CI



5号负责人后续会逐步建立：



```text

PR

↓

CI

↓

lint

test

build

```



等 CI 稳定以后：



再考虑把：



```text

Required status checks

```



加入 Ruleset。



当前没有稳定 CI 前：



不要提前启用一个永远无法通过的 Required Check。



\---



\# 63. 文档 PR



文档修改也必须：



```text

docs/\*

↓

PR

↓

develop

```



例如：



```text

docs/runbook

docs/run-log

docs/git-workflow

```



这也是团队已经实际使用过的流程。



\---



\# 64. 小修改也不要直接 Push develop



例如只改一个错别字：



仍然建议：



```text

docs/fix-typo

↓

PR

↓

develop

```



这样所有修改都有来源。



\---



\# 65. Tag 规则



当前已有：



```text

baseline-20260807

```



后续 Tag 由 1号负责人统一创建。



普通成员不要自行创建正式版本 Tag。



\---



\# 66. 后续版本示例



可能使用：



```text

v0.1.0

v0.2.0

v0.3.0



rc1

rc2



final

```



最终命名由团队在比赛提交阶段统一确定。



\---



\# 67. Release 流程



阶段完成：



```text

功能分支

↓

develop

↓

完整测试

↓

develop → main PR

↓

Review

↓

Merge

↓

Tag

↓

Release

```



\---



\# 68. 比赛最终冻结阶段



比赛提交前进入：



```text

Freeze

```



冻结以后：



禁止：



\- 随意加大型新功能；

\- 随意升级 AionUi；

\- 随意升级 AionCore；

\- 随意升级模型 SDK；

\- 随意重构核心架构。



只允许：



\- 高优先级 Bug 修复；

\- 测试；

\- 文档；

\- 必要的体验调整。



\---



\# 69. Freeze 阶段所有修改仍需 PR



即使比赛截止只剩一天：



也不能：



```text

直接 push main

```



仍然：



```text

fix/\*

↓

develop

↓

测试

↓

main

```



\---



\# 70. 回滚原则



如果某 PR 合入 develop 后出现严重问题：



不要立刻：



```powershell

git reset --hard

```



也不要 Force Push。



优先：



```text

确定问题 PR

↓

使用 GitHub Revert

↓

创建 Revert PR

↓

Review

↓

合并

```



这样历史仍然可追踪。



\---



\# 71. git reset --hard 风险



普通成员不要随意：



```powershell

git reset --hard

```



它可能直接删除未提交的本地修改。



如果确实需要使用：



先确认：



```powershell

git status

```



并确保重要修改已经保存。



\---



\# 72. git clean 风险



禁止在不了解作用时运行：



```powershell

git clean -fd

```



它可能删除未跟踪文件。



例如刚写好的：



```text

RUNBOOK.md

```



如果尚未 Git add，理论上可能被清除。



\---



\# 73. git checkout / switch



团队推荐使用较清晰的新命令：



```powershell

git switch

```



例如：



```powershell

git switch develop

```



创建：



```powershell

git switch -c feat/task

```



\---



\# 74. git fetch 和 git pull 区别



```powershell

git fetch

```



只获取远程信息：



不会直接修改当前工作文件。



```powershell

git pull

```



相当于：



```text

获取远程

\+

更新当前分支

```



普通日常同步：



```powershell

git switch develop

git pull

```



即可。



\---



\# 75. origin 和 upstream 不要混淆



团队成员最重要的是记住：



```text

origin

=

我们自己的比赛仓库

```



```text

upstream

=

AionUi 官方仓库

```



比赛代码 Push：



```powershell

git push origin ...

```



不要：



```powershell

git push upstream ...

```



\---



\# 76. 检查 Remote



如果不确定：



```powershell

git remote -v

```



正确应类似：



```text

origin

https://github.com/ai-campus-2026/AionUi-Campus.git



upstream

https://github.com/iOfficeAI/AionUi.git

```



\---



\# 77. 出现 Push 被拒绝



如果：



```text

rejected

protected branch

```



先确认自己是不是直接 Push：



```text

main

develop

```



如果是：



正确做法不是绕过规则。



而是：



```text

创建任务分支

↓

push

↓

PR

```



\---



\# 78. Pull 出现冲突



如果：



```text

CONFLICT

```



不要继续乱执行。



保存：



```text

完整终端输出

```



然后找：



```text

对应模块负责人

或

1号负责人

```



一起处理。



\---



\# 79. PR 无法 Merge



优先检查：



1\. 有没有有效 Approval；

2\. Reviewer 是否 Write；

3\. 有没有未解决 Conversation；

4\. 有没有新 Commit 导致旧 Approval 失效；

5\. 有没有 Merge Conflict；

6\. base 是否正确；

7\. compare 是否正确。



\---



\# 80. PR Review 后又 Push 新 Commit



如果 Review 后成员又：



```powershell

git push

```



新增 Commit，



GitHub 可能要求重新 Review。



这是正常保护行为。



不要为了避免重新审核而关闭保护规则。



\---



\# 81. 当前推荐日常流程



每天：



```powershell

cd "D:\\你的工作目录\\AionUi-Campus"



git switch develop

git pull

```



开始任务：



```powershell

git switch -c feat/your-task

```



开发：



```powershell

git status

```



提交：



```powershell

git add <文件>



git commit -m "feat(module): description"

```



Push：



```powershell

git push -u origin feat/your-task

```



GitHub：



```text

Pull Request

↓

base develop

↓

Review

↓

Approve

↓

Squash and merge

```



结束：



```powershell

git switch develop

git pull



git branch -d feat/your-task

```



\---



\# 82. 五人并行开发示例



例如当前：



```text

2号：

feat/ui-chat-panel



3号：

feat/agent-workflow



4号：

feat/rag-retrieval



5号：

test/evaluation

```



四个人可以同时开发。



各自：



```text

自己的分支

```



互不覆盖。



完成后逐个：



```text

PR → develop

```



最后：



```text

develop

```



形成完整集成版本。



\---



\# 83. 跨模块接口修改



如果 3号 Agent 需要 4号 RAG 提供接口：



不要直接跑到 4号目录里大改。



先沟通：



```text

输入是什么

输出是什么

错误是什么

谁负责哪边

```



确认以后再分别开发。



\---



\# 84. 公共文件修改



以下文件属于高冲突区域：



```text

package.json

bun.lock

配置文件

公共类型

共享 IPC

路由

核心入口

```



修改前建议通知：



```text

1号负责人

```



避免两个人同时改。



\---



\# 85. 依赖升级



普通成员不要随意：



```powershell

bun update

```



也不要随便重写：



```text

bun.lock

```



需要新增依赖时：



先说明：



```text

为什么需要

是否已有同类依赖

影响多大

```



再决定。



\---



\# 86. package.json 修改



如果必须增加依赖或 Script：



PR 描述中必须明确写：



```text

新增了什么

为什么新增

是否影响安装

是否需要重新 bun install

```



\---



\# 87. 大文件



不要把：



\- 模型权重；

\- 视频；

\- 超大数据集；

\- 安装包；

\- 数据库备份；



直接塞入普通 Git 仓库。



需要时另行决定：



```text

Git LFS

对象存储

阿里云 OSS

```



等方案。



\---



\# 88. 个人 IDE 文件



尽量不要提交：



```text

.vscode 中个人配置

.idea

临时缓存

个人路径配置

```



除非确定是全团队统一需要。



\---



\# 89. 日志文件



运行时生成的：



```text

\*.log

```



原则上不提交。



出现 Bug 时：



可以把关键日志：



```text

脱敏后复制到 Issue / PR

```



而不是把几百 MB 日志加入 Git。



\---



\# 90. 成员离开某任务时



不要留下：



```text

只有自己本地有代码

```



阶段性成果至少：



```text

Commit

Push 到个人任务分支

```



这样团队不会因为个人电脑出问题丢失工作。



\---



\# 91. Commit 不等于完成



```text

Commit

```



只表示本地保存。



```text

Push

```



才表示远端有备份。



```text

PR Merged

```



才表示正式进入团队集成版本。



\---



\# 92. 三个状态要区分



```text

本地 Commit

≠

远端 Push

≠

develop 已合并

```



成员报告工作进度时应说明：



```text

已 Commit

已 Push

PR 待 Review

已 Merge

```



不要笼统说：



```text

“我已经做完了”

```



\---



\# 93. Git 状态报告模板



遇到 Git 问题时发：



```text

【Git 问题】



成员：

当前目录：

当前分支：



git status：

<结果>



git branch --show-current：

<结果>



git remote -v：

<结果>



执行的命令：



完整报错：



当前任务：



是否有未提交修改：

是 / 否

```



\---



\# 94. 不要只发截图的一小角



Git 报错时尽量：



\- 包含执行命令；

\- 包含完整错误；

\- 包含当前路径；

\- 包含当前分支。



这样其他成员才能判断。



\---



\# 95. 项目文档关系



当前基础工程文档：



```text

BASELINE.md

```



回答：



```text

我们从哪个可靠版本开始？

```



\---



```text

RUNBOOK.md

```



回答：



```text

项目怎么安装、启动和排错？

```



\---



```text

RUN\_LOG.md

```



回答：



```text

团队当前实际验证到哪里？

```



\---



```text

GIT\_WORKFLOW.md

```



回答：



```text

五个人怎么协同开发？

```



\---



\# 96. 一页式 Git 快速操作



\## 开始任务



```powershell

git switch develop

git pull

git status



git switch -c feat/your-task

```



\## 开发



```powershell

git status

git diff

```



\## 提交



```powershell

git add <文件>



git status



git commit -m "feat(module): description"

```



\## 推送



```powershell

git push -u origin feat/your-task

```



\## GitHub



```text

New Pull Request



base:

develop



compare:

feat/your-task

```



\## Review



```text

Files changed

↓

Review changes

↓

Approve

↓

Submit review

```



\## 合并



```text

任务分支 → develop



Squash and merge

```



\## 合并以后



```powershell

git switch develop

git pull

git status



git branch -d feat/your-task

```



\---



\# 97. 一页式禁止事项



禁止：



```text

直接 Push main



直接 Push develop



Force Push main/develop



随意删除 main/develop



提交 API Key



提交真实 .env



提交密码



提交个人隐私数据



提交未脱敏日志



随意升级 AionUi



随意升级 AionCore



普通成员自行同步 upstream



不检查 git status 就 git add .



不知道原因就 git reset --hard



不知道原因就 git clean -fd



出现冲突直接覆盖别人代码



未经沟通大改其他成员模块

```



\---



\# 98. 当前团队 Merge 规则



统一记住：



```text

feat/\*

fix/\*

docs/\*

test/\*

ci/\*

&#x20;     ↓

&#x20;  develop



使用：

Squash and merge

```



而：



```text

develop

&#x20;  ↓

main



使用：

Merge

```



\---



\# 99. 当前团队权限规则



```text

1号负责人：

Admin



2号：

Write



3号：

Write



4号：

Write



5号：

Write

```



Review 要计入 Required Approval：



Reviewer 必须具备：



```text

Write

```



或更高权限。



\---



\# 100. 当前最终原则



所有成员必须记住以下 10 条：



1\. 所有任务都从最新 `develop` 开始；

2\. 不直接在 `main` 开发；

3\. 不直接在 `develop` 开发；

4\. 每个任务使用自己的任务分支；

5\. 修改完成后通过 Pull Request；

6\. PR 至少需要 1 个有效 Approval；

7\. 任务分支进入 develop 使用 Squash；

8\. develop 进入 main 使用 Merge；

9\. API Key 和敏感数据绝不能进入 Git；

10\. 遇到冲突、上游同步、版本变更等高风险操作先找 1号负责人。



\---



\# 101. 文档维护



以下情况发生后，需要更新本文件：



\- GitHub Ruleset 改变；

\- 团队权限改变；

\- 分支模型改变；

\- CI 成为 Required Check；

\- Merge 策略改变；

\- Release 流程改变；

\- upstream 同步策略改变；

\- 比赛进入最终冻结阶段。



如果本文档与 GitHub 当前强制 Ruleset 存在冲突：



```text

GitHub Ruleset

```



具有实际强制效力。



同时应尽快更新本文件。



\---



\# 102. 当前开发阶段



当前基础工程阶段完成后：



```text

BASELINE.md

RUNBOOK.md

RUN\_LOG.md

GIT\_WORKFLOW.md

```



四份基础工程文档应全部进入：



```text

develop

```



之后不继续为了“完善文档”而延迟开发。



下一阶段正式进入：



```text

统一阿里云模型

&#x20;       ↓

真实模型对话验收

&#x20;       ↓

UI / Agent / RAG / 测试并行开发

&#x20;       ↓

Agent + RAG 联调

&#x20;       ↓

阶段测试

&#x20;       ↓

develop → main

```

