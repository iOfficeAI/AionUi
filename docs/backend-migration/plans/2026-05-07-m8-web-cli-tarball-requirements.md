# M8 @aionui/web-cli + GitHub Release tarball - 需求文档

- **日期**:2026-05-07
- **里程碑**:M8
- **上游**:M7(`feat/m7-prepare-backend-ci` 已 merge)
- **对应设计文档节**:目标形态("三条 WebUI 启动路径"之路径 ①) + 改造
  要点 G(aionui-web 的 GitHub Release 打包流程) + aionui-web CLI 设计 +
  里程碑清单 M8 行

## 做什么

1. **新建** `packages/web-cli/` workspace 子包:
   - `packages/web-cli/package.json`(`private: true`,不发 npm)
   - `packages/web-cli/tsconfig.json`(继承根)
   - `packages/web-cli/bin/aionui-web`(dev 入口 shell 脚本)
   - `packages/web-cli/src/cli.ts`(命令分发:`start` / `resetpass` /
     `status` / `--version`)
   - `packages/web-cli/src/resolveBackendBinary.ts`(Node 壳的 backend
     查找器,实现 `BackendBinaryResolver` 接口)
2. **`aionui-web start` 实现**:调用 `@aionui/web-host` 的 `startWebHost()`,
   传 `{ kind: 'ownBackend' }` + 注入 `AppMetadata` + `BackendBinaryResolver`
3. **CI 流程扩展**:在 `.github/workflows/_build-reusable.yml` 或独立的
   workflow 里加一个 job 矩阵,产出 5 个平台的 tarball:
   - `aionui-web-v{version}-linux-x86_64.tar.gz`
   - `aionui-web-v{version}-linux-aarch64.tar.gz`
   - `aionui-web-v{version}-darwin-arm64.tar.gz`
   - `aionui-web-v{version}-darwin-x86_64.tar.gz`
   - `aionui-web-v{version}-win32-x64.zip`
4. **tarball 内容结构**:
   ```
   aionui-web-v{x}-{platform}-{arch}/
   ├── aionui-web          (bun build --compile 单文件可执行)
   ├── aionui-backend      (来自 M7 shared-scripts 下载)
   ├── renderer/           (复用桌面的 out/renderer 产物)
   └── README.md           (简短说明 + --help)
   ```
5. **CI 产物 → GitHub Release 全链路闭环**(本里程碑负责,M9 只消费):
   - `actions/upload-artifact` 上传 workflow artifact
   - **同步生成每个 tarball / zip 的 `.sha256` 校验文件**
   - 在 `build-and-release.yml`(或等价 workflow)里,release job 把
     tarball + `.sha256` **实际发布到 GitHub Release 作为 asset**
     (与桌面 dmg/exe 同 release 同 tag)
   - `scripts/verify-release-assets.sh` 新增一条"5 个 tarball 及其 sha256 都
     存在"检查,release 前硬门禁
6. **容器验证 job**:在 CI 加一个 job,在干净 `debian:slim` 容器里下载
   linux tarball(从 workflow artifact 或 release)并验证
   `./aionui-web start --port 8080 --no-open` 能起服务,`curl` 能命中 200

## 不做什么(边界)

- ❌ **不发 npm**(`private: true`)
- ❌ **不做** Docker image(不在本里程碑)
- ❌ **不做** install-web.sh(是 M9)
- ❌ **不做** M9 的 install-web.sh(但本里程碑必须让 M9 能"消费":tarball
  已发到 release 且 sha256 可用)
- ❌ **不改** 桌面打包(M1-M7 的桌面链路不受影响)
- ❌ **不改** `@aionui/web-host` 的 API
- ❌ **不重写** `@aionui/web-host`;web-cli 只是壳,调 web-host
- ❌ **不引入新的**静态资源压缩/混淆逻辑;renderer/ 目录用桌面同一份 out/renderer

