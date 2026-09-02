# AionUi-Campus 团队运行与环境复现手册（RUNBOOK）

**项目：** 2026 年第二届重庆市 AI 大模型创新应用大赛 · “创意 AI 校园”
**仓库：** `ai-campus-2026/AionUi-Campus`
**适用系统：** Windows 10 / 11 + PowerShell
**文档版本：** V1.0
**基线日期：** 2026-08-07
**维护人：** 1 号负责人 / 队长

---

## 0. 这份文档解决什么问题

本 RUNBOOK 用于保证 5 名成员在不同电脑上能够按照同一套方法完成：

1. 获取团队代码；
2. 安装和检查基础开发环境；
3. 编译并安装 AionCore；
4. 安装 AionUi-Campus 依赖；
5. 启动桌面端；
6. 完成真实模型对话验收；
7. 正确使用 `develop`、功能分支和 Pull Request；
8. 运行基础质量检查；
9. 出现常见环境问题时按照统一流程排查；
10. 留下可用于比赛“可运行代码及依赖环境说明”的复现证据。

**核心原则：先保证所有成员的原版环境一致，再开始分工开发。**

环境阶段不要为了“追最新”自行升级依赖，也不要在 `main` / `develop` 直接开发比赛功能。

---

# 1. 当前团队基线

## 1.1 AionUi-Campus

团队仓库：

```text
https://github.com/ai-campus-2026/AionUi-Campus.git
```

官方上游：

```text
https://github.com/iOfficeAI/AionUi.git
```

团队锁定的原始开发基线：

```text
Tag:
baseline-20260807

Commit:
f98d9f719de9c639f739470ea49f01a6b0a22687
```

说明：

- `baseline-20260807` 是“确认原版能够运行”的历史基线，不再移动。
- `main` 用于稳定、可演示、可发布版本。
- `develop` 用于团队日常集成，会随着开发继续前进。
- 所有新功能从最新 `develop` 创建任务分支。

详细版本信息见：

```text
BASELINE.md
```

---

## 1.2 AionCore

当前团队确认：

```text
CLI Version:
aioncore 0.1.61

Repository:
https://github.com/iOfficeAI/AionCore.git

Branch:
main

Commit:
81ef258913e6ac5076a86d4adcc7edcc0f8f21ef
```

AionCore 当前作为 AionUi-Campus 的上游 / 底层依赖使用。

团队目前：

- 不建立 AionCore 的团队 `develop`；
- 不给官方 AionCore 仓库创建比赛 tag；
- 不向官方 AionCore 仓库 push 比赛代码；
- 不在比赛开发期间随意升级 AionCore。

如后续确实需要修改 AionCore，必须由 1 号负责人先重新评估版本管理方案。

---

# 2. 推荐目录结构

为了减少 Windows 原生依赖、脚本和路径兼容问题，普通成员建议使用短、稳定、非同步盘的英文路径。

推荐：

```text
D:\AI-Campus-Workspace
├─ AionUi-Campus
└─ AionCore
```

队长当前使用中文路径已验证可运行，但其他成员优先采用上述英文路径。

后文统一使用：

```text
<WORKSPACE>
```

表示个人工作目录。

例如：

```text
<WORKSPACE> = D:\AI-Campus-Workspace
```

---

# 3. 环境阶段禁止事项

在完成环境验收之前，成员不要：

1. 自己再 Fork 一份 AionUi-Campus；
2. 修改业务代码；
3. 直接向 `main` 或 `develop` push；
4. 运行 `cargo update`；
5. 运行 `bun update`；
6. 手动删除或重写 `bun.lock`；
7. 自行升级 Node 到 25 或更高；
8. 自行升级 AionCore；
9. 自行点击 GitHub 的 Sync fork 把 upstream 更新合入团队仓库；
10. 把 API Key、AccessKey、密码、学号、真实账号、未脱敏日志或未授权资料提交到仓库。

上游同步只由 1 号负责人统一处理。

---

# 4. 新电脑第一次获取代码

## 4.1 创建工作目录

