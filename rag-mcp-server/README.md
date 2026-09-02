# RAG MCP Server

基于阿里云 DashScope + ChromaDB 的**检索型** RAG MCP Server：为 AionUi Agent（或其他 MCP 客户端）提供知识库语义检索能力。

> 设计原则：本 server 只做检索，**不内置 LLM 生成**。它返回相关文档块（原文 + 来源 + 页码 + 相似度分数），由调用方 Agent 自己的 LLM 基于这些材料生成答案。这样避免双倍 LLM 调用，也让 Agent 完全掌控上下文与引用格式。

## 设计亮点

**架构设计**

- **检索与生成分离**：只返回文档块原文 + 来源 + 页码 + 相似度，不内置 LLM——避免双重 LLM 调用，Agent 完全掌控上下文与引用格式
- **工具描述即防幻觉提示**：`search` 的工具描述直接约束下游 Agent："结果为空说明没有相关内容，请直接告知用户，不要凭空编造，也不要盲目重试相同问题"

**数据管理**

- **幂等加载**：chunk ID 基于内容哈希（文件 sha256 + 块内容），配合 `upsert`——同一文件重复加载自动跳过，文件更新后重新加载自动替换旧版本，不产生重复数据
- **Embedding 模型一致性校验**：知识库元数据记录构建时的 embedding 模型，启动时校验。更换模型会在初始化阶段报错，而不是检索时静默返回垃圾结果
- **路径归一化**：文档路径统一 `normcase + normpath`，Windows 下大小写/分隔符写法不同的同一路径不会重复入库，删除也不会失效
- **页码溯源贯穿全链路**：PDF 按页解析分块，每块携带 `source`/`page`/`chunk_index`，检索结果可直接定位到原始页码

**检索质量**

- **中文感知分块**：自定义分隔符优先级（段落 → 换行 → 。！？；，），按中文标点断句而非默认英文规则
- **相似度阈值过滤**：低于阈值的结果不返回，避免无关内容污染 Agent 上下文；全被过滤时返回 `best_similarity` 与 `hint`，帮 Agent 区分"知识库为空"与"没有相关内容"

**工程健壮性**

- **stdio 协议安全**：所有日志强制写 stderr，stdout 只传输 JSON-RPC，杜绝 print 污染协议流
- **并发安全**：同步 I/O 经 `asyncio.to_thread` 进线程池，不阻塞事件循环；写操作持互斥锁
- **边界处理细致**：Embedding 指数退避重试、分批向量化（DashScope 单批上限）、`top_k` 夹取防越界、扫描件/空文档明确报错而非静默成功

## 架构

```
AionUi Agent（自带 LLM）
        │  MCP 协议 (stdio)
        ▼
RAG MCP Server (Python, FastMCP)
  ├─ load_document        → 文档（PDF/TXT/MD/DOCX）→ 分块 → 向量化入库（幂等）
  ├─ load_pdf             → 同上，仅限 PDF（兼容保留）
  ├─ search               → 向量检索，返回文档块 + 分数 + 来源页码
  ├─ list_documents       → 列出知识库中的文档
  ├─ delete_document      → 删除单个文档
  └─ clear_knowledge_base → 清空知识库
        │
   ┌────┴─────────┐
   │  ChromaDB    │  向量数据库（本地持久化）
   │  DashScope   │  text-embedding-v4 向量化
   └──────────────┘
```

## MCP 工具

| 工具                   | 参数                                               | 说明                                                                                                                    |
| ---------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `load_document`        | `file_path` (string, 必填)                         | 加载文档，按扩展名识别格式（PDF / TXT / MD / DOCX）。幂等：同一文件重复加载自动跳过；文件内容更新后重新加载会替换旧版本 |
| `load_pdf`             | `pdf_path` (string, 必填)                          | `load_document` 的 PDF 专用版（兼容保留）                                                                               |
| `search`               | `question` (string, 必填)；`top_k` (integer, 可选) | 语义检索，返回 JSON：`results[]`（含 `text`/`source`/`page`/`similarity`），低于相似度阈值的结果被过滤                  |
| `list_documents`       | -                                                  | 列出所有文档的来源路径、块数、页码范围                                                                                  |
| `delete_document`      | `source` (string, 必填)                            | 按 `list_documents` 返回的完整路径删除单个文档                                                                          |
| `clear_knowledge_base` | -                                                  | 清空知识库（不可恢复）                                                                                                  |

`search` 返回示例：

