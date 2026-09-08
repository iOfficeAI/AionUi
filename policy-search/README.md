# Policy Search MCP Server

高校政策查询系统 — 通过 MCP 协议为 AionUi Agent 提供政策文档的结构化解析、存储和智能匹配能力。

## 功能概述

| 工具                   | 功能                                                     |
| ---------------------- | -------------------------------------------------------- |
| `load_policy_document` | 加载 PDF/文本政策文档，LLM 自动提取元数据和结构化条件    |
| `query_policy`         | 根据用户个人信息逐条匹配政策条件，返回匹配结果和原文引用 |
| `list_policies`        | 列出知识库中的政策文件，支持按学校/分类/年份筛选         |
| `clear_knowledge_base` | 清空知识库                                               |

## 架构

```
AionUi Agent
    │  MCP 协议 (stdio)
    ▼
server.py ── 4 个 MCP 工具
    │
    ├── policy_parser.py   ── PDF 读取 → LLM 提取元数据 → 分块提取条件
    ├── policy_store.py    ── index.json 索引 + 分类目录存储
    ├── policy_matcher.py  ── 用户信息 vs 政策条件逐条匹配
    └── llm_client.py      ── DashScope 通义千问 API 封装
```

## 知识库存储结构

```
knowledge_base/
├── index.json                          # 分类索引
├── postgraduate_recommendation/        # 保研/推免
│   └── {doc_id}.json                  # 政策详情（结构化 JSON）
├── scholarship/                        # 奖学金
│   └── {doc_id}.json
├── financial_aid/                      # 助学金
│   └── {doc_id}.json
└── other/                              # 其他
    └── {doc_id}.json
```

## 快速开始

### 1. 安装依赖

```bash
cd d:\AI-Campus-Workspace\policy-search
pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，填入你的 DashScope API Key：

```bash
DASHSCOPE_API_KEY=sk-your-api-key-here
LLM_MODEL=qwen3.7-plus
EMBEDDING_MODEL=text-embedding-v4
```

### 3. 启动测试

```bash
python server.py
```

如果看到 `[PolicySearch MCP Server] 启动中...` 且无报错，说明启动成功。

### 4. 在 AionUi 中导入

打开 **设置 → 工具 → MCP 管理**，导入以下 JSON：

```json
{
  "mcpServers": {
    "policy_search": {
      "command": "python",
      "args": ["d:/AI-Campus-Workspace/policy-search/server.py"],
      "env": {
        "DASHSCOPE_API_KEY": "sk-your-api-key-here"
      }
    }
  }
}
```

## 使用示例

### 加载政策文档

在 AionUi 对话中：

```
请加载这个政策文档：d:/documents/北京大学2025年推免实施办法.pdf
```

Agent 会调用 `load_policy_document`，自动完成：

1. 读取 PDF 文本
2. LLM 提取元数据（学校、年份、标题、分类）
3. 分块后 LLM 提取所有条件（GPA、论文、竞赛等）
4. 结构化存储到知识库

### 查询匹配政策

```
我的信息：学校北京大学，GPA 3.7，排名前15%，CET-6 580分，
有1篇SCI一作论文，获得过国家级竞赛一等奖。
帮我看看符合哪些保研政策？
```

Agent 会调用 `query_policy`，返回：

- 每个政策的总体判定（`likely_eligible` / `not_eligible` 等）
- 每个条件的逐条对比结果
- 原文引用（`source_quote`）

### 列出政策

```
知识库中有哪些保研相关的政策？
```

### 清空知识库

```
清空知识库
```

## 条件类型说明

| 类型          | 含义         | 匹配方式            |
| ------------- | ------------ | ------------------- |
| `hard`        | 硬性门槛     | 自动数值比较        |
| `scoring`     | 评分项       | 自动计算得分        |
| `ranking`     | 排名项       | 自动百分比比较      |
| `bonus`       | 加分项       | 部分自动 + 人工核实 |
| `preference`  | 优先条件     | 需人工评估          |
| `procedural`  | 流程性要求   | 需用户自行确认      |
| `qualitative` | 模糊定性条件 | 需人工审核          |

## 用户信息字段

| 字段               | 类型    | 说明                                |
| ------------------ | ------- | ----------------------------------- |
| `school`           | string  | 学校名称                            |
| `year`             | integer | 年份                                |
| `gpa`              | number  | GPA 绩点                            |
| `gpa_rank_percent` | number  | 排名百分比（如 12.5 = 前12.5%）     |
| `english.cet4`     | number  | CET-4 分数                          |
| `english.cet6`     | number  | CET-6 分数                          |
| `papers[]`         | array   | 论文列表（type/author_order/count） |
| `competitions[]`   | array   | 竞赛列表（level/award）             |
| `extra`            | object  | 自定义扩展字段                      |

## 项目结构

```
policy-search/
├── server.py              # MCP Server 入口
├── policy_parser.py       # 政策文档解析（LLM 提取结构化信息）
├── policy_store.py        # 知识库管理（index.json + 详情文件）
├── policy_matcher.py      # 条件匹配逻辑
├── llm_client.py          # LLM 客户端
├── config.py              # 配置管理
── requirements.txt       # 依赖
├── .env.example           # 环境变量模板
├── README.md              # 本文档
── examples/              # 示例数据
│   ├── postgraduate_recommendation_example.json
│   └── scholarship_example.json
└── knowledge_base/        # 运行时创建
```
