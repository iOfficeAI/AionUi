# CI Web-CLI Release Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `aionui-web` 的 5 平台 tarball、对应 `.sha256` 校验文件和版本化 `install-web.sh`,随每次 AionUi release(dev 分支 push 或正式 tag push)与桌面 dmg/exe/deb 同 release 一并产出。

**Architecture:** 把现有 `.github/workflows/pack-web-cli.yml`(目前只在 feature 分支上单飞)改造成 `workflow_call` 形态的 reusable workflow,在 `.github/workflows/build-and-release.yml` 中与桌面 `_build-reusable.yml` 并行调用;`scripts/prepare-release-assets.sh` 扩展为能归集 tarball / `.sha256` / `install-web.sh`;`_build-reusable.yml` 新增 `asar list` 校验确保桌面产物不含 `packages/web-cli/` 残留。**现有产物命名规则完全不动**,本方案只做流水线接线。

**Tech Stack:** GitHub Actions(reusable workflows),Bash,Node.js 22(`scripts/pack-web-cli.js`、`scripts/prepare-release-assets.sh`),`@electron/asar` 隔离校验

---

## 背景与约束(零上下文会话必读)

**本方案的位置**:`docs/backend-migration/plans/2026-05-07-webui-decouple-electron-design.md` 定义了 WebUI 脱 Electron 的 M1-M9 里程碑,M1-M9 已于 commit `a677b8647` 合入;M8 在 `pack-web-cli.yml` 里完成了 5 平台 tarball 打包能力,但只绑 `feat/m8-web-cli-tarball` 分支,**尚未接入主 release 流程**。本 plan 把这最后一公里接通。

**现有产物命名(来自 v1.9.25 release,完全沿用不改)**:

桌面(`_build-reusable.yml` + electron-builder):

```
AionUi-<ver>-linux-amd64.deb           AionUi-<ver>-linux-arm64.deb
AionUi-<ver>-mac-arm64.dmg  / .zip     AionUi-<ver>-mac-x64.dmg  / .zip
AionUi-<ver>-win-arm64.exe             AionUi-<ver>-win-x64.exe
latest.yml              latest-mac.yml          latest-linux.yml
latest-linux-arm64.yml  latest-win-arm64.yml    latest-arm64-mac.yml
```

aionui-web(`scripts/pack-web-cli.js:19` 现有命名规则):

```
aionui-web-<ver>-darwin-arm64.tar.gz    + .sha256
aionui-web-<ver>-darwin-x86_64.tar.gz   + .sha256
aionui-web-<ver>-linux-arm64.tar.gz     + .sha256
aionui-web-<ver>-linux-x86_64.tar.gz    + .sha256
aionui-web-<ver>-win-x86_64.tar.gz      + .sha256
```

安装脚本:`install-web.sh`(由 `pack-web-cli.yml` 的 `prepare-install-script` job 用 `sed` 把 `scripts/install-web.sh` 内的 `__VERSION__` 替换为实际版本号后生成)

> aionui-web 使用 `darwin / x86_64` 命名,桌面使用 `mac / x64` 命名 —— **两套体系并存,本方案不合并**。

**决策锁定**(来自上游 brainstorming):

| 项                             | 决定                                                            |
| ------------------------------ | --------------------------------------------------------------- |
| web-cli CI 接入方式            | `pack-web-cli.yml` 改 reusable,`build-and-release.yml` 并行调用 |
| 产物命名                       | **沿用现状,不改**                                               |
| `AIONUI_BACKEND_ALLOW_MISSING` | **保持 `'1'`**(backend Release CI 不稳,不卡前端改造)            |
| `install-web.sh` 分发          | 仅 GitHub Release Asset                                         |
| 产物隔离校验                   | `_build-reusable.yml` 加 `asar list` grep 校验                  |
| `.sha256`                      | 沿用现状(`pack-web-cli.js` 已生成),上传到 Release               |

**非目标**:

