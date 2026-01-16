<p align="center">
  <img src="./resources/aionui-banner-1 copy.png" alt="AionUi - Cowork with Your CLI AI Agent" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/iOfficeAI/AionUi?style=flat-square&color=32CD32" alt="Version">
  &nbsp;
  <img src="https://img.shields.io/badge/license-Apache--2.0-32CD32?style=flat-square&logo=apache&logoColor=white" alt="License">
  &nbsp;
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-6C757D?style=flat-square&logo=linux&logoColor=white" alt="Platform">
</p>

<p align="center">
  <a href="https://trendshift.io/repositories/15423" target="_blank">
    <img src="https://trendshift.io/api/badge/repositories/15423" alt="GitHub Trending" height="80">
  </a>
</p>

---

<p align="center">
  <strong>🚀 Cowork 与你的AI, Gemini CLI, Claude Code, Codex, Qwen Code, Goose Cli, Auggie, 等ai agent </strong><br>
  <em> 任何用户友好 | 可视的图形化界面 | 多模型支持 | 本地数据安全</em>
</p>

<p align="center">
  <a href="https://github.com/iOfficeAI/AionUi/releases">
    <img src="https://img.shields.io/badge/⬇️%20立即下载-最新版本-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="下载最新版本" height="50">
  </a>
</p>

<p align="center">
  <a href="./readme.md">English</a> | <strong>简体中文</strong> | <a href="./readme_jp.md">日本語</a> | <a href="https://www.aionui.com" target="_blank">官网</a> | <a href="https://twitter.com/AionUI" target="_blank">Twitter</a>
</p>

<p align="center">
  <strong>💬 社区：</strong> <a href="https://discord.gg/g6u66vV9" target="_blank">Discord (English)</a> | <a href="./resources/wechat.jpg" target="_blank">微信 (中文群)</a>
</p>

---

## 📋 快速导航

<p align="center">