```powershell
mkdir D:\AI-Campus-Workspace -ErrorAction SilentlyContinue
cd D:\AI-Campus-Workspace
```

## 4.2 Clone 团队 AionUi-Campus

```powershell
git clone https://github.com/ai-campus-2026/AionUi-Campus.git
```

这是团队唯一的 AionUi 比赛开发仓库。

普通成员不需要再创建个人 Fork。

## 4.3 Clone AionCore

```powershell
git clone https://github.com/iOfficeAI/AionCore.git
```

## 4.4 检查目录

```powershell
Get-ChildItem D:\AI-Campus-Workspace
```

正常应至少看到：

```text
AionUi-Campus
AionCore
```

---

# 5. 已经 Clone 的成员如何同步团队最新代码

如果成员已经提前 Clone 过仓库，**不需要重新 Clone**。

当队长通知“开始统一进入 develop”后执行：

```powershell
cd D:\AI-Campus-Workspace\AionUi-Campus

git fetch origin
git switch develop
git pull
```

检查：

```powershell
git branch --show-current
```

正常应显示：

```text
develop
```

然后：

```powershell
git status
```

正常情况下应看到类似：

```text
On branch develop
Your branch is up to date with 'origin/develop'.

nothing to commit, working tree clean
```

如果本地还没有 `develop`，`git fetch origin` 后再执行 `git switch develop`。

---

# 6. 一次性环境检查

打开一个新的 PowerShell，依次执行：

```powershell
git --version
node -v
bun --version
python --version
rustup --version
rustc --version
cargo --version
```

不要看到某一个命令失败就开始随意安装所有工具。

先记录哪些已经存在，缺什么再补什么。

---

# 7. 推荐/要求版本

| 组件     | 团队要求 / 建议                    | 当前已验证情况     |
| -------- | ---------------------------------- | ------------------ |
| Windows  | Windows 10 / 11 x64                | Windows 环境已验证 |
| Git      | 可正常 clone / fetch / pull / push | 必需               |
| Node.js  | `>=22` 且 `<25`                    | 队长已验证 24.14.0 |
| Bun      | 稳定版                             | 队长已验证 1.3.14  |
| Python   | 3.11+                              | 队长已验证 3.12.5  |
| Rust     | AionCore 项目锁定 1.95.0           | 必须按项目工具链   |
| Cargo    | 随 Rust 工具链                     | 必需               |
| AionCore | `0.1.61`                           | 当前团队锁定       |
| Electron | 跟随仓库 lockfile/package          | 不单独追最新版     |

**原则：符合要求就不要为了“更新”而更新。**

---

# 8. Node.js

检查：

```powershell
node -v
```

要求：

```text
>= 22
< 25
```

例如 24.x 可以使用。

如果已经满足范围，不要自行升级。

如果不满足，再安装符合范围的版本，并重新打开 PowerShell 后检查。

---

# 9. Bun

检查：

```powershell
bun --version
```

如果 PowerShell 无法识别 `bun`，可使用 Bun 的 PowerShell 安装方式：

```powershell
powershell -c "irm bun.sh/install.ps1|iex"
```

安装后：

1. 关闭当前 PowerShell；
2. 新开 PowerShell；
3. 再执行：

```powershell
bun --version
```

---

# 10. Python

检查：

```powershell
python --version
```

团队环境建议：

```text
Python 3.11+
```

如果低于 3.11，再安装新版本，并确保 Python 已加入 PATH。

当前阶段 Python 不是 AionUi 桌面启动的唯一核心依赖，但后续 MCP / RAG 服务可能会使用。

---

# 11. Rust 与 Cargo

## 11.1 检查 rustup

```powershell
rustup --version
```

如果不存在，安装 Rust 官方 `rustup`。

Windows 安装时使用默认 MSVC 工具链即可。

## 11.2 安装 AionCore 项目要求的 Rust

当前 AionCore 项目工具链锁定为 Rust 1.95.0。

执行：

```powershell
rustup toolchain install 1.95.0 --profile minimal
```