- 不改产物命名规则(上面列出的 25 个 asset 名都不动)
- 不改 `pack-web-cli.js` 内部逻辑(tarball 内容组装保持现状)
- 不收紧 `AIONUI_BACKEND_ALLOW_MISSING`(待 backend Release CI 稳定后另行处理)
- 不合并 `pack-web-cli.yml` 和 `_build-reusable.yml`(两条 pipeline 解耦,一边挂了不阻塞另一边的产出)

---

## 文件结构与职责

**改动 4 个文件,新增 1 个 handoff 文档**:

| #   | 文件                                                            | 职责                                                                                                                                                    |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `.github/workflows/pack-web-cli.yml`                            | 改为 reusable(`on: workflow_call`),暴露 `ref` / `append_commit_hash` 入参;保留 pack / prepare-install-script / smoke-test / smoke-test-install 四个 job |
| 2   | `.github/workflows/build-and-release.yml`                       | 新增 `pack-web-cli` job 并行调用新 reusable;`create-tag` / `release` 的 `needs` 增加此 job;`release.files` 追加 tarball / sha256 / install-web.sh       |
| 3   | `scripts/prepare-release-assets.sh`                             | 扩展为能从 `build-artifacts/web-cli-*/` 和 `build-artifacts/install-web-script/` 归集 11 个新产物到 `release-assets/`,含硬校验                          |
| 4   | `.github/workflows/_build-reusable.yml`                         | upload 前加 `asar list` grep 校验,防止桌面 asar 混入 `packages/web-cli/` 文件                                                                           |
| 5   | `docs/backend-migration/handoffs/ci-web-cli-release-outcome.md` | 新增 handoff,记录改动、未来 backend CI 稳定后要收紧的 TODO                                                                                              |

**不动的文件**(关键,避免发散):

- `scripts/pack-web-cli.js`(命名规则和产物在此定义,不动)
- `scripts/install-web.sh`(源文件保留,CI 替换 `__VERSION__` 生成发布版)
- `scripts/prepareAionuiBackend.js`(`AIONUI_BACKEND_ALLOW_MISSING` 逻辑已就绪)

---

## Task 1: pack-web-cli.yml 改 reusable

**Files:**

- Modify: `.github/workflows/pack-web-cli.yml`

- [ ] **Step 1: 备份当前 workflow,理清现有结构**

```bash
cp .github/workflows/pack-web-cli.yml .github/workflows/pack-web-cli.yml.bak
grep -n '^  [a-z-]*:\|^    name:\|^on:\|^    uses:' .github/workflows/pack-web-cli.yml.bak
```

Expected:能看到 4 个 job(`pack-web-cli`、`prepare-install-script`、`smoke-test`、`smoke-test-install`)和当前的 `on: push: branches: [feat/m8-web-cli-tarball]` + `workflow_dispatch` 触发。

- [ ] **Step 2: 改触发为 workflow_call,加入参**

把文件开头的 `on:` 段替换为:

```yaml
on:
  workflow_call:
    inputs:
      ref:
        description: 'Git ref to checkout (leave empty to use the triggering commit)'
        type: string
        default: ''
      append_commit_hash:
        description: 'Append short commit hash to artifact names'
        type: boolean
        default: false
  workflow_dispatch:
    inputs:
      ref:
        description: 'Git ref to checkout (leave empty to use the triggering commit)'
        type: string
        default: ''
```

删除原有的 `push:` 触发。

- [ ] **Step 3: 所有 checkout 步骤使用 inputs.ref**

文件里共 4 处 `uses: actions/checkout@v6`(pack-web-cli / prepare-install-script / smoke-test / smoke-test-install)。每一处的 `with:` 都加上:

```yaml
- name: Checkout code
  uses: actions/checkout@v6
  with:
    ref: ${{ inputs.ref }}
```

(`inputs.ref` 为空时 actions/checkout 默认用触发 commit,行为与原来一致。)

- [ ] **Step 4: pack-web-cli job 的 upload-artifact 支持 append_commit_hash**

找到 `pack-web-cli` job 最后的 upload 步骤,改 `name` 字段:

```yaml
- name: Upload tarball artifact
  uses: actions/upload-artifact@v6
  with:
    name: ${{ inputs.append_commit_hash && format('web-cli-{0}-{1}-{2}', matrix.platform, matrix.arch, steps.commit.outputs.short) || format('web-cli-{0}-{1}', matrix.platform, matrix.arch) }}
    path: |
      dist-web-cli/*.tar.gz
      dist-web-cli/*.sha256
    retention-days: 7
```

并在该 job checkout 之后新增一步拿 commit hash(如果尚未存在):

```yaml
- name: Get commit hash
  id: commit
  shell: bash
  run: |
    SHORT=$(git rev-parse --short HEAD)
    echo "short=$SHORT" >> $GITHUB_OUTPUT
```

- [ ] **Step 5: prepare-install-script job 的 upload 也支持 append_commit_hash**

```yaml
- name: Upload install-web.sh artifact
  uses: actions/upload-artifact@v6
  with:
    name: ${{ inputs.append_commit_hash && format('install-web-script-{0}', steps.commit.outputs.short) || 'install-web-script' }}
    path: dist-scripts/install-web.sh
    retention-days: 7
```

并在该 job checkout 之后同样加一步 `Get commit hash`(复制 Step 4 的 snippet)。

- [ ] **Step 6: 本地 YAML 语法校验**

```bash
bunx yaml-validator .github/workflows/pack-web-cli.yml 2>/dev/null \
  || python3 -c "import yaml; yaml.safe_load(open('.github/workflows/pack-web-cli.yml'))"
```

Expected:无报错退出。

- [ ] **Step 7: Commit**

```bash
rm .github/workflows/pack-web-cli.yml.bak
git add .github/workflows/pack-web-cli.yml
git commit -m "ci(web-cli): convert pack-web-cli to reusable workflow"
```

---

## Task 2: build-and-release.yml 并挂 pack-web-cli

**Files:**

- Modify: `.github/workflows/build-and-release.yml`

- [ ] **Step 1: 读当前文件结构**

```bash
grep -n '^  [a-z-]*:$\|^    name:\|^    needs:\|^    uses:\|^    if:' .github/workflows/build-and-release.yml
```

Expected:可见 `build-pipeline` / `auto-retry-workflow` / `create-tag` / `release` 四个 job,`build-pipeline` 无 needs,`create-tag.needs: [build-pipeline]`,`release.needs: [build-pipeline, create-tag]`。

- [ ] **Step 2: 在 build-pipeline job 之后插入 pack-web-cli job**

找到 `build-pipeline` job 的结尾(`secrets: inherit` 一行后的空行),在 `auto-retry-workflow` 之前插入:

```yaml
pack-web-cli:
  name: Pack Web CLI
  uses: ./.github/workflows/pack-web-cli.yml
  if: github.ref == 'refs/heads/dev' || (startsWith(github.ref, 'refs/tags/') && !contains(github.ref, '-dev-'))
  with:
    ref: ''
    append_commit_hash: false
  secrets: inherit
```

> 注:与 `build-pipeline` 的触发条件严格一致,保证两条 pipeline 同频;`needs` 留空使两者并行执行,单边挂掉不阻塞另一边产出。

- [ ] **Step 3: 让 release job 也依赖 pack-web-cli**

找到 `release` job 的 `needs:` 行,改为:

```yaml
release:
  name: Create Release
  runs-on: ubuntu-latest
  needs: [build-pipeline, create-tag, pack-web-cli]
```

并把紧随其下的 `if:` 行扩展为:

```yaml
if: always() && needs.build-pipeline.result == 'success' && needs.pack-web-cli.result == 'success' && (needs.create-tag.result == 'success' || (startsWith(github.ref, 'refs/tags/') && !contains(github.ref, '-dev-')))
```

> 若 `pack-web-cli` 挂了就不发 release(因为产物不完整);`needs.create-tag` 条件保持原状。

- [ ] **Step 4: release job 的 files 追加 web-cli 产物**