[✨ 看看能做什么](#✨-看看-aionui-能做什么) ·
[🤔 为什么选择 AionUi](#🤔-为什么选择-aionui) ·
[✨ 核心功能](#✨-核心功能) ·
[🚀 快速开始](#🚀-快速开始) ·
[📖 详细使用说明](#📖-详细使用说明) ·
[💬 社区交流](#🤝-社区与支持)

</p>

---

## ✨ 看看 AionUi 能做什么？

<p align="center">
  <img src="./resources/offica-ai BANNER-function copy.png" alt="AionUi - Cowork with Your CLI AI Agent" width="800">
</p>

### 🤖 **多代理模式 - Cowork for 你的命令行 AI 工具，统一图形界面**

_如果你已经安装了 Gemini CLI、Claude Code、CodeX、Qwen Code、Goose AI、Augment Code 等命令行工具，AionUi 可以自动检测并为它们提供统一的图形界面_

- ✅ **自动检测 + 统一界面** - 自动识别本地 CLI 工具，提供统一的图形界面，告别命令行
- ✅ **本地保存 + 多会话** - 对话保存在本地，支持多会话并行，每个会话独立上下文

<p align="center">
  <img src="./resources/acp home page.gif" alt="多代理模式演示" width="800">
</p>

---

### 📁 **智能文件管理 (AI Cowork)**

_批量重命名、自动整理、智能分类、文件合并_

- **自动整理**：智能识别内容并自动分类，让文件夹保持整洁。
- **高效批量**：一键重命名、合并文件，彻底告别繁琐手动。

<p align="center">
  <img src="./resources/aionui sort file.gif" alt="智能文件管理演示" width="800">
</p>

---

### 📄 **预览面板 - 快速查看 AI 生成效果**

_支持 9+ 种格式的可视化预览（PDF、Word、Excel、PPT、代码、Markdown、图片、HTML、Diff 等）_

- ✅ **立即查看效果** - AI 生成文件后，无需切换应用，立即查看预览
- ✅ **实时追踪 + 可编辑** - 自动追踪文件变更，编辑器与预览智能同步；支持 Markdown、代码、HTML 实时编辑，所见即所得

<p align="center">
  <img src="./resources/preview.gif" alt="预览面板演示" width="800">
</p>

---

### 🎨 **AI 图像生成与编辑**

_智能图像生成、编辑和识别，由 Gemini 驱动_

<p align="center">
  <img src="./resources/Image_Generation.gif" alt="AI 图像生成演示" width="800">
</p>

> 💡 **需要帮助设置免费图像生成？** [按照教程配置图像生成模型](https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide-Chinese)

---

### 💬 **多任务并行处理**

_开多个对话、任务不混乱、记忆独立、效率翻倍_

<p align="center">
  <img src="./resources/multichat-side-by-side.gif" alt="对话管理演示" width="800">
</p>

---

### 🌐 **随时随地访问 - WebUI 模式**

_远程控制您的 AI 工具 - 从网络中的任何设备访问 AionUi！安全控制本地 Gemini CLI、Claude Code、Codex 等工具，数据不离开您的设备_

```bash
# 基本启动
AionUi --webui

# 远程访问（局域网内其他设备可访问）
AionUi --webui --remote
```

> 💡 **需要详细配置指南？** 查看 [WebUI 配置教程](https://github.com/iOfficeAI/AionUi/wiki/WebUI-Configuration-Guide-Chinese) - 包含各平台完整启动命令

<p align="center">
  <img src="./resources/webui banner.png" alt="WebUI 远程访问演示" width="800">
</p>

---

## 🤔 为什么选择 AionUi？

**就像 Claude Cowork 让 Claude Code 更易用，AionUi 是你所有命令行 AI 工具的 Cowork 平台**

Gemini CLI、Claude Code、Codex、Qwen Code 等命令行工具虽然强大，但存在通用痛点：对话无法保存、单会话限制、文件操作繁琐、只能使用单一模型。

AionUi 为这些命令行工具提供统一的 **Cowork 能力**：

- 🎯 **统一平台** - 一个界面管理所有命令行 AI 工具，无需切换
- 🚀 **多工具支持** - 不仅支持 Claude Code，还支持 Gemini CLI、Codex、Qwen Code 等
- 🌐 **跨平台** - macOS、Windows、Linux 全平台支持（Claude Cowork 目前仅 macOS）
- 🔄 **多模型切换** - 在同一个界面中灵活切换不同模型，满足不同任务需求
- 📄 **实时预览** - 9+ 种格式可视化预览，AI 生成的文件立即查看效果
- 💾 **本地数据安全** - 所有对话和文件保存在本地，数据不离开你的设备

### ❓ 快速问答

<details>
<summary><strong>Q: 为什么 AionUi是你Claude Cowork不错的替换选择？</strong></summary>
A: AionUi 是一款**免费开源**的 **Multi-AI Agent Desktop  **。相比于只能在 Mac 上运行且绑死 Claude 的官方 Cowork，AionUi 是它的**全模型、跨平台增强版**，深度覆盖 **AI 办公自动化** 场景。

| 维度     | Claude Cowork  | AionUi (本项目)                             |
| :------- | :------------- | :------------------------------------------ |
| 操作系统 | 仅 macOS       | 🍏 macOS / 🪟 Windows / 🐧 Linux            |
| 模型支持 | 仅 Claude      | 🤖 Gemini, Claude, DeepSeek, OpenAI, Ollama |
| 交互形式 | GUI            | 🖥️ 全功能 GUI + WebUI 远程访问              |
| 费用     | 需订阅 $100/月 | 🆓 完全免费开源                             |

**深度 AI 办公场景支持：**

- **文件管理**：智能整理本地杂乱文件夹、一键批量重命名。
- **数据处理**：深度分析并自动美化 Excel 报表。
- **文档生成**：自动编写并排版 PPT、Word 与 Markdown 文档。
- **即时预览**：内置 9+ 种格式预览面板，让 AI 办公协作结果即刻可见。
</details>

<details>
<summary><strong>Q: 我可以用 AionUi 做什么？</strong></summary>
A: 它可以成为你的**私有化 Cowork 工作空间**。你可以让它帮你批量整理文件夹、深度美化 Excel、实时预览网页代码。它是你探索办公自动化流程、增强 Claude Code 或 Gemini CLI 体验的最佳图形化选择。
</details>

<details>
<summary><strong>Q: AionUi 是开箱即用吗？</strong></summary>
A: 是的！安装后可以直接使用 Google 账号登录，AionUi 会自动关联 Gemini CLI，无需额外配置即可开始使用。
</details>

<details>
<summary><strong>Q: 需要付费吗？</strong></summary>
A: AionUi 完全免费开源，但使用 AI 模型需要相应的 API Key。
</details>

<details>
<summary><strong>Q: 支持哪些 AI 模型？</strong></summary>
A: 支持 Gemini、OpenAI、Claude、Qwen 等主流模型，以及 Ollama、LM Studio 等本地模型。

还可以同时运行多个 AI Agent（如 Gemini CLI、Claude Code、Qwen Code 等），详见配置指南。

</details>

<details>
<summary><strong>Q: 数据安全吗？</strong></summary>
A: 所有对话数据存储在本地 SQLite 数据库，不会上传到任何服务器。
</details>

---

## ✨ 核心功能

### 💬 **多会话聊天**

- **多会话 + 独立上下文** - 同时开多个聊天，每个会话拥有独立的上下文记忆，互不混淆
- **本地保存** - 所有对话都保存在本地，不会丢失

### 🤖 **多模型支持**

- **多平台支持** - 支持 Gemini、OpenAI、Claude、Qwen 等主流模型，灵活切换
- **本地模型支持** - 支持 Ollama、LM Studio 等本地模型部署，选择 Custom 平台并设置本地 API 地址（如 `http://localhost:11434/v1`）即可接入
- **Gemini 3 订阅优化** - 自动识别订阅用户，推荐高级模型

### 🗂️ **文件管理**

- **文件树浏览 + 拖拽上传** - 像文件夹一样浏览文件，支持拖拽文件或文件夹一键导入
- **智能整理** - 你可以让AI 帮你整理文件夹，自动分类

### 📄 **预览面板 - 让 AI Agent 拥有显示器**

- **9+ 种格式预览** - 支持 PDF、Word、Excel、PPT、代码、Markdown、图片等，AI 生成后立即查看效果
- **实时追踪 + 可编辑** - 自动追踪文件变更，支持 Markdown、代码、HTML 实时编辑和调试

### 🎨 **AI 图像生成与编辑**

- **智能图像生成** - 支持 Gemini 2.5 Flash Image Preview、Nano、Banana 等多种图像生成模型
- **图像识别与编辑** - AI 驱动的图像分析和编辑功能

### 🌐 **WebUI 远程访问**

- **跨设备访问** - 通过网络中的任何设备通过浏览器访问，支持移动端
- **本地数据安全** - 所有数据使用 SQLite 数据库本地存储，适合服务器部署

### 🎨 **个性化界面定制**

_自己写 CSS 代码自定义，让你的交互界面符合你的心意_

<p align="center">
  <img src="./resources/css with skin.gif" alt="CSS 自定义界面演示" width="800">
</p>

- **完全自定义** - 通过 CSS 代码自由定制界面颜色、风格、布局，打造专属使用体验

---

## 📖 详细使用说明

<details>
<summary><strong>📖 展开查看完整使用说明</strong></summary>

### 🚀 快速入门

- [📖 完整安装指南](https://github.com/iOfficeAI/AionUi/wiki/Getting-Started-Chinese) - 从下载到配置的详细步骤
- [⚙️ LLM 配置指南](https://github.com/iOfficeAI/AionUi/wiki/LLM-Configuration-Chinese) - 多平台 AI 模型配置
- [🤖 多代理模式设置](https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup-Chinese) - 集成终端 AI 代理
- [🔌 MCP 工具配置](https://github.com/iOfficeAI/AionUi/wiki/MCP-Configuration-Guide-Chinese) - 模型上下文协议服务器设置
- [🎨 图像生成配置](https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide-Chinese) - AI 图像生成设置教程
- [🌐 WebUI 配置指南](https://github.com/iOfficeAI/AionUi/wiki/WebUI-Configuration-Guide-Chinese) - 完整的 WebUI 设置和配置教程

### 🎯 使用案例

- [📁 文件管理](https://github.com/iOfficeAI/AionUi/wiki/file-management) - 智能文件整理
- [📊 Excel 处理](https://github.com/iOfficeAI/AionUi/wiki/excel-processing) - AI 驱动的数据处理
- [🎨 图像生成](https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide-Chinese) - AI 图像创作
- [📚 更多使用案例](https://github.com/iOfficeAI/AionUi/wiki/Use-Cases-Overview-Chinese)

### ❓ 支持与帮助

- [❓ 常见问题](https://github.com/iOfficeAI/AionUi/wiki/FAQ-Chinese) - 问题解答和故障排除
- [🔧 配置与使用教程](https://github.com/iOfficeAI/AionUi/wiki/Configuration-Guides-Chinese) - 完整配置文档

</details>

---

## 🚀 快速开始

### 💻 系统要求

- **macOS**: 10.15 或更高版本
- **Windows**: Windows 10 或更高版本
- **Linux**: Ubuntu 18.04+ / Debian 10+ / Fedora 32+
- **内存**: 建议 4GB 以上
- **存储**: 至少 500MB 可用空间

### 📥 下载

<p>
  <a href="https://github.com/iOfficeAI/AionUi/releases">
    <img src="https://img.shields.io/badge/下载-最新版本-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="下载最新版本" height="50">
  </a>
</p>

### 🔧 简单安装

1. **下载并安装** AionUi 应用程序
2. **配置 AI 服务** - 支持 Google 账号登录或 API Key 认证
3. **开始使用** - 立即体验现代 AI 聊天界面

> 💡 **需要详细配置指南？** 查看我们的 [完整安装教程](https://github.com/iOfficeAI/AionUi/wiki/Getting-Started-Chinese)

---

## 🤝 社区与支持

### 💬 社区交流

**💡 你的想法很重要！** 我们非常重视每一位用户的建议和反馈。无论是功能想法、使用体验，还是遇到的问题，都欢迎随时联系我们！

<p align="center">
  <a href="https://x.com/AionUi" target="_blank">
    <img src="./resources/contactus-x.png" alt="在 X 联系我们" width="600">
  </a>
</p>

- [💬 GitHub Discussions](https://github.com/iOfficeAI/AionUi/discussions) - **分享想法、提出建议、交流使用心得**
- [🐛 报告问题](https://github.com/iOfficeAI/AionUi/issues) - 反馈 Bug 或功能请求
- [📦 发布更新](https://github.com/iOfficeAI/AionUi/releases) - 获取最新版本
- [💬 Discord Community](https://discord.gg/g6u66vV9) - **加入我们的英文 Discord 社区**
- [💬 微信 (中文群)](./resources/wechat.jpg) - **点击查看二维码**

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
