# WebUI 脱 Electron 文档复审收尾

- **日期**: 2026-05-07
- **背景**:
  - 第一轮审查记录见
    [`2026-05-07-webui-decouple-doc-review.md`](./2026-05-07-webui-decouple-doc-review.md)
  - 中间补充记录见
    [`2026-05-07-webui-decouple-doc-review-followup.md`](./2026-05-07-webui-decouple-doc-review-followup.md)
- **目的**: 记录最新一轮复审后仍然剩余的 2 个小问题，方便继续收尾

## 结论

当前这组迁移文档的大部分关键冲突已经收口。

剩下的问题已经不是架构方向或职责划分层面的分歧，而是**局部文档没有完全同步到最新决定**。这 2 个问题建议继续修掉，避免 executor 在实施阶段被旧清单或旧步骤误导。

## 问题 1: M5 的文件清单仍然是旧 auth 文件结构

### 现状

M5 的正文已经明确把 auth 迁移后的结构写成:

- `auth/config.ts`
- `auth/session.ts`
- `auth/index.ts`

并且已经明确 `auth/index.ts` 负责实现 M3 中定义的占位公共函数。

但 M5 的“文件清单”验收仍然在检查旧结构:

- `packages/web-host/src/auth/login.ts`
- `packages/web-host/src/auth/resetPassword.ts`

### 风险

这会带来两个直接问题:

1. executor 会不知道最终该交哪套结构
2. 就算实现已经按正文完成，验收也会因为检查旧文件名而误判失败

### 涉及位置

- [`2026-05-07-m5-static-server-auth-migration-requirements.md`](../plans/2026-05-07-m5-static-server-auth-migration-requirements.md) 第 23-34 行
- [`2026-05-07-m5-static-server-auth-migration-requirements.md`](../plans/2026-05-07-m5-static-server-auth-migration-requirements.md) 第 146-153 行

### 建议改法

把 M5 的“文件清单”同步成和正文一致的文件结构，例如:

```bash
ls packages/web-host/src/static-server.ts
ls packages/web-host/src/auth/config.ts
ls packages/web-host/src/auth/session.ts
ls packages/web-host/src/auth/index.ts
ls packages/desktop/src/process/webserver/  # 应仍存在
```

如果团队最终还是想保留 `auth/login.ts` / `auth/resetPassword.ts` 这套拆分方式，也可以反向调整正文。但无论选哪套，**正文、验收、handoff 口径必须完全一致**。

## 问题 2: M9 的本地容器 smoke 里，前置产物和实际执行脚本不一致

### 现状

M9 现在已经把本地容器 smoke 收敛成可机械执行的门禁，这是明显进步。

但当前步骤里还有一个小的不一致:

1. 前置说明要求 `/tmp/m9-mirror/` 里准备:
   - tarball
   - tarball `.sha256`
   - `install-web.sh`(并且是 **sed 替换过 `__VERSION__`** 的版本)
2. 实际容器命令执行的却是:
   - `bash /scripts/install-web.sh --mirror file:///mirror/ --no-path`

也就是说，文档要求准备的“已注入版本号的 `install-web.sh`”并没有被实际使用。

### 风险

这会导致执行者产生困惑:

- 到底容器 smoke 依赖的是 `/mirror/install-web.sh`
- 还是仓库工作区下的 `/scripts/install-web.sh`

如果两份脚本内容不一致，验证结果会失真。

### 涉及位置

- [`2026-05-07-m9-install-web-script-requirements.md`](../plans/2026-05-07-m9-install-web-script-requirements.md) 第 105-130 行

### 建议改法

建议二选一，统一成单一路径:

1. **方案 A**
   - 继续执行 `/scripts/install-web.sh`
   - 那就删掉前置条件里“`/tmp/m9-mirror/` 需要包含 install-web.sh”这条
   - 同时删掉“sed 替换过 `__VERSION__`”这个要求

2. **方案 B**
   - 容器里明确执行 `/mirror/install-web.sh`
   - 那就保留前置条件里“镜像目录内包含已替换版本号的脚本”

从当前文档目标看，我更推荐 **方案 A**，因为本地 smoke 的重点是验证:

- `--mirror file://...` 是否可用
- tarball 与 `.sha256` 是否能被正确消费
- 安装后 `aionui-web --version` 是否可执行

这些都不要求额外复制一份 `install-web.sh` 到 mirror 目录。

## 建议优先级

### P1

- 问题 1: M5 文件清单同步
- 问题 2: M9 smoke 使用哪份 `install-web.sh` 统一口径

## 建议的最小修法

如果只想最小成本收尾，可以这样改:

1. 改 M5 的“文件清单”一处
2. 改 M9 的本地容器 smoke 前置说明或执行命令一处

这两步做完后，当前文档层面的残留冲突基本可以视为清空。
