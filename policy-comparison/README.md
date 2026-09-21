# Policy Comparison MCP Server

政策对比 — 通过 MCP 协议为 AionUi Agent 提供「两个政策版本差异对比」能力，输出前端「政策对比」页可直接消费的结构化结果（接口契约 v1）。

## 功能概述

| 工具                      | 功能                                                                 |
| ------------------------- | -------------------------------------------------------------------- |
| `compare_policy_versions` | 输入两个政策版本（路径/规则库标题/文件名），自动定位全文并输出逐条变化 |

输出结构（契约 v1 `PolicyDiffResult`）：

```json
{
  "document": { "name": "学生奖学金管理办法", "oldVersion": "2024版", "newVersion": "2025版" },
  "summary": { "total": 3, "modified": 1, "added": 1, "removed": 1 },
  "changes": [
    {
      "changeId": "change-001",
      "type": "modified",
      "old": { "section": "第四条", "content": "……单科成绩不低于80分。" },
      "new": { "section": "第四条", "content": "……单科成绩不低于85分，学业排名位于本专业前30%。" },
      "context": { "before": ["…"], "after": ["…"] },
      "aiExplanation": "提高单科成绩要求并新增排名限制"
    }
  ]
}
```

## 工作流（与「政策对比」页配合）

前端只把两个**文件名文本**发给 Agent（不传路径、不传内容），因此本服务需自行把名称解析为文档：

```
政策对比页（前端，无需修改）
    │  “请对比：旧政策 X · 新政策 Y”（仅名称）
    ▼
AionUi Agent ── MCP stdio ──▶ server.py
    │                              │
    │                              ├── doc_loader.py  名称 → 文档全文（路径/规则库/搜索目录）
    │                              └── differ.py       LLM 语义对比 → 失败降级 difflib 规则对比
    ▼
前端轮询取最后一条工具输出 → tryParsePolicyDiffResult → Diff 视图
```

> 前端轮询预算约 30s（含 Agent 决策耗时）。LLM 超时默认 20s，超时自动降级规则对比，保证在预算内返回。
>
> 输出为契约字段的超集：除 `document/summary/changes` 外附带 `_meta`（engine / 来源 / 耗时）与可选 `warning`（两输入指向同一文档时提示），前端宽松解析会忽略额外字段，便于 Agent 说明本次对比所用的引擎。

## 架构

```
server.py            —— 单工具 MCP 服务（compare_policy_versions）
├── config.py        —— 环境变量与契约限制
├── doc_loader.py    —— 文档定位与文本提取（pdf/docx/txt/md/json）
├── differ.py        —— 对比引擎（LLM 语义 + 规则降级 + 契约校验裁剪）
├── llm_client.py    —— DashScope 通义千问 API 封装（OpenAI 兼容模式）
└── examples/        —— 示例政策两版（可直接试跑）
```

## 快速开始

### 1. 安装依赖

```bash
cd D:/AI-Campus-Workspace/AionUi-Campus/policy-comparison
pip install -r requirements.txt
```

### 2. 配置环境变量（可选）

复制 `.env.example` 为 `.env` 并填入 Key；**应用内运行时 Key 由宿主自动注入，无需手动配置**。未配置 Key 时自动使用规则对比。

### 3. 注册到应用

在设置 → MCP 中按 `mcp-config.json` 添加（command `python`，args 指向 `server.py`，cwd 为本目录）。

### 4. 试跑

在 Agent 对话中要求对比 `examples/` 下两版示例，或直接说“对比 学生奖学金管理办法_2024版 和 学生奖学金管理办法_2025版”。

## 文件定位规则

`old_policy` / `new_policy` 依次按三条路径解析，命中即返回：

1. **路径**：绝对/相对路径存在则直接读取（`.pdf .docx .txt .md .json` 等）；
2. **规则库**：在 `policy-search/knowledge_base/index.json` 中按标题/文件名模糊匹配，命中后读取明细 JSON 的 `raw_text`（缺失时用结构化条件原文重建）；
3. **搜索目录**：在 `POLICY_COMPARE_SEARCH_DIRS`（默认桌面/下载/文档）中按文件名模糊匹配（遍历深度 3、上限 3000 个文件）。

名称匹配算法：NFKC 归一化 + 去标点小写；精确=1.0、包含=0.92、其余按相似度比；低于 `MATCH_THRESHOLD`（默认 0.6）不命中。定位失败时返回 `document_not_found` + `candidates` 候选列表，便于 Agent 请用户确认准确名称。

## 对比引擎

| 场景                       | 引擎         | aiExplanation       |
| -------------------------- | ------------ | ------------------- |
| 配置了 Key 且调用成功      | LLM 语义对比 | 有（≤100 字）       |
| 未配置 Key / 超时 / 失败   | 规则对比     | 无                  |
| LLM 未检出而规则检出变化   | 规则对比     | 无（交叉验证防漏报）|

- LLM：DashScope `qwen3.7-plus`（OpenAI 兼容模式，关闭思考模式），单篇文本上限 12000 字符；
- 规则：按 `第X条/第X章/一、/（一）/(1)/1.` 切分条款，`difflib.SequenceMatcher` 对齐为 modified/added/removed，全零依赖、离线可用。

## 契约限制（输出自动裁剪）

| 项              | 限制            |
| --------------- | --------------- |
| changes 条数    | ≤ 20            |
| content 长度    | ≤ 500 字符      |
| aiExplanation   | ≤ 100 字符      |
| context         | ≤ 2 条 × 300 字符 |
| changeId        | `change-001` 起顺序重编 |

## 环境变量

| 变量                              | 默认值                       | 说明                       |
| --------------------------------- | ---------------------------- | -------------------------- |
| `DASHSCOPE_API_KEY`               | 空                           | 应用侧自动注入；空则规则对比 |
| `POLICY_COMPARE_LLM_MODEL`        | `qwen3.7-plus`               | LLM 模型                   |
| `POLICY_COMPARE_LLM_TIMEOUT`      | `20`                         | LLM 超时（秒）             |
| `POLICY_COMPARE_DISABLE_LLM`      | 空                           | 置 1 强制规则对比          |
| `KNOWLEDGE_BASE_DIR`              | `../policy-search/knowledge_base` | 规则库目录            |
| `POLICY_COMPARE_SEARCH_DIRS`      | 桌面/下载/文档               | 文件名搜索目录（分号分隔） |
| `POLICY_COMPARE_MATCH_THRESHOLD`  | `0.6`                        | 名称匹配最低相似度         |

## 局限

- 上传文件场景依赖搜索目录或绝对路径；浏览器上传的临时文件在系统临时目录时可能无法定位（候选列表会提示）。
- LLM 模式时延受网络影响；慢于 20s 自动降级规则对比，此时无 `aiExplanation`。
- 两个输入解析到同一份文档时输出 `warning` 字段提示确认。