找到 `softprops/action-gh-release@v2` 的 `with.files:` 块,在原有 6 行后追加 3 行:

```yaml
files: |
  release-assets/**/*.exe
  release-assets/**/*.msi
  release-assets/**/*.dmg
  release-assets/**/*.deb
  release-assets/**/*.zip
  release-assets/**/*.yml
  release-assets/**/*.tar.gz
  release-assets/**/*.sha256
  release-assets/install-web.sh
```

- [ ] **Step 5: YAML 语法校验**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/build-and-release.yml'))"
```

Expected:无报错。

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/build-and-release.yml
git commit -m "ci(release): run pack-web-cli alongside desktop build and publish web artifacts"
```

---

## Task 3: prepare-release-assets.sh 支持 tarball / install-web.sh 归集

**Files:**

- Modify: `scripts/prepare-release-assets.sh`

- [ ] **Step 1: 新增 web-cli 归集节(第 1 节与第 2 节之间)**

在 `scripts/prepare-release-assets.sh` 的第 43 行(桌面 distributables 循环结尾的空行)之后,插入新的"1b) Copy web-cli tarballs and checksums"节:

```bash
# ---------------------------------------------------------------------------
# 1b) Copy web-cli tarballs (+ sha256 checksums)
# ---------------------------------------------------------------------------
echo "==> Copying web-cli tarballs from $ARTIFACTS_DIR ..."
mapfile -t WEB_CLI_FILES < <(find "$ARTIFACTS_DIR" -type f \( \
  -name "aionui-web-*.tar.gz" -o \
  -name "aionui-web-*.tar.gz.sha256" \
\) | sort)

WEB_CLI_DUPS=$(for file in "${WEB_CLI_FILES[@]}"; do basename "$file"; done | sort | uniq -d || true)
if [ -n "$WEB_CLI_DUPS" ]; then
  echo "::error::Duplicate web-cli artifact basenames:"
  echo "$WEB_CLI_DUPS"
  exit 1
fi

for file in "${WEB_CLI_FILES[@]}"; do
  cp -f "$file" "$OUTPUT_DIR/"
done

# ---------------------------------------------------------------------------
# 1c) Copy install-web.sh (version-substituted)
# ---------------------------------------------------------------------------
echo "==> Copying install-web.sh ..."
INSTALL_SCRIPT=$(find "$ARTIFACTS_DIR" -type f -name 'install-web.sh' | head -n 1 || true)
if [ -n "$INSTALL_SCRIPT" ]; then
  cp -f "$INSTALL_SCRIPT" "$OUTPUT_DIR/install-web.sh"
  chmod +x "$OUTPUT_DIR/install-web.sh"
fi
```

- [ ] **Step 2: 在第 5 节硬校验追加 web-cli 必需文件校验**

找到 `scripts/prepare-release-assets.sh` 末尾 `for required in latest.yml ...` 的循环,紧随其后添加:

```bash
# ---------------------------------------------------------------------------
# 5b) Hard validation for web-cli release assets
# ---------------------------------------------------------------------------
echo "==> Validating web-cli assets ..."

VERSION=$(node -p "require('./package.json').version")
WEB_PLATFORMS=(
  "darwin-arm64"
  "darwin-x86_64"
  "linux-arm64"
  "linux-x86_64"
  "win-x86_64"
)

for plat in "${WEB_PLATFORMS[@]}"; do
  tarball="aionui-web-${VERSION}-${plat}.tar.gz"
  if [ ! -f "$OUTPUT_DIR/$tarball" ]; then
    echo "::error::Missing web-cli tarball: $tarball"
    MISSING=1
  fi
  if [ ! -f "$OUTPUT_DIR/${tarball}.sha256" ]; then
    echo "::error::Missing web-cli checksum: ${tarball}.sha256"
    MISSING=1
  fi
done

if [ ! -f "$OUTPUT_DIR/install-web.sh" ]; then
  echo "::error::Missing install-web.sh"
  MISSING=1
fi

if [ "$MISSING" -ne 0 ]; then
  exit 1
fi
```

