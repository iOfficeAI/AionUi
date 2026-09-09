
---

### `docs/competition/DEPLOYMENT.md`

```md
# 校园规则解码器——环境与部署说明

## 1. 文档目的

本文件用于说明项目运行所需环境、依赖、配置和启动流程。

## 2. 当前开发环境

> 以 `BASELINE.md` 中锁定版本为准。

当前已知环境：

- 操作系统：Windows
- Python：3.12.x
- AionCore：0.1.61
- AionUi：见 `BASELINE.md`
- Node.js：见项目要求
- Bun：见项目要求

## 3. 项目目录

主要新增模块包括：

- `rag-mcp-server/`
- `docs/competition/`
- `evaluation/`

后续随项目结构更新。

## 4. 环境安装

### 4.1 AionUi

详细开发环境安装过程参见：

`RUNBOOK.md`

### 4.2 RAG MCP Server

进入目录：

```powershell
cd rag-mcp-server