```json
{
  "results": [
    {
      "text": "检索增强生成是一种结合检索与生成的技术……",
      "source": "d:\\docs\\report.pdf",
      "page": 3,
      "similarity": 0.82,
      "chunk_index": 0
    }
  ],
  "count": 1,
  "error": null
}
```

> `page` 仅 PDF 有（1-based），TXT/MD/DOCX 无分页概念，该字段为 `null`。
> `source` 为归一化后的路径（Windows 下统一小写与分隔符），路径匹配忽略大小写差异。

结果全被相似度阈值过滤时，`results` 为空并附带诊断字段，调用方 Agent 可据此判断"知识库为空"还是"没有相关内容"：

```json
{
  "results": [],
  "count": 0,
  "error": null,
  "best_similarity": 0.18,
  "hint": "检索到 3 个候选块，但最高相似度 0.18 仍低于阈值 0.3，已全部过滤。知识库中可能没有与该问题相关的内容。"
}
```

## 快速开始

### 1. 安装依赖

```bash
cd rag-mcp-server
pip install -r requirements.txt
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入 DashScope API Key（[获取地址](https://dashscope.console.aliyun.com/)）。

### 3. 启动 / 测试

```bash
python server.py          # stdio 模式，等待 MCP 客户端连接
```

用 MCP Inspector 交互测试：

```bash
npx @modelcontextprotocol/inspector python server.py
```

运行单元测试（离线，不访问 DashScope）：

```bash
python -m pytest tests/ -v
```

## 在 AionUi 中配置

```json
{
  "mcpServers": {
    "rag": {
      "command": "python",
      "args": ["D:/AI-Campus-Workspace/AionUi-Campus/rag-mcp-server/server.py"],
      "cwd": "D:/AI-Campus-Workspace/AionUi-Campus/rag-mcp-server"
    }
  }
}
```

> API Key 从项目目录的 `.env` 读取，无需在 MCP 配置中明文传递。

## 配置说明

| 环境变量             | 默认值              | 说明                                                                        |
| -------------------- | ------------------- | --------------------------------------------------------------------------- |
| `DASHSCOPE_API_KEY`  | -                   | DashScope API Key（必填）                                                   |
| `EMBEDDING_MODEL`    | `text-embedding-v4` | Embedding 模型。**更换后需清空知识库重建**（server 启动时会校验模型一致性） |
| `CHROMA_PERSIST_DIR` | `./chroma_data`     | ChromaDB 数据目录                                                           |
| `CHUNK_SIZE`         | `500`               | 分块大小（字符数）                                                          |
| `CHUNK_OVERLAP`      | `50`                | 分块重叠（字符数）                                                          |
| `TOP_K`              | `3`                 | `search` 默认返回条数                                                       |
| `SCORE_THRESHOLD`    | `0.3`               | 相似度下限（cosine，0~1），低于该值的结果不返回                             |
| `EMBED_BATCH_SIZE`   | `10`                | Embedding 单批条数（v4 上限 10）                                            |
| `EMBED_MAX_RETRIES`  | `3`                 | Embedding 调用失败重试次数                                                  |
| `LOG_LEVEL`          | `INFO`              | 日志级别（日志输出到 stderr，不污染 stdio 协议）                            |

## 技术栈

| 组件       | 技术                                                           |
| ---------- | -------------------------------------------------------------- |
| MCP 协议   | mcp Python SDK（FastMCP）                                      |
| PDF 解析   | pymupdf4llm（PDF → Markdown，保留结构，逐页带页码）            |
| DOCX 解析  | python-docx（正文段落 + 表格文本）                             |
| 分块       | langchain RecursiveCharacterTextSplitter（中文句子感知分隔符） |
| Embedding  | DashScope text-embedding-v4                                    |
| 向量数据库 | ChromaDB（cosine，本地持久化）                                 |
| 测试       | pytest（embedding 用假实现，离线运行）                         |

## 项目结构

```
rag-mcp-server/
├── server.py           # MCP Server 入口（FastMCP 工具定义）
├── rag_engine.py       # RAG 核心：解析、分块、向量化、检索、文档管理
├── config.py           # 配置管理（.env）
├── conftest.py         # pytest 根配置
├── tests/              # 单元测试（离线，假 embedding）
├── requirements.txt    # Python 依赖
├── .env.example        # 环境变量模板
├── .env                # 实际配置（已 gitignore，自行创建）
└── chroma_data/        # ChromaDB 数据目录（自动生成）
```

## License

MIT
