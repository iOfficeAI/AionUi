<p align="center">
  <img src="./resources/aionui_readme_header_0807.png" alt="AionUi Logo" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/iOfficeAI/AionUi?style=flat-square&color=32CD32" alt="Version">
  &nbsp;
  <img src="https://img.shields.io/badge/license-Apache--2.0-32CD32?style=flat-square&logo=apache&logoColor=white" alt="License">
  &nbsp;
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-6C757D?style=flat-square&logo=linux&logoColor=white" alt="Platform">
</p>

---

<p align="center">
  <strong>将命令行体验转换为现代、高效的 AI 聊天界面</strong>
</p>

<p align="center">
  <a href="./readme.md">English</a> | <strong>简体中文</strong> | <a href="./readme_jp.md">日本語</a> | <a href="https://www.aionui.com" target="_blank">官网</a> | <a href="https://twitter.com/AionUI" target="_blank">Twitter</a>
</p>

## 🎯 **AionUi 用例展示**

### 🤖 **多代理模式**

_无缝集成多个终端 AI 代理 - Gemini CLI、Claude Code、Qwen Code、Codex 等_

<p align="center">
  <img src="./resources/multi-agent.gif" alt="多代理模式演示" width="800">
</p>

### 🎨 **AI 图像生成与编辑**

_智能图像生成、编辑和识别，由 Gemini 2.5 Flash Image Preview 驱动_

<p align="center">
  <img src="./resources/Image_Generation.gif" alt="AI 图像生成演示" width="800">
</p>

### 📁 **智能文件管理**

_批量重命名、自动整理、智能分类、文件合并_

<p align="center">
  <img src="https://github.com/iOfficeAI/AionUi/wiki/assets/gifs/file-management/file-organization.gif" alt="文件管理演示" width="800">
</p>

### 📊 **Excel 智能处理**

_AI 帮你创建、整理、分析、美化 Excel 文件_

<p align="center">
  <img src="./resources/generate_xlsx.gif" alt="Excel 处理演示" width="800">
</p>

### 💬 **多任务并行处理**

_开多个对话、任务不混乱、记忆独立、效率翻倍_

<p align="center">
  <img src="./resources/multichat-side-by-side.gif" alt="对话管理演示" width="800">
</p>

## 📋 目录

