# RAG MCP Server

基于阿里云 DashScope + ChromaDB 的 RAG（检索增强生成）MCP Server，为 AionUi Agent 提供知识库问答能力。

## 架构

```
AionUi Agent (AionCore)
        │
        │ MCP 协议 (stdio)
        ▼
RAG MCP Server (Python)
  ├── load_pdf  → 加载 PDF 到知识库
  ├── query     → RAG 检索 + LLM 回答
  └── clear     → 清空知识库
        │
   ┌────┴────┐
   │ChromaDB │  向量数据库
   └─────────┘
```

## 快速开始

### 1. 安装依赖

```bash
cd rag-mcp-server
pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，填入你的 DashScope API Key：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```
DASHSCOPE_API_KEY=sk-你的API密钥
```

### 3. 启动 MCP Server

```bash
python server.py
```

Server 将以 stdio 模式运行，等待 MCP 客户端连接。

## MCP 工具说明

### `load_pdf`

加载本地 PDF 文件到知识库。

**参数：**

- `pdf_path` (string, 必填): PDF 文件的绝对路径

**示例：**

```json
{
  "pdf_path": "C:/Users/xxx/Documents/test.pdf"
}
```

### `query`

基于知识库回答问题。

**参数：**

- `question` (string, 必填): 用户的问题
- `top_k` (integer, 可选): 检索最相关的文档块数量，默认 3

**示例：**

```json
{
  "question": "这份文档的主要内容是什么？",
  "top_k": 3
}
```

### `clear_knowledge_base`

清空知识库中的所有文档。

## 在 AionUi 中配置

在 AionUi 的 MCP 配置中添加：

```json
{
  "mcpServers": {
    "rag": {
      "command": "python",
      "args": ["d:/AI-Campus-Workspace/rag-mcp-server/server.py"],
      "env": {
        "DASHSCOPE_API_KEY": "sk-你的API密钥"
      }
    }
  }
}
```

## 技术栈

| 组件       | 技术                        |
| ---------- | --------------------------- |
| LLM        | 通义千问 (qwen-plus)        |
| Embedding  | DashScope text-embedding-v3 |
| 向量数据库 | ChromaDB (本地持久化)       |
| PDF 解析   | pdfplumber                  |
| MCP 协议   | mcp (Python SDK)            |

## 项目结构

```
rag-mcp-server/
├── server.py          # MCP Server 入口
├── rag_engine.py      # RAG 核心引擎（加载、分块、向量化、检索）
├── llm_client.py      # 通义千问 LLM 客户端
├── config.py          # 配置管理
├── requirements.txt   # Python 依赖
├── .env.example       # 环境变量模板
├── .env               # 环境变量（需自行创建，已 gitignore）
└── chroma_data/       # ChromaDB 数据目录（自动生成）
```

# RAG MCP Server

基于阿里云 DashScope 的 RAG（检索增强生成）MCP Server，为 AionUi Agent 提供知识库问答能力。

## 📋 功能

- **PDF 文档加载** - 自动提取文本、分块、向量化
- **知识库检索** - 基于向量相似度的语义检索
- **LLM 问答** - 结合检索上下文生成准确回答
- **MCP 协议** - 标准 MCP 接口，可直接对接 AionUi Agent

## 🏗️ 架构

```
AionUi Agent
    ↓ MCP 协议 (stdio)
RAG MCP Server
    ├─ load_pdf()     → PDF 加载 + 分块 + 向量化
    ├─ query()        → 检索 + LLM 生成
    └─ clear()        → 清空知识库
    ↓
ChromaDB (向量数据库)
DashScope (Embedding + LLM)
```

## 🚀 快速开始

### 1. 安装依赖

```bash
cd rag-mcp-server
pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，填入你的 DashScope API Key：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
DASHSCOPE_API_KEY=sk-your-api-key-here
```

### 3. 启动 MCP Server

```bash
python server.py
```

Server 会通过 stdio 与 AionUi Agent 通信。

## 🔧 MCP 工具

### `load_pdf`

加载 PDF 文件到知识库。

**参数：**

- `pdf_path` (string): PDF 文件的绝对路径

**示例：**

```json
{
  "pdf_path": "C:/Users/xxx/Documents/test.pdf"
}
```

### `query`

基于知识库回答问题。

**参数：**

- `question` (string): 用户问题
- `top_k` (integer, 可选): 检索的文档块数量，默认 3

**示例：**

```json
{
  "question": "什么是 RAG？",
  "top_k": 3
}
```

### `clear_knowledge_base`

清空知识库。

## 📁 项目结构

```
rag-mcp-server/
├── server.py           # MCP Server 主入口
├── rag_engine.py       # RAG 核心引擎（加载、分块、检索）
├── llm_client.py       # LLM 客户端（通义千问调用）
├── config.py           # 配置管理
├── requirements.txt    # Python 依赖
├── .env.example        # 环境变量模板
└── README.md           # 本文档
```

## 🔑 获取 DashScope API Key

1. 访问 [阿里云 DashScope 控制台](https://dashscope.console.aliyun.com/)
2. 登录并创建 API Key
3. 复制 API Key 到 `.env` 文件

## 📝 配置说明

| 环境变量             | 默认值              | 说明                      |
| -------------------- | ------------------- | ------------------------- |
| `DASHSCOPE_API_KEY`  | -                   | DashScope API Key（必填） |
| `LLM_MODEL`          | `qwen-plus`         | LLM 模型名称              |
| `EMBEDDING_MODEL`    | `text-embedding-v3` | Embedding 模型名称        |
| `CHROMA_PERSIST_DIR` | `./chroma_data`     | ChromaDB 数据目录         |
| `CHUNK_SIZE`         | `500`               | 文档分块大小（字符数）    |
| `CHUNK_OVERLAP`      | `50`                | 分块重叠大小（字符数）    |

## 🧪 测试

你可以使用 MCP Inspector 测试 Server：

```bash
npx @modelcontextprotocol/inspector python server.py
```

## 📚 技术栈

- **MCP** - Model Context Protocol
- **DashScope** - 阿里云通义千问 API
- **ChromaDB** - 轻量级向量数据库
- **pdfplumber** - PDF 文本提取

## 🤝 对接 AionUi

在 AionUi 的 MCP 配置中添加此 Server：

```json
{
  "mcpServers": {
    "rag-server": {
      "command": "python",
      "args": ["d:/AI-Campus-Workspace/rag-mcp-server/server.py"],
      "cwd": "d:/AI-Campus-Workspace/rag-mcp-server"
    }
  }
}
```

## 📄 License

MIT
