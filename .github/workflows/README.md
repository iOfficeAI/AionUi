# GPT Workflows

本项目使用 GPT 驱动的 GitHub Actions 工作流辅助 PR 审查。

## 架构概览

```
.github/
├── actions/                          # 公共 Composite Actions
│   ├── gather-pr-diff/action.yml     # 收集 PR diff 和变更文件列表
│   ├── read-file-contents/action.yml # 按优先级读取变更文件内容
│   └── call-openai/action.yml        # 调用 OpenAI API（含重试逻辑）
└── workflows/
    ├── gpt-review.yml                # 代码质量审查
    ├── gpt-pr-assessment.yml         # PR 价值评估
    └── pr-checks.yml                 # PR 检查入口（触发 gpt-review + gpt-pr-assessment）
```

## 两个 GPT 工作流对比

|              | GPT Review                                                            | GPT PR Assessment                                                          |
| ------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **目的**     | 代码质量审查（bug、安全、性能）                                       | 维护者价值评估（合并优先级、风险）                                         |
| **角色**     | 代码审查专家                                                          | 项目维护者 / 技术负责人                                                    |
| **触发**     | PR 创建时自动触发（via pr-checks.yml）+ 手动触发（workflow_dispatch） | 外部贡献者 PR 自动触发（via pr-checks.yml）+ 手动触发（workflow_dispatch） |
| **额外数据** | 无                                                                    | 关联 Issue 内容                                                            |
| **输出方式** | PR Review（createReview）                                             | Issue Comment（可更新，不重复创建）                                        |
| **输出模板** | 按严重性分级的问题列表                                                | 7 维度结构化评估报告                                                       |

## 公共 Actions

三个 Composite Action 封装了两个工作流的公共逻辑，避免重复代码：

### `gather-pr-diff`

收集 PR 的 diff 和变更文件列表。

- **输入**: `pr_number`（手动触发时需要）
- **输出**: `skip`, `pr_number`, `additions`, `deletions`, `total_lines`, `file_count`, `diff_truncated`
- **临时文件**: `pr_diff.txt`, `file_list.json`（写入 `RUNNER_TEMP`）

### `read-file-contents`

按优先级顺序读取变更文件的完整内容，供 GPT 做跨文件分析。

- **输出**: `contents_truncated`
- **临时文件**: `file_contents.txt`（写入 `RUNNER_TEMP`）
- **前置条件**: 需要先运行 `checkout` 和 `gather-pr-diff`
- **限制**: 跳过锁文件/二进制文件，总内容上限 80K 字符

文件读取优先级（由高到低）：

1. `src/process/`, `src/agent/`, `src/webserver/` — 核心后端
2. `src/channels/` — Agent 通信
3. `src/common/` — 公共模块
4. `src/worker/` — Worker 进程
5. `src/renderer/` — 前端 UI
6. 其他 `.ts/.tsx/.js/.jsx` 文件
7. 其余文件

### `call-openai`

调用 OpenAI Chat Completions API，包含自动重试、截断提示和长度限制处理。

- **输入**: `openai_api_key`, `output_file`, `diff_truncated`, `contents_truncated`
- **临时文件读取**: `system_prompt.txt`, `user_prompt.txt`（从 `RUNNER_TEMP` 读取）
- **临时文件写入**: `{output_file}`（写入 `RUNNER_TEMP`）
- **模型**: `gpt-5.2`
- **重试策略**: 最多 2 次重试，指数退避（429/5xx 状态码和网络错误）

## 数据流

```
                    ┌─────────────────────┐
                    │  gather-pr-diff     │
                    │  (GitHub API)       │
                    └────────┬────────────┘
                             │
                   pr_diff.txt, file_list.json
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              │              ▼
     ┌────────────────┐     │    ┌───────────────────┐
     │ read-file-     │     │    │ fetch PR metadata  │
     │ contents       │     │    │ + linked issues    │
     │ (本地文件系统)  │     │    │ (assessment only)  │
     └───────┬────────┘     │    └────────┬──────────┘
             │              │             │
   file_contents.txt        │    pr_meta.json,
             │              │    linked_issues.json
             └──────┬───────┘             │
                    │                     │
                    ▼                     │
          ┌──────────────────┐            │
          │ Construct GPT    │◄───────────┘
          │ Prompts          │
          │ (各工作流自定义)   │
          └────────┬─────────┘
                   │
         system_prompt.txt, user_prompt.txt
                   │
                   ▼
          ┌──────────────────┐
          │  call-openai     │
          │  (OpenAI API)    │
          └────────┬─────────┘
                   │
            {output_file}
                   │
                   ▼
          ┌──────────────────┐
          │ Post Comment     │
          │ (各工作流自定义)   │
          └──────────────────┘
```

## 语言检测

两个工作流都会自动检测 PR 标题和描述的语言，并使用相同语言输出回复：

- PR 内容为中文 → 中文评论
- PR 内容为英文 → 英文评论
- 混合或无法判断 → 默认英文

## 使用方式

### GPT Review（自动 + 手动触发）

**自动触发**：通过 `pr-checks.yml` 在 PR 首次提交时自动触发，无需手动操作。

**手动触发**：

1. 进入 GitHub 仓库 → Actions 页面
2. 左侧选择 **GPT Review**
3. 点击 **Run workflow**
4. 输入 PR number
5. 等待执行完成，审查结果将以 PR Review 形式出现

### GPT PR Assessment（自动 + 手动触发）

**自动触发**：当非项目成员（即 `author_association` 既不是 `OWNER` 也不是 `MEMBER`）首次提交 PR 时，`pr-checks.yml` 会在代码质量检查通过后自动触发评估。

**手动触发**：

1. 进入 GitHub 仓库 → Actions 页面
2. 左侧选择 **GPT PR Assessment**
3. 点击 **Run workflow**
4. 输入 PR number
5. 等待执行完成，评估报告将作为评论出现在 PR 中

重复对同一 PR 触发时，评论会被**更新**而非重复创建。

## Secrets 配置

| Secret           | 用途                                |
| ---------------- | ----------------------------------- |
| `OPENAI_API_KEY` | OpenAI API 访问密钥，两个工作流共用 |

## 修改指南

- **更换模型**: 修改 `.github/actions/call-openai/action.yml` 中的 `model` 字段
- **调整重试逻辑**: 修改 `.github/actions/call-openai/action.yml` 中的 `callOpenAI` 函数
- **修改文件优先级**: 修改 `.github/actions/read-file-contents/action.yml` 中的 `filePriority` 函数
- **修改 Review prompt**: 修改 `gpt-review.yml` 中的 "Construct GPT prompts" step
- **修改 Assessment prompt**: 修改 `gpt-pr-assessment.yml` 中的 "Construct GPT prompts" step