- [🤔 为什么需要 AionUi？](#-为什么需要-aionui)
- [🎯 AionUi 用例展示](#-aionui-用例展示)
- [✨ 核心功能](#-核心功能)
- [🚀 快速开始](#-快速开始)
- [📚 详细文档](#-详细文档)
- [🤝 社区与支持](#-社区与支持)
- [📄 许可证](#-许可证)

---

## 🤔 为什么需要 AionUi？

虽然官方的 Gemini CLI 功能强大，但其命令行界面在日常使用中存在一些限制。AionUi 提供了一个 GUI 替代方案来解决这些关键痛点：

> - 使用 `@` 命令来选择文件比较麻烦
> - 关闭 CLI 窗口后对话就会丢失
> - 命令行界面缺乏自然的聊天交互
> - 单对话模式限制了并行工作流
> - 只能使用 Gemini 模型，无法利用其他优秀的大语言模型

AionUi 为需要更好工作流效率的用户提供了现代界面，同时**打破了单一模型的限制**，让您可以根据不同任务需求选择最适合的 AI 模型。

## ✨ 核心功能

### 💬 **更好的聊天体验**

- **多会话管理** - 同时开多个聊天，互不干扰
- **永久保存** - 所有对话都保存在本地，不会丢失
- **现代界面** - 像微信一样的聊天界面，操作简单
- **多模型支持** - 不只是 Gemini，还能用其他 AI 模型

### 🗂️ **文件管理更简单**

- **文件树浏览** - 像文件夹一样浏览文件，点击就能用
- **文件上传** - 拖拽上传文件，AI 帮你处理
- **代码对比** - 文件修改前后对比，一目了然
- **智能整理** - AI 帮你整理文件夹，自动分类
- **Excel 处理** - AI 帮你创建和修改 Excel 文件

### ⚡ **开发效率提升**

- **函数调用** - 完整的 Gemini API，功能更强大
- **代码渲染** - 代码块显示更美观，格式更清晰
- **工具调度** - 自动选择最合适的工具，不用手动选择

### 🤖 **多 Agent 集成**

- **多终端代理支持** - 无缝集成多种终端 AI 代理（Gemini CLI、Claude Code、Qwen Code、Codex 等）
- **动态 CLI 检测** - 自动后端发现和 CLI 路径检测
- **安全认证** - OAuth 支持和安全认证流程
- **实时监控** - 实时连接状态和后端健康监控
- **统一界面** - 所有终端 AI 代理通过相同的聊天界面访问

### 🔌 **MCP 工具管理**

- **MCP 服务器配置** - 添加、编辑和管理模型上下文协议服务器
- **多种导入方式** - 从 JSON 配置导入或 CLI 一键设置
- **工具发现** - 自动发现并列出 MCP 服务器提供的可用工具
- **连接测试** - 实时测试 MCP 服务器连接和健康状态
- **多代理同步** - 在不同 AI 代理间同步 MCP 配置
- **工具管理** - 启用/禁用工具、查看参数和工具描述

### 🔄 **多 API Key 轮换服务**

- **多 Key 轮换** - 多个 API Key 的自动轮换以提高可靠性
- **智能错误恢复** - 基于时间的黑名单机制（90秒）和自动重试
- **高可用性** - 在 API Key 之间无缝故障转移，防止服务中断
- **速率限制处理** - 智能重试逻辑，尊重 API 速率限制和配额
- **性能优化** - 减少停机时间，提高 API 调用成功率

### 🎨 **AI 图像生成与编辑**

- **智能图像生成** - 由 Gemini 2.5 Flash Image Preview 驱动，最先进的图像模型
- **多模型支持** - 同时支持其他领先的AI图像模型，满足多样化创意需求
- **智能编辑** - AI 驱动的图像编辑和增强功能
- **图像识别** - 高级图像分析和理解
- **高质量输出** - 专业级图像生成，细节控制精确

### 🔧 **设置很简单**

- **多平台支持** - 支持 Gemini、OpenAI、ModelScope、OpenRouter 等
- **灵活配置** - 每个平台可以配置多个模型，支持自定义地址
- **登录方便** - 支持 Google 账号登录或 API Key 认证，灵活选择
- **自动修复** - 自动检测并修复配置问题，不用手动调试

## 🚀 快速开始

### 📥 下载

准备试用 AionUi？从我们的发布页面下载适合您平台的最新版本：

<p>
  <a href="https://github.com/iOfficeAI/AionUi/releases">
    <img src="https://img.shields.io/badge/下载-最新版本-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="下载最新版本">
  </a>
</p>

### 🔧 简单安装

1. **下载并安装** AionUi 应用程序
2. **配置 AI 服务** - 支持 Google 账号登录或 API Key 认证
3. **开始使用** - 立即体验现代 AI 聊天界面

> 💡 **需要详细配置指南？** 查看我们的 [完整安装教程](https://github.com/iOfficeAI/AionUi/wiki/Getting-Started-Chinese)

## 📚 详细文档

### 🚀 快速入门

- [📖 完整安装指南](https://github.com/iOfficeAI/AionUi/wiki/Getting-Started-Chinese) - 从下载到配置的详细步骤
- [⚙️ LLM 配置指南](https://github.com/iOfficeAI/AionUi/wiki/LLM-Configuration-Chinese) - 多平台 AI 模型配置
- [🤖 多代理模式设置](https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup-Chinese) - 集成终端 AI 代理
- [🔌 MCP 工具配置](https://github.com/iOfficeAI/AionUi/wiki/MCP-Configuration-Guide-Chinese) - 模型上下文协议服务器设置
- [🎨 图像生成配置](https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide-Chinese) - AI 图像生成设置教程

### 🎯 使用案例

- [📁 文件管理](https://github.com/iOfficeAI/AionUi/wiki/file-management) - 智能文件整理
- [📊 Excel 处理](https://github.com/iOfficeAI/AionUi/wiki/excel-processing) - AI 驱动的数据处理
- [🎨 图像生成](https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide-Chinese) - AI 图像创作
- [📚 更多使用案例](https://github.com/iOfficeAI/AionUi/wiki/Use-Cases-Overview-Chinese)

### ❓ 支持与帮助

- [❓ 常见问题](https://github.com/iOfficeAI/AionUi/wiki/FAQ-Chinese) - 问题解答和故障排除
- [🔧 配置与使用教程](https://github.com/iOfficeAI/AionUi/wiki/Configuration-Guides-Chinese) - 完整配置文档

## 🤝 社区与支持

### 💬 社区交流

- [💬 GitHub Discussions](https://github.com/iOfficeAI/AionUi/discussions) - 分享使用心得，获取帮助
- [🐛 报告问题](https://github.com/iOfficeAI/AionUi/issues) - 反馈 Bug 或功能请求
- [📦 发布更新](https://github.com/iOfficeAI/AionUi/releases) - 获取最新版本

### 🤝 贡献代码

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

---

## 📄 许可证

本项目采用 [Apache-2.0](LICENSE) 许可证。

---

## 👥 贡献者

感谢所有为 AionUi 做出贡献的开发者们！

<p align="center">
  <a href="https://github.com/iOfficeAI/AionUi/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=iOfficeAI/AionUi&max=20" alt="Contributors" />
  </a>
</p>

## 📊 Star 历史

<p align="center">
  <a href="https://www.star-history.com/#iOfficeAI/aionui&Date" target="_blank">
    <img src="https://api.star-history.com/svg?repos=iOfficeAI/aionui&type=Date" alt="GitHub 星星趋势" width="600">
  </a>
</p>

<div align="center">

**⭐ 如果喜欢就给我们一个星吧**

[报告 Bug](https://github.com/iOfficeAI/AionUi/issues) · [创建功能请求](https://github.com/iOfficeAI/AionUi/issues)

</div>