## 11.3 国内网络下载很慢时

只在默认源明显很慢、失败或连接不稳定时，在**当前 PowerShell** 临时设置镜像：

```powershell
$env:RUSTUP_DIST_SERVER="https://rsproxy.cn"
$env:RUSTUP_UPDATE_ROOT="https://rsproxy.cn/rustup"

rustup toolchain install 1.95.0 --profile minimal
```

这些环境变量只影响当前 PowerShell。

## 11.4 在 AionCore 目录检查实际工具链

```powershell
cd D:\AI-Campus-Workspace\AionCore

rustc --version
cargo --version
```

成功标准：

```text
rustc 1.95.0 ...
```

如果系统全局还有其他 Rust 版本，只要进入 AionCore 目录后项目工具链正确即可。

---

# 12. Windows C/C++ 构建工具

AionCore 的部分 Rust 原生依赖在 Windows 上可能需要 MSVC / C++ Build Tools。

如果 Cargo 明确提示：

```text
native build tools missing
MSVC tools missing
linker not found
```

再安装 Visual Studio C++ Build Tools。

安装完成后重新打开 PowerShell，再重新编译。

**没有相关错误时不要为了“保险”反复修改 C++ 工具链。**

---

# 13. 编译并安装 AionCore

目标：生成可用的 `aioncore.exe`，并让 AionUi 能从 PATH 中找到。

## 13.1 进入 AionCore

```powershell
cd D:\AI-Campus-Workspace\AionCore
```

## 13.2 首次编译

```powershell
cargo clean
cargo install --path crates/aionui-app --locked
```

第一次编译会下载和编译大量 Rust 依赖。

出现很多：

```text
Compiling ...
```

属于正常现象。

几分钟到十几分钟都有可能，不要因为短时间没有新输出立即终止。

## 13.3 验证安装

```powershell
where.exe aioncore
aioncore --version
```

当前团队成功标准：

```text
aioncore 0.1.61
```

并且 `where.exe aioncore` 应能找到类似：

```text
%USERPROFILE%\.cargo\bin\aioncore.exe
```

---

# 14. AionCore 找不到时

如果：

```powershell
aioncore --version
```

提示无法识别命令，先临时把 Cargo bin 加到当前终端 PATH：

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"

where.exe aioncore
aioncore --version
```

如果此时可以找到，说明主要问题是 PATH。

不要立即重装 AionCore。

---

# 15. aws-lc-sys / NASM failed 专项故障

**只有出现 `aws-lc-sys` + `NASM failed` 一类明确错误时才执行本节。**

先检查：

```powershell
where.exe nasm
```

如果找到了 NASM，但本地汇编失败，可以在当前 PowerShell 临时隐藏该 NASM，并让 `aws-lc-sys` 使用预构建 NASM 对象：

```powershell
$nasmDir = Split-Path (Get-Command nasm).Source