## 已定决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| CLI 分发方式 | GitHub Release tarball | 设计文档 G 节,不走 npm |
| 包名 | `@aionui/web-cli`(内部),分发 artifact 名 `aionui-web` | 和桌面命名约定一致 |
| `private: true` | 是 | 不发 npm |
| 单文件编译工具 | `bun build --compile --target=bun-{platform}-{arch}` | 仓库已全仓用 bun;设计文档 G 节 |
| tarball 压缩格式 | linux/darwin 用 `.tar.gz`,win32 用 `.zip` | 平台常规 |
| backend 二进制打包方式 | CI 打包时下载(复用 M7 的 `prepareBackend`) | 设计文档 G 节 |
| backend 失败策略 | 硬失败 CI(复用 M7 的默认行为);过渡期可 `AIONUI_BACKEND_ALLOW_MISSING=1` | 和桌面打包对齐 |
| renderer 产物来源 | 复用桌面 `out/renderer/`,不重复构建 | 不增加 CI 时间 |
| `aionui-web start` 默认端口 | 25808(和桌面 `--webui` 保持一致) | 用户心智模型统一 |
| `aionui-web --version` | 从 `packages/web-cli/package.json` 读,或编译时注入 | plan-writer 选 |
| Windows 支持程度 | 产出 zip + 可执行,但本里程碑**不在 Windows CI 冒烟**(`AIONUI_BACKEND_ALLOW_MISSING=1`)|Windows 服务器/Termux 场景次要;M8 保产出、M9 再完善 |
| 容器验证 job | 仅 linux-x86_64,不全平台 | 核心场景覆盖,不过度 |

## 验收标准

**验证分层**(与 playbook checkpoint 语义一致):
- **Executor 放行门禁 - 本地**(push 前必须通过):`packages/web-cli` 骨架、
  tsc、本地开发运行、依赖边界
- **Executor 放行门禁 - CI**(M8 feature 分支 CI 必须绿):5 平台 matrix 的
  tarball 产出 + sha256、tarball 结构正确、容器 smoke job 通过
- **发布链最终验证**(与 executor 放行无关,人类触发真实 release 时):
  tarball + sha256 作为 release asset 实际上传成功;
  `verify-release-assets.sh` 的 "5 个 tarball 及 sha256 存在" 检查通过。
  本层失败不 block M8 handoff 接受,但会 block 最终对外分发

**packages/web-cli 骨架**:

```bash
ls packages/web-cli/package.json \
   packages/web-cli/tsconfig.json \
   packages/web-cli/src/cli.ts \
   packages/web-cli/src/resolveBackendBinary.ts
# 预期:全部存在

# tsc 通过
bunx tsc --noEmit --project packages/web-cli/tsconfig.json
# 预期:退出 0
```

**本地开发运行**(非 CI,用本地 cargo install 的 backend):

```bash
# 启动 CLI(开发期,不走 tarball)
AIONUI_BACKEND_BIN=$(which aionui-backend) \
  bun run --cwd packages/web-cli start -- start --port 8888 --no-open &
CLI_PID=$!
sleep 10

# 验证 HTTP 200
curl -fsS -o /dev/null -w "HTTP_STATUS=%{http_code}\n" http://127.0.0.1:8888/

# 清理
kill $CLI_PID
```

预期:`HTTP_STATUS=200`

**CI 产出 tarball + sha256**:

```bash
# 触发 CI build(或本地用 act 模拟)
# 预期 workflow artifact 和 GitHub Release 均包含:
# - aionui-web-v{version}-linux-x86_64.tar.gz          + .sha256
# - aionui-web-v{version}-linux-aarch64.tar.gz         + .sha256
# - aionui-web-v{version}-darwin-arm64.tar.gz          + .sha256
# - aionui-web-v{version}-darwin-x86_64.tar.gz         + .sha256
# - aionui-web-v{version}-win32-x64.zip                + .sha256

# verify-release-assets.sh 验证
bash scripts/verify-release-assets.sh
# 预期:exit 0,所有 tarball 和 sha256 都到位
```

**tarball 结构**(下载 linux-x86_64 tarball 后):

```bash
tar tzf aionui-web-v*-linux-x86_64.tar.gz | sort
# 预期至少包含:
# aionui-web-v{x}-linux-x86_64/aionui-web
# aionui-web-v{x}-linux-x86_64/aionui-backend
# aionui-web-v{x}-linux-x86_64/renderer/index.html
# aionui-web-v{x}-linux-x86_64/renderer/assets/
# aionui-web-v{x}-linux-x86_64/README.md

# 单文件可执行的权限
tar tzvf aionui-web-v*-linux-x86_64.tar.gz | grep aionui-web$
# 预期:-rwxr-xr-x(可执行)
```

**容器冒烟 job(CI 内置,agent 只需确认 job 存在并绿)**:

```yaml
# .github/workflows/_build-reusable.yml 或独立 workflow 的一个 job
smoke-web-cli-linux:
  runs-on: ubuntu-latest
  needs: build-web-cli
  steps:
    - uses: actions/download-artifact@v4
      with:
        name: aionui-web-linux-x86_64
    - name: Container smoke
      run: |
        docker run --rm -v $PWD:/work debian:slim bash -c '
          cd /work
          tar xzf aionui-web-*-linux-x86_64.tar.gz
          cd aionui-web-*-linux-x86_64
          ./aionui-web --version
          ./aionui-web start --port 8080 --no-open &
          sleep 10
          apt-get update && apt-get install -y curl
          curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/ | grep 200
        '
```

