# M9 install-web.sh + GitHub Release Asset - 需求文档

- **日期**:2026-05-07
- **里程碑**:M9(整条链的终点)
- **上游**:M8(`feat/m8-web-cli-tarball` 已 merge)
- **对应设计文档节**:改造要点 G 的"一键安装脚本"子节 + 里程碑清单 M9 行

## 做什么

1. **新建** `scripts/install-web.sh`:Bash 一键安装脚本(**仅覆盖 Linux 和
   macOS**,Windows 用户本里程碑通过手动解压 zip 使用,不走 install-web.sh)
   - 检测 `uname -sm` → 映射到 tarball 平台名(linux-x86_64 / linux-aarch64 /
     darwin-arm64 / darwin-x86_64;uname 识别为 MINGW/MSYS/CYGWIN 时明确
     报错"不支持 Windows")
   - 从 GitHub Release 下载对应 tarball + `.sha256` 并校验
   - 解压到 `~/.local/share/aionui-web/`(linux)或
     `~/Library/Application Support/aionui-web/`(darwin)
   - 在 `~/.local/bin/aionui-web` 创建软链(默认不需 sudo)
   - 打印启动提示("已安装,运行 `aionui-web start` 开始")
2. **参数支持**:
   - `--version v1.2.3`:安装特定版本(默认 latest)
   - `--mirror https://<mirror-url>`:从内部镜像下载(企业场景)
   - `--install-dir /custom/path`:自定义安装目录
   - `--no-symlink`:不创建软链,只解压
   - `--no-path`:不修改 shell rc 文件添加 PATH
   - `--help`:打印帮助
3. **脚本内硬编码所在 release 的版本号**:CI 打 release 时把 install-web.sh
   作为 asset 上传,同时 `sed` 替换脚本里的 `__VERSION__` 占位为当前版本
4. **CI 上传 install-web.sh 为 Release Asset**:在 `build-and-release.yml`
   或等价 workflow 加一步。tarball 本身和对应 `.sha256` **由 M8 负责发布
   到 release**(M9 仅消费它们);本里程碑只补上 `install-web.sh`
   本身作为 asset
5. **更新 README.md 或 wiki 里的 WebUI 安装说明**,给出一键命令
   (**按设计文档 UC-1,必须用 `| bash`,不是 `| sh`**):
   ```bash
   curl -fsSL https://github.com/iOfficeAI/AionUi/releases/latest/download/install-web.sh | bash
   ```
6. **容器验证 job**(可选,但建议):在干净 Ubuntu container 里跑 install.sh,
   验证能装成功

## 不做什么(边界)

- ❌ **不做** Windows PowerShell 安装脚本(本里程碑只覆盖 Linux/macOS;
  Windows 用户手动解压 zip)
- ❌ **不做** GitHub Raw 分发(设计文档已定走 Release Asset)
- ❌ **不做** 自动升级(检查新版本)逻辑
- ❌ **不做** 卸载脚本(将来可另开小 PR)
- ❌ **不做** aionui-web 本身的功能改动(M8 已完成)
- ❌ **不改** 域名/不注册 aionui.io 类似短链
- ❌ **不改** 桌面打包/分发
- ❌ **不覆盖** 所有 shell(bash-only,不支持 fish/zsh 特有语法)

## 已定决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| 分发方式 | GitHub Release Asset | 设计文档 G 节(选 Release Asset 不选 Raw 已详述) |
| 脚本语言 | **Bash(锁死)** | 按设计文档 UC-1,不给 plan-writer 选择;shebang `#!/usr/bin/env bash` |
| 用户安装命令 | `curl ... \| bash`(**不是 `\| sh`**) | UC-1,`\| sh` 会忽略 shebang 用 /bin/sh 跑,Bash 语法直接挂 |
| 默认安装位置(linux) | `~/.local/share/aionui-web/` + `~/.local/bin/aionui-web` symlink | XDG 标准,不需 sudo |
| 默认安装位置(darwin) | `~/Library/Application Support/aionui-web/` + `~/.local/bin/aionui-web` symlink | macOS 惯例 |
| 是否要求 curl | 是(不支持 wget fallback,简化) | 主流环境都有 curl |
| 是否校验下载包完整性 | 是,下载对应 `.sha256` 文件校验 | 安全;CI 打 release 时要同步产出 sha256 |
| 特定版本安装 | `--version v1.2.3` 参数 | 设计文档 G 节 |
| 内部镜像 | `--mirror <url>` 参数,**必须同时支持 `https://` 和 `file://` 两种协议** | 企业场景 + 本地 smoke 复用同一机制;设计文档 G 节 |
| Windows 覆盖 | 本里程碑不做 | 用户手动解压 zip;wiki 说明 |
| 脚本版本锁 | 脚本内硬编码所在 release 版本号 | 设计文档 G 节("脚本和 tarball 同 release 配对") |
| 是否自动添加 PATH | 是(写入 `~/.bashrc` / `~/.zshrc`,带明确打印) | 开箱可用;有 `--no-path` 可关 |
| 失败策略 | 任何步骤失败立即 `exit 1` 并打印诊断 | `set -euo pipefail` |
| 脚本行数目标 | 150-250 行 | 足够完整,不冗长 |

