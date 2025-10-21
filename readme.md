<p align="center">
  <img src="./resources/aionui_readme_header_0807.png" alt="AionUi Logo" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/iOfficeAI/AionUi?style=flat-square&color=32CD32" alt="Version">
  &nbsp;
  <img src="https://img.shields.io/badge/license-Apache--2.0-32CD32?style=flat-square&logo=apache&logoColor=white" alt="License">
  &nbsp;
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-6C757D?style=flat-square&logo=linux&logoColor=white" alt="Platform">
  &nbsp;
  <img src="https://img.shields.io/badge/Electron-37.2.0-007ACC?style=flat-square&logo=electron&logoColor=white" alt="Electron">
  &nbsp;
  <img src="https://img.shields.io/badge/React-19.1.0-FF6B35?style=flat-square&logo=react&logoColor=white" alt="React">
</p>

---

<p align="center">
  <strong>Transform your command-line experience into a modern, efficient AI Chat interface.</strong>
</p>

<p align="center">
  <strong>English</strong> | <a href="./readme_ch.md">简体中文</a> | <a href="./readme_jp.md">日本語</a> |<a href="https://www.aionui.com" target="_blank">Official Site</a> | <a href="https://twitter.com/WailiVery" target="_blank">Twitter</a>
</p>

## 🚀 **What Can AionUi Do?**

### 🤖 **Multi-Agent Mode**

_Seamlessly integrate multiple terminal AI agents - Gemini CLI, Claude Code, Qwen Code, Codex and more_

<p align="center">
  <img src="./resources/multi-agent.gif" alt="Multi-Agent Mode Demo" width="800">
</p>

### 🎨 **AI Image Generation & Editing**

_Intelligent image generation, editing, and recognition powered by Gemini 2.5 Flash Image Preview - the most advanced image model, with support for other leading AI image models_

<p align="center">
  <img src="./resources/Image_Generation.gif" alt="AI Image Generation Demo" width="800">
</p>