> 校验动态从 `package.json` 读版本号,不硬编码,避免 bump 版本时漏改。

- [ ] **Step 3: 本地 dry-run 校验脚本可执行性**

```bash
bash -n scripts/prepare-release-assets.sh
echo "exit=$?"
```

Expected:`exit=0`,语法无误。

- [ ] **Step 4: 用假 artifacts 验证脚本能正确归集**

```bash
VER=$(node -p "require('./package.json').version")
rm -rf /tmp/test-artifacts /tmp/test-release
mkdir -p /tmp/test-artifacts/macos-build-arm64 /tmp/test-artifacts/web-cli-darwin-arm64 /tmp/test-artifacts/install-web-script

# 造 dummy 桌面产物
touch "/tmp/test-artifacts/macos-build-arm64/AionUi-${VER}-mac-arm64.dmg"
cat > /tmp/test-artifacts/macos-build-arm64/latest-mac.yml <<EOF
version: ${VER}
EOF

# 造完整 5 平台 web-cli 产物(脚本校验要求全)
for plat in darwin-arm64 darwin-x86_64 linux-arm64 linux-x86_64 win-x86_64; do
  mkdir -p "/tmp/test-artifacts/web-cli-${plat}"
  touch "/tmp/test-artifacts/web-cli-${plat}/aionui-web-${VER}-${plat}.tar.gz"
  touch "/tmp/test-artifacts/web-cli-${plat}/aionui-web-${VER}-${plat}.tar.gz.sha256"
done

# install-web.sh
echo "#!/usr/bin/env bash" > /tmp/test-artifacts/install-web-script/install-web.sh

# 脚本期望 4 个 canonical latest*.yml 全部存在,造齐避免噪音
for yml in latest.yml latest-linux.yml latest-linux-arm64.yml; do
  mkdir -p "/tmp/test-artifacts/${yml%.yml}-placeholder"
done
mkdir -p /tmp/test-artifacts/windows-build-x64 /tmp/test-artifacts/linux-build-x64 /tmp/test-artifacts/linux-build-arm64
cat > /tmp/test-artifacts/windows-build-x64/latest.yml <<EOF
version: ${VER}
EOF
cat > /tmp/test-artifacts/linux-build-x64/latest-linux.yml <<EOF
version: ${VER}
EOF
cat > /tmp/test-artifacts/linux-build-arm64/latest-linux-arm64.yml <<EOF
version: ${VER}
EOF

bash scripts/prepare-release-assets.sh /tmp/test-artifacts /tmp/test-release
echo "---"
ls /tmp/test-release/ | sort
```

Expected:末尾 `ls` 输出应包含 5 个 `.tar.gz`、5 个 `.sha256`、1 个 `install-web.sh`、4 个 `latest*.yml` 以及 1 个 `.dmg`,脚本退出码 0。

- [ ] **Step 5: 清理临时测试数据**

```bash
rm -rf /tmp/test-artifacts /tmp/test-release
```

- [ ] **Step 6: Commit**

```bash
git add scripts/prepare-release-assets.sh
git commit -m "ci(release): collect and validate web-cli tarballs + install-web.sh"
```

---

## Task 4: \_build-reusable.yml 加 asar 隔离校验

**Files:**

- Modify: `.github/workflows/_build-reusable.yml`

- [ ] **Step 1: 定位插入点**

```bash
grep -n 'List build artifacts\|Upload build artifacts\|Clean up non-installer' .github/workflows/_build-reusable.yml
```

Expected:三行编号分别在 531、566、555 附近。隔离校验要加在 `List build artifacts` 之后、`Clean up non-installer artifacts` 之前(大约 545 行附近)。

- [ ] **Step 2: 插入 asar 隔离校验步骤**

在 `List build artifacts` 步骤结束后(即 `find out/ -type f ...` 行所在步骤结束后),插入新 step:

```yaml
- name: Verify desktop asar isolation
  if: >-
    success() &&
    (!startsWith(matrix.platform, 'windows') || steps.windows-build.outputs.result == 'success')
  shell: bash
  run: |
    set -euo pipefail
    ASAR=$(find out -type f -name 'app.asar' -not -path '*node_modules*' | head -n 1 || true)
    if [ -z "$ASAR" ]; then
      echo "::notice::No app.asar found for ${{ matrix.platform }}, skipping isolation check"
      exit 0
    fi
    echo "Inspecting $ASAR for web-cli leakage..."
    LEAK_COUNT=$(bunx @electron/asar list "$ASAR" 2>/dev/null | grep -cE '^/packages/web-cli(/|$)' || true)
    if [ "$LEAK_COUNT" != "0" ]; then
      echo "::error::Desktop asar contains $LEAK_COUNT web-cli entries:"
      bunx @electron/asar list "$ASAR" | grep -E '^/packages/web-cli(/|$)' | head -20
      exit 1
    fi
    echo "✅ asar isolation verified: no packages/web-cli entries"
```

> 关键点:
>
> - `if:` 条件与下方 `Upload build artifacts` 一致(Windows 需 windows-build 成功),保证失败构建不跑此校验
> - 用 `@electron/asar` 包而非 `asar`(前者是现行命名,避免解析歧义)
> - `grep -cE '^/packages/web-cli(/|$)'` 精确匹配路径前缀,不会误伤 `packages/web-host`
> - `|| true` 防止 grep 无匹配时 `-e` 模式下异常退出

- [ ] **Step 3: YAML 语法校验**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/_build-reusable.yml'))"
```

Expected:无报错。

- [ ] **Step 4: 本地用实际 asar 产物烟测校验脚本(可选但强烈建议)**

如果本地有已打包的 `out/mac-arm64/AionUi.app/Contents/Resources/app.asar`:

```bash
ASAR=$(find out -type f -name 'app.asar' -not -path '*node_modules*' | head -n 1)
[ -n "$ASAR" ] && bunx @electron/asar list "$ASAR" | grep -cE '^/packages/web-cli(/|$)' || echo "no local asar to test"
```

Expected:输出 `0` 或 `no local asar to test`。

> 如果此时输出非 0,说明桌面 `packages/desktop/package.json` 依赖声明有问题导致 web-cli 代码被 hoisted 进桌面打包路径 —— 需要先修依赖再继续,否则后续 CI 会一直红。

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/_build-reusable.yml
git commit -m "ci(desktop): verify asar does not contain web-cli entries"
```

---

## Task 5: 新增 handoff 文档

**Files:**

- Create: `docs/backend-migration/handoffs/ci-web-cli-release-outcome.md`

- [ ] **Step 1: 写 handoff 内容**

```bash
mkdir -p docs/backend-migration/handoffs
```

写入 `docs/backend-migration/handoffs/ci-web-cli-release-outcome.md`:

```markdown
# CI Web-CLI Release Integration — Handoff

**Date:** 2026-05-08
**Scope:** 把 `aionui-web` tarball / `install-web.sh` 接入主 release 流程

## 改动摘要

- `.github/workflows/pack-web-cli.yml`:触发改 `workflow_call`,删除 `feat/m8-web-cli-tarball` 分支绑定;加 `ref` / `append_commit_hash` 入参
- `.github/workflows/build-and-release.yml`:新增 `pack-web-cli` 并行 job;`release.needs` / `release.files` 追加
- `scripts/prepare-release-assets.sh`:新增 1b(tarball + sha256 归集)、1c(install-web.sh 归集)、5b(硬校验 5×2 + install-web.sh)三节
- `.github/workflows/_build-reusable.yml`:桌面 upload 前加 `asar list` 校验

## 每次 release 产出的新 asset
```

aionui-web-<ver>-darwin-arm64.tar.gz + .sha256
aionui-web-<ver>-darwin-x86_64.tar.gz + .sha256
aionui-web-<ver>-linux-arm64.tar.gz + .sha256
aionui-web-<ver>-linux-x86_64.tar.gz + .sha256
aionui-web-<ver>-win-x86_64.tar.gz + .sha256
install-web.sh

