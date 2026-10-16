# 阿里云产品使用说明

## 1. 阿里云使用概述

本项目按照赛题要求使用阿里云产品或平台。

当前主要使用：

- 阿里云百炼
- DashScope
- 通义千问 Qwen

## 2. 当前模型

- 模型：qwen-plus
- 接入方式：DashScope API

## 3. 当前用途

Qwen 当前主要用于：

- 用户问题理解
- RAG 检索结果组织
- 回答生成
- Agent 推理

后续实际新增用途继续记录。

## 4. 配置方式

API Key 不写入源码。

使用环境变量进行配置，例如：

```env
DASHSCOPE_API_KEY=your_api_key_here