> 💡 **Need help setting up free image generation?** [Follow the tutorial to configure image generation models](https://github.com/iOfficeAI/AionUi/wiki/OpenRouter-Setup-and-Image-Generation) - Complete step-by-step guide for OpenRouter setup and free Gemini 2.5 Flash Image Preview configuration.

### 📁 **Organizing Your Files**

_Batch renaming, auto organization, smart classification, file merging_

<p align="center">
  <img src="https://github.com/iOfficeAI/AionUi/wiki/assets/gifs/file-management/file-organization.gif" alt="File Management Demo" width="800">
</p>

### 📊 **Make Excel Smarter**

_AI helps you create, organize, analyze, and beautify Excel files_

<p align="center">
  <img src="./resources/generate_xlsx.gif" alt="Excel Processing Demo" width="800">
</p>

### 💬 **Handle Multiple Tasks at Once**

_Multiple conversations, no task confusion, independent memory, double efficiency_

<p align="center">
  <img src="./resources/multichat-side-by-side.gif" alt="Conversation Management Demo" width="800">
</p>

---

**This is just the tip of AionUi's capabilities!** 🚀

Want to explore more features? Keep reading to discover what else AionUi can help you with:

- 🎯 Write code, create documents, analyze data
- 🗂️ Learn new things, answer questions, translate text
- ⚡ And many more daily work and learning scenarios

## 📋 Table of Contents

- [🤔 Why does AionUi exist?](#-why-does-aionui-exist)
- [🎯 AionUi Use Cases](#-aionui-use-cases)
- [✨ Key Features](#-key-features)
- [🚀 Quick Start](#-quick-start)
- [📚 Documentation](#-documentation)
- [🤝 Community & Support](#-community--support)
- [📄 License](#-license)

---

## 🤔 Why does AionUi exist?

While the official Gemini CLI is powerful, its command-line interface has limitations for daily use. AionUi provides a GUI alternative that addresses these key pain points:

> - Using the `@` command to select files is cumbersome
> - Conversations are lost when closing the CLI window
> - Command-line interface lacks natural chat interactions
> - Single conversation mode limits parallel workflows
> - Restricted to Gemini models only, unable to use other excellent large language models

AionUi provides a modern interface for users who need better workflow efficiency, while **breaking the single-model limitation**, allowing you to choose the most suitable AI model for different task requirements.

## ✨ Key Features

### 💬 **Better Chat Experience**

- **Multi-Conversation** - Open multiple chats simultaneously, no interference
- **Permanent Storage** - All conversations saved locally, never lost
- **Modern Interface** - Chat interface like WeChat, simple to use
- **Multi-Model Support** - Not just Gemini, can use other AI models too

### 🗂️ **File Management Made Simple**

- **File Tree Browsing** - Browse files like folders, click to use
- **File Upload** - Drag and drop files, AI helps you process
- **Code Comparison** - File before/after comparison, clear at a glance
- **Smart Organization** - AI helps organize folders, automatic classification
- **Excel Processing** - AI helps create and modify Excel files

### ⚡ **Development Efficiency Boost**

- **Function Calling** - Complete Gemini API, more powerful features
- **Code Rendering** - Code blocks display more beautifully, format clearer
- **Tool Scheduling** - Automatically select most suitable tools, no manual selection needed

### 🤖 **Multi-Agent Integration**

- **Multi-Terminal Agent Support** - Seamlessly integrate with various terminal AI agents (Gemini CLI, Claude Code, Qwen Code, Codex, etc.)
- **Dynamic CLI Detection** - Automatic backend discovery and CLI path detection
- **Secure Authentication** - OAuth support and secure authentication flows
- **Real-time Monitoring** - Live connection status and backend health monitoring
- **Unified Interface** - All terminal AI agents accessible through the same chat interface

### 🔌 **MCP Tool Management**

- **MCP Server Configuration** - Add, edit, and manage Model Context Protocol servers
- **Multiple Import Methods** - Import from JSON configuration or CLI with one-click setup
- **Tool Discovery** - Automatically discover and list available tools from MCP servers
- **Connection Testing** - Real-time testing of MCP server connections and health status
- **Multi-Agent Sync** - Synchronize MCP configurations across different AI agents
- **Tool Management** - Enable/disable tools, view parameters and tool descriptions

### 🔄 **Multi-API Key Rotation Service**

- **Multi-Key Rotation** - Automatic rotation of multiple API keys for enhanced reliability
- **Intelligent Error Recovery** - Time-based blacklisting (90s) with automatic retry mechanisms
- **High Availability** - Seamless failover between API keys to prevent service interruptions
- **Rate Limit Handling** - Smart retry logic that respects API rate limits and quotas
- **Performance Optimization** - Reduced downtime and improved API call success rates

### 🎨 **AI Image Generation & Editing**

- **Smart Image Generation** - Powered by Gemini 2.5 Flash Image Preview, the most advanced image model
- **Multi-Model Support** - Also supports other leading AI image models for diverse creative needs
- **Intelligent Editing** - AI-powered image editing and enhancement capabilities
- **Image Recognition** - Advanced image analysis and understanding
- **High-Quality Output** - Professional-grade image generation with detailed control

### 🔧 **Settings Are Simple**

- **Multi-Platform Support** - Support Gemini, OpenAI, ModelScope, OpenRouter, etc.
- **Flexible Configuration** - Each platform can configure multiple models, support custom addresses
- **Easy Login** - Support Google account login or API Key authentication, flexible choice
- **Auto Fix** - Automatically detect and fix configuration issues, no manual debugging needed

## 🚀 Quick Start

### 📥 Download

Ready to try AionUi? Download the latest version for your platform from our releases page:

<p>
  <a href="https://github.com/iOfficeAI/AionUi/releases">
    <img src="https://img.shields.io/badge/Download-Latest%20Release-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="Download Latest Release">
  </a>
</p>

### 🔧 Simple Installation

1. **Download and install** AionUi application
2. **Configure AI service** - Support Google account login or API Key authentication
3. **Start using** - Experience modern AI chat interface immediately

> 💡 **Need detailed configuration guide?** Check our [Complete Installation Tutorial](https://github.com/iOfficeAI/AionUi/wiki/Getting-Started)

## 📚 Documentation

### 🚀 Quick Start

- [📖 Complete Installation Guide](https://github.com/iOfficeAI/AionUi/wiki/Getting-Started) - Detailed steps from download to configuration
- [⚙️ LLM Configuration Guide](https://github.com/iOfficeAI/AionUi/wiki/LLM-Configuration) - Multi-platform AI model configuration
- [🤖 Multi-Agent Mode Setup](https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup) - Integrate terminal AI agents
- [🔌 MCP Tool Configuration](https://github.com/iOfficeAI/AionUi/wiki/MCP-Configuration-Guide) - Model Context Protocol server setup
- [🎨 Image Generation Configuration](https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide) - AI image generation setup tutorial

### 🎯 Use Cases

- [📁 File Management](https://github.com/iOfficeAI/AionUi/wiki/file-management) - Smart file organization
- [📊 Excel Processing](https://github.com/iOfficeAI/AionUi/wiki/excel-processing) - AI-driven data processing
- [🎨 Image Generation](https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide) - AI image creation
- [📚 More Use Cases](https://github.com/iOfficeAI/AionUi/wiki/Use-Cases-Overview)

### ❓ Support & Help

- [❓ FAQ](https://github.com/iOfficeAI/AionUi/wiki/FAQ) - Questions and troubleshooting
- [🔧 Configuration & Usage Tutorial](https://github.com/iOfficeAI/AionUi/wiki/Configuration-Guides) - Complete configuration documentation

## 🤝 Community & Support

### 💬 Community

- [💬 GitHub Discussions](https://github.com/iOfficeAI/AionUi/discussions) - Share experiences and get help
- [🐛 Report Issues](https://github.com/iOfficeAI/AionUi/issues) - Report bugs or feature requests
- [📦 Releases](https://github.com/iOfficeAI/AionUi/releases) - Get latest updates

### 🤝 Contributing

Issues and Pull Requests are welcome!

1. Fork this project
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the [Apache-2.0](LICENSE) License.

---

## 👥 Contributors

Thanks to all developers who contributed to AionUi!

<p align="center">
  <a href="https://github.com/iOfficeAI/AionUi/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=iOfficeAI/AionUi&max=20" alt="Contributors" />
  </a>
</p>

## 📊 Star History

<p align="center">
  <a href="https://www.star-history.com/#iOfficeAI/aionui&Date" target="_blank">
    <img src="https://api.star-history.com/svg?repos=iOfficeAI/aionui&type=Date" alt="GitHub Stars Trend" width="600">
  </a>
</p>

<div align="center">

**⭐ Star the repo if you like it**

[Report Bug](https://github.com/iOfficeAI/AionUi/issues) · [Request Feature](https://github.com/iOfficeAI/AionUi/issues)

</div>