```

现有 14 个桌面 asset 完全不变,新增 11 个 web-cli asset。

## 未解决的 TODO

- **`AIONUI_BACKEND_ALLOW_MISSING='1'` 仍硬编码**(`_build-reusable.yml:312`、新 `pack-web-cli.yml`):等 `iOfficeAI/aionui-backend` 的 Release CI 稳定后,改为按分支区分(main / tag 硬失败,feature 分支放行)
- **`scripts/install-web.sh` 的完整性校验分支**:未来 install-web.sh 应该在下载 tarball 后对比 `.sha256`,当前脚本未校验(非本 plan 范围)
- **Windows tarball 用 `.tar.gz` 而非 `.zip`**:与设计文档 G 节 `*.zip` 的描述有出入,以脚本行为为准;如需 `.zip` 可后续独立加一条 pack job

## 验收记录

在 `feat/backend-migration` 分支推测试 tag `v0.0.0-ci-wire-test` 验证:
- [ ] release draft 同时含 14 个桌面 asset + 11 个 web-cli asset
- [ ] `asar list` 校验 step 在桌面矩阵每个平台执行且通过
- [ ] 产物命名与本文档"新 asset"清单完全一致
- [ ] 验收完毕后 `gh release delete v0.0.0-ci-wire-test --yes && git push --delete origin v0.0.0-ci-wire-test`
```

- [ ] **Step 2: Commit**

```bash
git add docs/backend-migration/handoffs/ci-web-cli-release-outcome.md
git commit -m "docs(backend-migration): handoff for ci web-cli release wiring"
```

---

## Task 6: 分支级端到端烟测(不创建正式 release)

**目的:** 在不污染正式 release 列表的前提下,验证整条 pipeline 能正常跑通并产出完整 25 个 asset。

**Files:**(不改文件,只跑命令)

- [ ] **Step 1: 在当前分支创建测试 tag**

```bash
git tag v0.0.0-ci-wire-test
git push origin v0.0.0-ci-wire-test
```

> 触发条件:`startsWith(github.ref, 'refs/tags/') && !contains(github.ref, '-dev-')` —— 此 tag 会触发完整 release flow。

- [ ] **Step 2: 在 GitHub Actions 监控 build-and-release workflow**

```bash
gh run list --workflow=build-and-release.yml --limit 3
gh run watch  # 选中最新一次
```

Expected:三个 job 都通过 —— `build-pipeline`(桌面 6 矩阵)、`pack-web-cli`(web-cli 5 矩阵 + install-web 准备)、`release`。

- [ ] **Step 3: 验证 release draft 的 asset 清单**

```bash
gh release view v0.0.0-ci-wire-test --json assets --jq '.assets[].name' | sort
```

Expected(25 项):

```
AionUi-0.0.0-linux-amd64.deb
AionUi-0.0.0-linux-arm64.deb
AionUi-0.0.0-mac-arm64.dmg
AionUi-0.0.0-mac-arm64.zip
AionUi-0.0.0-mac-x64.dmg
AionUi-0.0.0-mac-x64.zip
AionUi-0.0.0-win-arm64.exe
AionUi-0.0.0-win-x64.exe
aionui-web-0.0.0-darwin-arm64.tar.gz
aionui-web-0.0.0-darwin-arm64.tar.gz.sha256
aionui-web-0.0.0-darwin-x86_64.tar.gz
aionui-web-0.0.0-darwin-x86_64.tar.gz.sha256
aionui-web-0.0.0-linux-arm64.tar.gz
aionui-web-0.0.0-linux-arm64.tar.gz.sha256
aionui-web-0.0.0-linux-x86_64.tar.gz
aionui-web-0.0.0-linux-x86_64.tar.gz.sha256
aionui-web-0.0.0-win-x86_64.tar.gz
aionui-web-0.0.0-win-x86_64.tar.gz.sha256
install-web.sh
latest-arm64-mac.yml
latest-linux-arm64.yml
latest-linux.yml
latest-mac.yml
latest-win-arm64.yml
latest.yml
```