$env:Path = (($env:Path -split ';') |
  Where-Object { $_.TrimEnd('\') -ine $nasmDir.TrimEnd('\') }) -join ';'

$env:AWS_LC_SYS_PREBUILT_NASM = "1"

where.exe nasm
```

此时 `where.exe nasm` 应提示找不到。

然后：

```powershell
cd D:\AI-Campus-Workspace\AionCore

cargo clean
cargo install --path crates/aionui-app --locked
```

说明：

- 这不会卸载 NASM；
- 只是当前 PowerShell 暂时不使用该 NASM；
- 关闭终端后系统 PATH 会恢复。

---

# 16. AionCore 后续重新安装

正常日常启动**不需要每天重新编译 AionCore**。

只有 AionCore 源码被团队统一更新后，才需要重新安装。

如果包版本没变但源码变了，可以使用：

```powershell
cd D:\AI-Campus-Workspace\AionCore

cargo install --path crates/aionui-app --locked --force
```

未经队长确认不要自行更新 AionCore 源码。

---

# 17. 安装 AionUi-Campus 依赖

## 17.1 进入团队仓库

```powershell
cd D:\AI-Campus-Workspace\AionUi-Campus
```

## 17.2 国内网络建议设置 Electron 镜像

如果 Electron / GitHub 二进制下载容易断开，可在当前 PowerShell 先设置：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
```

## 17.3 安装依赖

```powershell
bun install
```

安装尾声可能会涉及：

- electron-builder；
- @electron/rebuild；
- better-sqlite3；
- 原生依赖处理；
- postinstall。

只要终端还没有重新出现：

```text
PS D:\...>
```

就仍然可能处于安装过程中。

**不要把“几分钟没输出”直接等同于“卡死”。**

建议：

- 短时间无输出：继续等待；
- 5～10 分钟无明显变化：观察 CPU / 磁盘；
- 出现明确红色 error：再进入故障排查；
- 不要反复删除整个 `node_modules`。

---

# 18. 验证 Electron 是否完整

在 AionUi-Campus 目录：

```powershell
Test-Path ".\node_modules\electron\path.txt"
```

成功：

```text
True
```

如果返回：

```text
False
```

说明 Electron npm 包可能已经存在，但真正的 Electron 二进制并未完整下载。

---

# 19. Electron 下载失败修复

只在出现以下情况时执行：

- `bun install` 最终报 `ECONNRESET`；
- 启动时报 Electron uninstall；
- Electron executable missing；
- `path.txt` 为 False。

执行：

```powershell
cd D:\AI-Campus-Workspace\AionUi-Campus

$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"

Remove-Item "$env:LOCALAPPDATA\electron\Cache" `
  -Recurse -Force -ErrorAction SilentlyContinue

$env:force_no_cache="true"

bun install
```

重新检查：

```powershell
Test-Path ".\node_modules\electron\path.txt"
```

如果依赖已经装好，但 `path.txt` 仍不存在，再尝试补 Electron 二进制：

```powershell
Remove-Item ".\node_modules\electron\dist" `
  -Recurse -Force -ErrorAction SilentlyContinue

node .\node_modules\electron\install.js

Test-Path ".\node_modules\electron\path.txt"
```

最后返回 `True` 后再启动。

---

# 20. 启动 AionUi-Campus

## 20.1 启动前检查 AionCore

```powershell
aioncore --version
```

当前应看到：

```text
aioncore 0.1.61
```

## 20.2 团队统一启动命令

进入仓库：

```powershell
cd D:\AI-Campus-Workspace\AionUi-Campus
```

统一执行：

```powershell
bun run start
```

当前仓库中：

```text
bun run start
bun run dev
```

实际都指向同一个 `electron-vite dev` 开发命令。

为了成员文档口径统一，团队 RUNBOOK 统一使用：

```powershell
bun run start
```

开发调试时如果负责人明确要求，也可以使用：

```powershell
bun run dev
```

## 20.3 成功标准

启动后应满足：

- Electron / AionUi 桌面窗口出现；
- 页面正常加载；
- 能看到 AionUi 的主要界面；
- 终端没有导致应用直接退出的严重错误；
- AionCore 可被 AionUi 正常使用。

运行期间不要关闭启动该应用的 PowerShell。

## 20.4 停止

优先回到启动终端：

```text
Ctrl + C
```

不要把任务管理器强杀作为日常退出方式。

---

# 21. 日常再次启动

完成首次环境搭建后，日常一般不需要重新安装。

执行：

```powershell
cd D:\AI-Campus-Workspace\AionUi-Campus

aioncore --version

git switch develop
git pull

bun run start
```

如果只是验证当前本地代码、不需要同步远端，可省略 `git pull`。

---

# 22. 模型配置与真实对话验收

仅“桌面窗口能打开”还不算环境完全通过。

每名成员还需要完成一次**真实模型对话**。

团队下一阶段模型方案原则：

- 优先统一使用 AionUi 已支持的阿里云 DashScope / 通义千问；
- 具体模型名称、参数和团队测试账号由 4 号负责人 + 1 号负责人统一冻结；
- API Key 不写入仓库；
- API Key 不发在公开群截图中；
- 不把 `.env`、密钥、真实用户数据提交到 GitHub。

## 22.1 验收方式

模型配置完成后，在 AionUi 中发送一条简单消息，例如：

```text
你好，请用一句话说明你已经成功连接模型。
```

成功标准：

- 请求真实发出；
- 模型真实返回；
- UI 正常显示回答；
- 无鉴权错误；
- 无模型不存在错误；
- 无持续网络错误。

## 22.2 当前状态

在团队统一模型名称 / 配置方式完全冻结前，本节只作为验收规则。

最终确认后由 4 号负责人补充：

```text
Provider:
Model:
Endpoint / Region:
必要参数:
配置截图:
脱敏调用证据:
```

---

# 23. 基础质量检查

当前仓库已经提供多项脚本。

## 23.1 Lint

```powershell
bun run lint
```

## 23.2 格式检查

```powershell
bun run format:check
```

## 23.3 单元/常规测试

```powershell
bun run test
```

## 23.4 覆盖率

```powershell
bun run test:coverage
```

## 23.5 E2E

```powershell
bun run test:e2e
```

## 23.6 TypeScript 类型检查

```powershell
bunx tsc --noEmit
```

当前阶段要求每名成员至少知道：

```powershell
bun run lint
bun run format:check
bun run test
```

正式 CI 门禁建立后，再由 5 号负责人更新“哪些检查是 PR 必须通过项”。

---

# 24. 当前 Git 分支模型

长期分支：

```text
main
develop
```

任务分支示例：

```text
feat/ui-campus
feat/agent-workflow
feat/campus-mcp-rag
feat/integration

fix/<issue>-<name>

test/evaluation

docs/runbook
docs/submission

ci/competition-quality
```

含义：

```text
main
└─ 稳定、可演示、可发布版本

develop
└─ 团队日常集成版本

feat/fix/docs/test/ci
└─ 个人或单项任务的临时工作分支
```

---

# 25. main / develop 当前保护规则

当前团队 GitHub Ruleset：

```text
Protect main     Active
Protect develop  Active
```

核心规则：

- 禁止删除受保护分支；
- 禁止 Force Push；
- 必须通过 Pull Request；
- 至少 1 个具有 Write 权限的成员 Approve；
- 新提交后旧审批失效；
- 未解决的 Review conversation 会阻止合并。

当前暂未把 status checks 设置为 required。

5 号负责人建立稳定 CI 后，再补充。

---

# 26. Merge 策略

## 26.1 功能分支 → develop

使用：

```text
Squash and merge
```

原因：

成员任务分支里可能有多个调试提交，Squash 后进入 `develop` 时保持历史简洁。

## 26.2 develop → main

使用：

```text
Merge
```

原因：

保留 `develop` 到 `main` 的整体版本关系，便于比赛版本追踪、回滚和证明开发历史。

---

# 27. 普通成员第一次开始正式开发

环境验收完成、队长通知开始开发后：

```powershell
cd D:\AI-Campus-Workspace\AionUi-Campus

git fetch origin
git switch develop
git pull
```

然后创建自己的任务分支。

例如 2 号 UI：

```powershell
git switch -c feat/ui-campus
```

3 号 Agent：

```powershell
git switch -c feat/agent-workflow
```

4 号 RAG / MCP：

```powershell
git switch -c feat/campus-mcp-rag
```

5 号测试：

```powershell
git switch -c test/evaluation
```

1 号集成：

```powershell
git switch -c feat/integration
```

---

# 28. 开发中保存修改

查看：

```powershell
git status
```

添加：

```powershell
git add <文件>
```

不要习惯性在不清楚改动内容时直接 `git add .`。

提交：

```powershell
git commit -m "feat(ui): add campus dashboard"
```

示例：

```text
feat(ui): add campus workflow dashboard
feat(agent): add evidence-first assistant rules
feat(mcp): add course evidence retrieval
fix(ipc): validate workspace path
test(eval): add baseline comparison cases
docs(runbook): update environment troubleshooting
```

推送个人分支：

```powershell
git push -u origin <你的分支名>
```

---

# 29. Pull Request 标准流程

任务完成后：

```text
个人任务分支
      ↓
Pull Request
      ↓
develop
```

创建 PR 时确认：

```text
base: develop
compare: 你的任务分支
```

不要把普通功能 PR 直接发到 `main`。

PR 至少说明：

```text
1. 本次解决什么问题
2. 改了什么
3. 输入 / 输出是否变化
4. 如何验证
5. 已运行哪些测试
6. 有什么风险
7. 明确不包含什么
```

---

# 30. PR 审核

Reviewer 打开 PR：

```text
Files changed
→ Review changes
→ Approve
→ Submit review
```

要计入保护规则，Reviewer 必须具有：

```text
Write
```

或更高仓库权限。

如果显示：

```text
Approved ... with read-only permissions
```

说明该成员只有 Read 权限，该审批不能满足 required review。

普通开发成员仓库角色：

```text
Write
```

队长 / 仓库负责人：

```text
Admin
```

---

# 31. PR 合并后本地清理

PR 合入 `develop` 后：

```powershell
git switch develop
git pull
```

检查：

```powershell
git status
```

然后删除已完成的本地任务分支：

```powershell
git branch -d <分支名>
```

如果该 PR 使用 Squash merge，Git 有时会提示原任务分支的原始 commit “not yet merged to HEAD”。

只要：

- PR 已显示 Merged；
- 任务内容已进入 `develop`；
- `git pull` 后文件存在；

就可以删除该临时任务分支。

远程任务分支也可以在 GitHub PR 页面点击：

```text
Delete branch
```

长期保留：

```text
main
develop
```

---

# 32. 上游同步规则

普通成员：

- 不自行添加和同步 `upstream/main`；
- 不点击 Sync fork 后直接合入比赛分支；
- 不自己决定升级上游。

1 号负责人负责：

1. 获取 upstream 更新；
2. 在临时分支测试；
3. 验证 AionCore / AionUi / 测试；
4. 确认无严重回归后再进入 `develop`；
5. 如基线发生变化，更新 `BASELINE.md` 和 RUNBOOK；
6. 比赛最终冻结期不追求“永远最新”。

项目稳定性优先于上游版本新旧。

---

# 33. API Key 与数据安全

禁止提交：

```text
.env
API Key
AccessKey
Secret
密码
真实账号
学号
手机号
隐私聊天记录
未经授权课程资料
内部教师材料
原始敏感日志
```

如果开发必须使用配置文件：

- 提交 `.env.example`；
- 示例值使用占位符；
- 真实 Key 只保存在本地安全位置；
- 截图时脱敏；
- 如果 Key 意外进入 Git 历史，不能只删除文件，必须立刻轮换密钥并处理历史。

---

# 34. 开源与修改边界

AionUi-Campus 基于 AionUi 二次开发。

团队必须：

- 保留上游 LICENSE；
- 明确标注基于 AionUi；
- 不宣称整个底座由团队从零开发；
- 后续建立 / 维护 `MODIFICATIONS.md`；
- 后续建立 / 维护 `THIRD_PARTY_NOTICES.md`；
- 比赛材料中明确区分“上游能力”和“团队原创增量”。

AionCore 属于当前谨慎修改区域。

没有必要时，不进入底层核心大改。

---

# 35. 常见故障速查

| 现象                                    | 优先判断               | 推荐处理                                               |
| --------------------------------------- | ---------------------- | ------------------------------------------------------ |
| `bun` 无法识别                          | PATH 未刷新            | 重新打开 PowerShell，执行 `bun --version`              |
| rustup 有但 rustc 不正常                | 工具链不完整           | 安装 Rust 1.95.0 minimal                               |
| Rust 下载很慢 / 失败                    | 网络问题               | 临时使用 rsproxy                                       |
| Cargo 提示 native build tools           | C++ 工具缺失           | 安装 VS C++ Build Tools                                |
| `aws-lc-sys / NASM failed`              | 本地 NASM 汇编问题     | 按本 RUNBOOK 第 15 节处理                              |
| `aioncore` 找不到                       | Cargo bin 不在 PATH    | 临时加入 `%USERPROFILE%\.cargo\bin`                    |
| `bun install` ECONNRESET                | Electron 下载中断      | 设置 `ELECTRON_MIRROR`                                 |
| Electron uninstall / executable missing | 二进制不完整           | 清缓存 / 重装 Electron 二进制                          |
| `path.txt` = False                      | Electron 未完整下载    | 执行 Electron 修复流程                                 |
| 安装看似卡住                            | postinstall / 原生编译 | 先等待并观察，不立即中断                               |
| 某成员能跑、某成员不能跑                | 版本/路径不一致        | 对照版本表和基线                                       |
| push main/develop 被拒绝                | 分支保护生效           | 从任务分支发 PR                                        |
| PR 无法 Merge                           | 缺 Approval            | 找 Write 权限成员审核                                  |
| Approval 不生效                         | Reviewer 只有 Read     | 给该成员仓库 Write 权限                                |
| 看不到最新文件                          | 本地未 fetch/pull      | `git fetch origin` + `git switch develop` + `git pull` |

---

# 36. 环境验收清单

每名成员必须完成：

- [ ] `AionUi-Campus` 和 `AionCore` 两个目录存在
- [ ] `git --version` 正常
- [ ] `node -v` 在 `>=22` 且 `<25`
- [ ] `bun --version` 正常
- [ ] `python --version` >= 3.11
- [ ] 在 AionCore 目录 `rustc --version` 为项目要求版本
- [ ] `cargo --version` 正常
- [ ] `where.exe aioncore` 能找到 CLI
- [ ] `aioncore --version` = `0.1.61`
- [ ] `bun install` 最终无 error
- [ ] `Test-Path ".\node_modules\electron\path.txt"` = `True`
- [ ] `bun run start` 能打开 AionUi 桌面端
- [ ] `git fetch origin` 正常
- [ ] 能切换到 `develop`
- [ ] `git status` 可正常使用
- [ ] 完成一次真实模型对话
- [ ] 能运行至少一次 `bun run lint`
- [ ] 能运行至少一次 `bun run test`
- [ ] 知道 API Key 不能提交到 Git
- [ ] 能解释 `main / develop / task branch` 的区别

---

# 37. 成员提交给队长的统一回执

```text
【AionUi-Campus 成员环境验收】

姓名：
岗位编号：
电脑系统：Windows 10 / Windows 11

Git：
Node：
Bun：
Python：
Rust（AionCore目录）：
Cargo：
AionCore：

AionUi-Campus 当前分支：
AionUi-Campus 是否成功启动：是 / 否
Electron path.txt：True / False
真实模型对话：通过 / 未通过

bun run lint：通过 / 未运行 / 失败
bun run test：通过 / 未运行 / 失败

启动截图：已附 / 未附

当前报错或阻塞：
无 / 具体描述

处理过的特殊问题：
无 / NASM / Electron / PATH / Rust / 其他
```

后续由 5 号负责人统一整理到：

```text
RUN_LOG.md
```

---

# 38. 问题上报格式

成员遇到问题时不要只发一句：

```text
“报错了”
```

统一提供：

```text
【环境问题】

成员：
当前步骤：
当前目录：
当前分支：

执行命令：
<完整命令>

完整报错：
<复制文本或清晰截图>

版本：
git：
node：
bun：
python：
rustc：
cargo：
aioncore：

已经尝试：
1.
2.

当前是否影响其他成员：
是 / 否 / 不确定
```

这样队长和对应负责人才能快速定位。

---

# 39. 队长环境阶段检查表

1 号负责人需要持续确认：

- [x] 团队仓库 `origin` 已建立
- [x] 官方 AionUi `upstream` 已确认
- [x] `baseline-20260807` 已建立并 push
- [x] `develop` 已建立
- [x] `main` Ruleset 已启用
- [x] `develop` Ruleset 已启用
- [x] `BASELINE.md` 已进入 `develop`
- [x] AionCore 版本 / commit 已记录
- [ ] `RUNBOOK.md` 已进入 `develop`
- [ ] `RUN_LOG.md` 已建立
- [ ] 5 名成员环境全部验收
- [ ] 团队统一模型方案已冻结
- [ ] 5 名成员真实模型对话全部通过
- [ ] CI / required status checks 已由 5 号负责人建立
- [ ] `MODIFICATIONS.md` 已建立
- [ ] `THIRD_PARTY_NOTICES.md` 已建立

---

# 40. 当前仓库已确认的常用脚本

桌面开发：

```powershell
bun run start
bun run dev
```

当前两者等价。

多实例：

```powershell
bun run start:multi
```

WebUI：

```powershell
bun run webui
```

构建：

```powershell
bun run package
bun run build-win
```

代码质量：

```powershell
bun run lint
bun run lint:fix
bun run format
bun run format:check
```

测试：

```powershell
bun run test
bun run test:coverage
bun run test:integration
bun run test:e2e
```

调试：

```powershell
bun run debug:mcp
bun run debug:mcp:list
bun run debug:mcp:validate
```

成员不要因为看到脚本很多就全部运行。

当前环境阶段核心只有：

```powershell
bun install
aioncore --version
bun run start
bun run lint
bun run test
```

---

# 41. 比赛交付关联

赛题要求最终包含：

- 模型 / 算法说明；
- 可运行代码及依赖环境说明；
- 验证集评测结果；
- 可选 Demo / 交互界面；
- 实际使用阿里云产品或平台。

因此本 RUNBOOK 不是临时笔记。

后续需要持续维护，使其能够成为：

```text
团队内部运行手册
        ↓
干净电脑复现依据
        ↓
比赛依赖环境说明底稿
        ↓
答辩时的工程可复现证据
```

最终候选版本发布前，必须至少在一台“非队长日常开发机”上按照本 RUNBOOK 从零复现一次。

---

# 42. 文档维护规则

任何影响以下内容的 PR，都要考虑是否同步修改 RUNBOOK：

- Node / Bun / Rust 版本；
- AionCore 版本；
- 启动命令；
- 安装命令；
- 环境变量；
- 模型配置；
- Git 工作流；
- CI / 测试门禁；
- Windows 特殊故障处理；
- 打包方式；
- 最终演示启动方式。

RUNBOOK 不能写“某个人电脑上特殊的隐藏步骤”。

如果某个步骤只有一个人知道，就说明该步骤还没有完成团队化。

---

# 43. 当前下一阶段

当 5 名成员都完成本 RUNBOOK 的基础环境验收后，进入：

```text
统一 develop
    ↓
统一模型配置
    ↓
5 人真实对话验收
    ↓
创建个人任务分支
    ↓
第一轮功能开发
```

在环境验收完成前，不提前进入大规模功能开发。

---

# 附录 A：最快日常启动

已经完成全部安装的成员：

```powershell
cd D:\AI-Campus-Workspace\AionUi-Campus

git switch develop
git pull

aioncore --version

bun run start
```

---

# 附录 B：最快环境自检

```powershell
git --version
node -v
bun --version
python --version

cd D:\AI-Campus-Workspace\AionCore
rustc --version
cargo --version
aioncore --version

cd D:\AI-Campus-Workspace\AionUi-Campus
Test-Path ".\node_modules\electron\path.txt"
git branch --show-current
git status
```

---

# 附录 C：资料依据

本 RUNBOOK 基于以下团队材料和已验证结果整理：

1. `BASELINE.md`
2. 《AionUi-Campus 团队统一环境搭建手册（Windows版）V1.0》
3. 《基于 AionUi 的 AI 校园项目方向与五人认领式分工方案》
4. 当前 AionUi-Campus `package.json` 脚本列表
5. 团队 2026-08-06 至 2026-08-07 的实际 Windows 安装与故障排查过程

**维护原则：以团队锁定 commit 和实际成功复现结果为准，不以“网上最新教程”自动覆盖当前比赛基线。**