## 验收标准

**验证分层**(与 playbook checkpoint 语义一致):
- **Executor 放行门禁 - 本地**(push 前必须通过):脚本存在 + 可执行、
  bash 语法、`--help` 输出完整、容器 smoke(`file://` mirror)PASS
- **Executor 放行门禁 - CI**(M9 feature 分支 CI 必须绿):`install-web.sh`
  出现在 workflow artifact 中;`__VERSION__` 已被 sed 替换
- **发布链最终验证**(与 executor 放行无关,人类在真实 release 后触发):
  用户一键 `curl ... | bash` 在干净 Ubuntu container 里真正跑通;
  `/releases/download/v{x}/install-web.sh` 版本号与 tag 匹配。本层失败不
  block M9 handoff 接受,但会 block 实际对外分发

**脚本存在 + 可执行**:

```bash
ls scripts/install-web.sh
test -x scripts/install-web.sh && echo "executable" || echo "not executable"
# 预期:文件存在 + executable
```

**bash 语法正确**:

```bash
bash -n scripts/install-web.sh
# 预期:退出 0

shellcheck scripts/install-web.sh || true  # 可选,不强制全绿
# 预期:无严重问题
```

**参数解析**:

```bash
bash scripts/install-web.sh --help | head -20
# 预期:打印 usage,包含 --version / --mirror / --install-dir / --no-symlink
#       / --no-path / --help
```

**容器验证(强制门禁,机械可判定)**:

install-web.sh 必须支持 `--mirror <url>` 参数(已在参数列表声明),且
`<url>` 可以是 `file://<local-path>/` 形式。本地 smoke 只需要 mirror 目录
里包含 **tarball + `.sha256`**,脚本本身直接用仓库工作区下的
`scripts/install-web.sh`(不需要复制,也不需要在 mirror 里再放一份)。

步骤:

1. **准备 mirror 目录**(**仅 tarball + sha256**):agent 从 M8 feature 分支
   的 CI workflow artifact 下载
   `aionui-web-v{version}-linux-x86_64.tar.gz` 及对应 `.sha256` 到
   `/tmp/m9-mirror/`。如果 M8 artifact 暂不可用,从 M9 自己的 feature 分支
   CI 里复用前置 M8 job 的产物(M8 是 M9 的上游,必然可得)
2. **在容器里跑仓库工作区下的 install-web.sh**:

```bash
# 前置:确保 /tmp/m9-mirror/ 已包含
#   aionui-web-v{version}-linux-x86_64.tar.gz
#   aionui-web-v{version}-linux-x86_64.tar.gz.sha256
# 注意:mirror 目录不需要 install-web.sh;脚本直接用仓库工作区下的版本
ls /tmp/m9-mirror/
# 预期:tarball + .sha256 两个文件

docker run --rm \
  -v $PWD/scripts:/scripts:ro \
  -v /tmp/m9-mirror:/mirror:ro \
  debian:slim bash -c '
    set -euxo pipefail
    apt-get update && apt-get install -y curl bash
    bash /scripts/install-web.sh --mirror file:///mirror/ --no-path
    # 验证安装后二进制可用
    ~/.local/bin/aionui-web --version
  '
echo "exit_code=$?"
```

预期:`exit_code=0`,最后一行输出 aionui-web 版本号。

> 注:仓库工作区的 `scripts/install-web.sh` 在开发期间是**模板版**,里面
> 的 `__VERSION__` 尚未被 sed 替换。本地 smoke 有两种处理:
> (a)脚本内部先检测 `__VERSION__` 是否已替换,未替换时从 `--version`
>      参数或 mirror 目录的 tarball 文件名推断版本;
> (b)smoke 命令显式加 `--version v{要装的版本}`。
> plan-writer 二选一落地,在 plan 中写清楚。

**失败时的诊断路径**:
- `--mirror` 不被脚本支持 → 脚本 BUG,修脚本
- sha256 校验失败 → tarball 内容和 sha256 不配对,重新下载 artifact
- `file://` 协议被 curl 拒绝 → 确认 curl 版本支持 file 协议;或脚本改用
  `cp` 直接从 mirror 路径读(若 `--mirror` 以 `file://` 开头)
- 版本号无法解析(`__VERSION__` 未替换且未给 `--version`)→ 按上方
  注释的两种方案之一修脚本或补命令
- `aionui-web --version` 报错 → 解压/权限/backend 路径问题,检查 install
  目录结构

**CI 产物**:

```bash
# 触发 CI release
# 预期 release artifact 包含:
# - aionui-web-v{version}-*.tar.gz (M8)
# - install-web.sh  (M9 新增)
# - install-web.sh.sha256 (可选)
```

**版本锁正确性**:

```bash
# 下载 v1.5.0 的 install-web.sh
curl -fsSL https://github.com/iOfficeAI/AionUi/releases/download/v1.5.0/install-web.sh \
  | grep "VERSION="
# 预期:VERSION=v1.5.0(硬编码在脚本里)
```

**文档更新**:

```bash
grep -rn "install-web.sh" README.md docs/
# 预期:至少一处(新加的一键安装说明)
```

**已有流程不回归**:

```bash
bun run dev &
bun run webui &
bun test
# 全部正常
```

## 关键风险

| 风险 | 缓解 |
|---|---|
| `uname -sm` 在不同 Linux 发行版输出差异(aarch64 vs arm64) | plan-writer 在脚本里用 case 映射:`aarch64|arm64) ARCH="aarch64";;` |
| 下载 sha256 失败(release 未产出 sha256) | M9 首先保证 CI 产出 `install-web.sh.sha256` 和 `aionui-web-*.tar.gz.sha256`;若缺则 skip 校验(有 warn) |
| PATH 添加逻辑污染用户 shell config | 先检查 PATH 里是否已有 `~/.local/bin`,已有则不改;`.bashrc` / `.zshrc` 追加前先检查是否已有同样行(幂等) |
| 重复安装时覆盖旧版本 | 先备份旧版本到 `~/.local/share/aionui-web.bak`,失败时可还原 |
| 脚本占位符替换(`__VERSION__` → `v1.5.0`)在 CI 中漏替换 | plan-writer 先让 CI 有 `sed -i "s/__VERSION__/$VERSION/g" install-web.sh`,再 upload artifact;若未替换则脚本运行时报错 `未知 VERSION` |
| 一键脚本被 curl 管道运行时 `read` 不能交互 | 脚本不依赖任何 read;所有选项用命令行参数 |
| 旧用户升级时旧软链指向老版本 | 脚本安装时 `ln -sf`(force)覆盖软链 |
| 容器里缺少 curl / tar | 脚本开头 `command -v curl tar` 检查,缺失时 `exit 1` 给出安装提示 |
| install.sh 在 macOS 用默认 bash 3.x(无 `[[` 的某些新特性) | `#!/usr/bin/env bash` + 兼容 bash 3.2 语法(不用 `${var,,}`、`mapfile`、associative arrays 等 bash 4+ 特性);脚本开头可选打印 `BASH_VERSION` 便于诊断 |

## 依赖上游

- **M8 已合入**:tarball artifact 已在 CI 产出,命名规则稳定
- **M7 已合入**:backend 下载流程稳定
- **读 M8 handoff**:
  - tarball 命名规则(`aionui-web-v{x}-{platform}-{arch}.tar.gz`)
  - tarball 内部目录结构
  - 二进制可执行权限处理

## 分支与 handoff

- 上游分支:`origin/feat/m8-web-cli-tarball`
- 本里程碑分支:`feat/m9-install-web-script`
- handoff 位置:`docs/backend-migration/handoffs/M9-outcome.md`
- handoff 必须附:
  - 一键安装命令(最终用户视角)
  - 在容器里跑过的 smoke 证据(命令输出)
  - README / wiki 更新的 commit 记录
  - **"9 里程碑链完成"总结**(整条链所有 feature 分支的最终 SHA 列表,
    便于人类统一合回 `feat/backend-migration`)
- 完成后 push 前:必须 `git merge origin/feat/backend-migration`

## 整条链收尾(M9 特有)

M9 是整条链的最后一个里程碑。完成时向 team-lead 额外报告:

```
SendMessage({
  to: "team-lead",
  message: "M9 完成。整条 WebUI 脱 Electron 重构链已全部结束。
  最终分支 SHA 列表:
  - feat/m1-monorepo-skeleton: <sha>
  - feat/m2-aionrs-cleanup: <sha>
  - feat/m3-web-host-skeleton: <sha>
  - feat/m4-backend-launcher-migration: <sha>
  - feat/m5-static-server-auth-migration: <sha>
  - feat/m6-three-paths-cutover: <sha>
  - feat/m7-prepare-backend-ci: <sha>
  - feat/m8-web-cli-tarball: <sha>
  - feat/m9-install-web-script: <sha>

  建议人类决策:
  (a) 一次性创建 PR 把 feat/m9-install-web-script 合回
      feat/backend-migration
  (b) 或分段 PR(M1/M2 先合,再 M3-M6,再 M7-M9),降低 review 负担
  请用户决定。"
})
```

team-lead 随后向用户汇报并 `TeamDelete`。

## 预计执行时间

3-5 小时(脚本撰写 + CI 上传 + 容器冒烟 + README 更新。改动物理面小)