> 版本号 `0.0.0` 会因 `package.json` 当前版本不同而变化;关键是结构与个数。

- [ ] **Step 4: 清理测试 release 与 tag**

```bash
gh release delete v0.0.0-ci-wire-test --yes
git push --delete origin v0.0.0-ci-wire-test
git tag -d v0.0.0-ci-wire-test
```

- [ ] **Step 5: 在 handoff 文档勾选验收项**

手动编辑 `docs/backend-migration/handoffs/ci-web-cli-release-outcome.md`,把 4 个 `- [ ]` 全部改为 `- [x]`,追加一行"验收于 YYYY-MM-DD 完成"。

- [ ] **Step 6: Commit 验收记录**

```bash
git add docs/backend-migration/handoffs/ci-web-cli-release-outcome.md
git commit -m "docs(backend-migration): mark ci web-cli release wiring as verified"
```

---

## 全量本地验证(所有 task 完成后一次性跑)

```bash
# YAML 语法
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/pack-web-cli.yml'))"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/build-and-release.yml'))"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/_build-reusable.yml'))"

# Shell 语法
bash -n scripts/prepare-release-assets.sh

# prek(CI 模拟)
prek run --from-ref origin/feat/backend-migration --to-ref HEAD

# 现有单元/集成测试不回退
bun run test
```

全部绿色视为通过。

## 回滚

每个 task 是独立 commit。单点回滚:

```bash
git revert <commit-sha>
```

完整回滚(撤销所有 5 个代码 commit,保留 handoff 作为备忘):

```bash
git revert <task5-commit>..<task1-commit>  # 注意顺序反向
```

或者如果改动还没 push,直接 `git reset --hard <before-task1>` 回到起点。

## 自检

**1. 需求覆盖**(对照设计文档 G 节 + 用户锁定的决策):

| 需求                                            | 对应 Task                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| 每次 AionUi release 同时产出 aionui-web tarball | Task 1 + Task 2                                                         |
| 沿用现有产物命名规则                            | Task 3 硬校验用 `package.json.version` 动态,不改 `pack-web-cli.js` 命名 |
| 5 个 `.sha256` 上传到 Release                   | Task 3 步骤 1(web-cli 归集节)                                           |
| install-web.sh 作为 Release Asset               | Task 3 步骤 1(install-web.sh 节) + Task 2 步骤 4                        |
| 桌面产物不含 `packages/web-cli/` 残留           | Task 4                                                                  |
| `AIONUI_BACKEND_ALLOW_MISSING` 保持 `'1'`       | Task 1 / Task 2 / Task 4 **均未触碰**此变量                             |
| 与桌面解耦、单边挂不阻塞另一边                  | Task 2 步骤 2:`pack-web-cli.needs:` 为空,与 `build-pipeline` 并行       |

**2. 占位符扫描**:全文无 TBD / TODO / "implement later" / "handle edge cases";每个 code step 都有完整代码块;所有 `expected` 输出都写了具体内容。

**3. 类型与命名一致性**:

- Artifact 名:`web-cli-${platform}-${arch}`(Task 1 step 4)↔ `find ... web-cli-*/` 归集(Task 3 step 1)✓
- install-web artifact 名:`install-web-script`(Task 1 step 5)↔ `find ... install-web.sh`(Task 3 step 1)✓
- 校验平台列表:`darwin-arm64 / darwin-x86_64 / linux-arm64 / linux-x86_64 / win-x86_64`(Task 3 step 2)与 `pack-web-cli.js:14-15` 的 `platformMap / archMap` 产物一致 ✓
- release.files 匹配:`release-assets/**/*.tar.gz`(Task 2 step 4)覆盖 `aionui-web-*.tar.gz` ✓;`release-assets/install-web.sh`(Task 2 step 4)精确匹配 `$OUTPUT_DIR/install-web.sh`(Task 3)✓