本里程碑 agent 不需要实际跑容器冒烟(CI 会跑),只需确认 workflow 里有
这个 job 且语法正确。

**依赖边界**:

```bash
# web-cli 不直接 import desktop
grep -rn "packages/desktop\|@aionui/desktop" packages/web-cli/src/
# 预期:无输出

# web-cli 只 import web-host
grep -rn "from ['\"]@aionui/" packages/web-cli/src/ | grep -v web-host
# 预期:无输出(只允许 import @aionui/web-host)

# web-cli 不 import electron
grep -rn "from ['\"]electron['\"]" packages/web-cli/src/
# 预期:无输出
```

**桌面不回归**:

```bash
bun run dev &
sleep 20
# 桌面启动正常
```

## 关键风险

| 风险 | 缓解 |
|---|---|
| `bun build --compile` 在某些平台(尤其 ARM)产出异常 | plan-writer 先本机验证 darwin-arm64 / linux-x86_64 两个至少能出二进制;其他平台靠 CI |
| `bun build --compile` 目标单文件无法 load 外部 backend 二进制路径(__dirname 问题) | `resolveBackendBinary.ts` 里用 `process.execPath` 或 `import.meta.url` 推算 tarball 根目录 |
| renderer 静态资源路径相对当前工作目录 vs 相对二进制目录不一致 | `aionui-web` 启动时 `cd path.dirname(process.execPath)` 或传 `staticDir` 绝对路径给 `startWebHost` |
| Windows 的 `bun build --compile` 产出 `.exe` 但 tarball 需要 `.zip` 包装 | CI 对 win32 特殊处理:`bun build --compile --target=bun-windows-x64 --outfile aionui-web.exe` + zip 打包 |
| CI 时间过长(要编译 5 个平台) | 用 matrix 并行,每个平台独立 job |
| backend 下载失败导致 5 个 job 全挂 | 复用 M7 的 `AIONUI_BACKEND_ALLOW_MISSING` 开关,过渡期设 1(但产出会缺 backend,需文档说明) |
| tarball 里的 backend 二进制执行权限丢失(Windows tar 实现) | linux/darwin 用 `tar czf --owner=0 --group=0 --mode=u+rwX,go+rX,go-w`;win32 用 zip 并在 smoke 时 `chmod +x` |
| CI 产出 artifact 和 Release artifact 的命名/路径对不上 | 先看现有 `build-and-release.yml` 怎么上传 dmg,照同样模式 |
| `@aionui/web-host` 的 `WebHostOptions.app` 要求 `userDataPath`,CLI 模式下这个路径应该是 `~/.aionui` 还是 `~/.config/aionui`? | plan-writer 按 XDG 标准:linux `$XDG_DATA_HOME/aionui` 或 `~/.local/share/aionui`;darwin `~/Library/Application Support/aionui`;win32 `%APPDATA%\aionui`。可覆盖:`--data-dir` CLI 参数或 `AIONUI_HOME` env |

## 依赖上游

- **M7 已合入**:`packages/shared-scripts/prepare-aionui-backend.js` 可用;
  `AIONUI_BACKEND_ALLOW_MISSING` 开关已实现
- **M6 已合入**:`@aionui/web-host` 的 `startWebHost` 已完整实现
- **M3 已合入**:web-host 的接口类型签名稳定
- **读 M7 handoff**:取 `prepareBackend()` 的参数签名
- **读 M6 handoff**:确认 `startWebHost` 的最终 API(M3-M6 之间可能扩展过)
- **读 M3 handoff**:取 `WebHostOptions.app.userDataPath` 字段语义

## 分支与 handoff

- 上游分支:`origin/feat/m7-prepare-backend-ci`
- 本里程碑分支:`feat/m8-web-cli-tarball`
- handoff 位置:`docs/backend-migration/handoffs/M8-outcome.md`
- handoff 必须附:
  - `aionui-web start` 的 `AppMetadata` 注入代码片段(给 M9 install.sh 参考)
  - tarball 结构的最终版(给 M9 install.sh 解压逻辑参考)
  - 容器冒烟 job 的 workflow 路径
- 完成后 push 前:必须 `git merge origin/feat/backend-migration`

## 预计执行时间

8-12 小时(CLI 实现 + CI matrix 扩展 + 5 平台打包验证 + 容器冒烟。主要
时间在 CI 调试,本机只能验证 2 个平台)
