<p align="center">
  <img src="./resources/aionui_readme_header_0807.png" alt="AionUi Logo" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/office-sec/AionUi?style=flat-square&color=32CD32" alt="Version">
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
  <strong>English</strong> | <a href="./readme_ch.md">简体中文</a> | <a href="https://www.aionui.com" target="_blank">Official Site</a> | <a href="https://twitter.com/WailiVery" target="_blank">Twitter</a>
</p>

## 🚀 **What Can AionUi Do?**

### 💬 **Handle Multiple Tasks at Once**
*Multiple conversations, no task confusion, independent memory, double efficiency*
<p align="center">
  <img src="./resources/multichat-side-by-side.gif" alt="Conversation Management Demo" width="800">
</p>

### 📁 **Organizing Your Files**
*Batch renaming, auto organization, smart classification, file merging*
<p align="center">
  <img src="./resources/sort_out_folder.gif" alt="File Management Demo" width="800">
</p>

### 📊 **Make Excel Smarter**
*AI helps you create, organize, analyze, and beautify Excel files*
<p align="center">
  <img src="./resources/generate_xlsx.gif" alt="Excel Processing Demo" width="800">
</p>

---

**This is just the tip of AionUi's capabilities!** 🚀

Want to explore more features? Keep reading to discover what else AionUi can help you with:
- 🎯 Write code, create documents, analyze data
- 🗂️ Learn new things, answer questions, translate text
- ⚡ And many more daily work and learning scenarios

## 📋 Table of Contents

- [🤔 Why does AionUi exist?](#-why-does-aionui-exist)
- [🚀 What Can AionUi Do?](#-what-can-aionui-do)
- [✨ Key Features](#-key-features)
  - [💬 Better Chat Experience](#-better-chat-experience)
  - [🗂️ File Management Made Simple](#-file-management-made-simple)
  - [⚡ Development Efficiency Boost](#-development-efficiency-boost)
  - [🔧 Settings Are Simple](#-settings-are-simple)
- [🚀 Quick Start](#-quick-start)
  - [📥 Download](#-download)
  - [📋 Requirements](#-requirements)
  - [🔧 Installation](#-installation)
  - [🏗️ Build Application](#️-build-application)
- [🛠️ Tech Stack](#️-tech-stack)
- [📁 Project Structure](#-project-structure)
- [🎯 Use Cases](#-use-cases)

- [🔧 Configuration](#-configuration)
  - [🔑 API Configuration](#-api-configuration)
  - [🌐 Proxy Configuration](#-proxy-configuration)
- [🚀 Where We're Going](#-where-were-going)
  - [🤖 Multiple AI Assistants](#-multiple-ai-assistants)
  - [🔄 Flexible AI Model Selection](#-flexible-ai-model-selection)
  - [🎯 Making AI Agents Accessible](#-making-ai-agents-accessible)
- [📄 License](#-license)
- [🤝 Contributing](#-contributing)

---

## 🤔 Why does AionUi exist?

While the official Gemini CLI is powerful, its command-line interface has limitations for daily use. AionUi provides a GUI alternative that addresses these key pain points:

> *   Using the `@` command to select files is cumbersome
> *   Conversations are lost when closing the CLI window
> *   Command-line interface lacks natural chat interactions
> *   Single conversation mode limits parallel workflows
> *   Restricted to Gemini models only, unable to use other excellent large language models

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

### 🔧 **Settings Are Simple**
- **Multi-Platform Support** - Support Gemini, OpenAI, ModelScope, OpenRouter, etc.
- **Flexible Configuration** - Each platform can configure multiple models, support custom addresses
- **Easy Login** - Support Google account login, no need to remember API keys
- **Auto Fix** - Automatically detect and fix configuration issues, no manual debugging needed

## 🚀 Quick Start

### 📥 Download

Ready to try AionUi? Download the latest version for your platform from our releases page:

<p>
  <a href="https://github.com/office-sec/AionUi/releases">
    <img src="https://img.shields.io/badge/Download-Latest%20Release-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="Download Latest Release">
  </a>
</p>

### 📋 Requirements

- Node.js >= 16.0.0
- npm >= 8.0.0
- Google Gemini API Key ([Get your API key here](https://aistudio.google.com/app/apikey))

### 🔧 Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/office-sec/AionUi.git
cd AionUi
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure API Key**

   - Open the application and go to Settings
   - Enter your Google Gemini API Key
   - Supports multiple authentication methods: Gemini API Key, Vertex AI, Personal Authentication

4. **Start the application**
   ```bash
   npm start
   ```

### 🏗️ Build Application

```bash
# Build macOS version
npm run build-mac --arch=arm64  # Apple Silicon
npm run build-mac --arch=x64    # Intel

# Build Windows version
npm run build-win

# Build all platforms
npm run build
```

## 🛠️ Tech Stack

- **Desktop App**: Electron 37.2.0
- **Frontend Framework**: React 19.1.0
- **UI Component Library**: Arco Design Web React
- **AI Engine**: Google Gemini CLI Core
- **Styling Framework**: UnoCSS
- **Build Tools**: Webpack + TypeScript
- **Icon Library**: IconPark React

## 📁 Project Structure

```
AionUI/
├── src/
│   ├── adapter/          # Adapter layer
│   ├── agent/           # AI agents
│   │   └── gemini/      # Gemini AI integration
│   ├── common/          # Common modules
│   ├── process/         # Main process
│   ├── renderer/        # Renderer process
│   │   ├── components/  # UI components
│   │   ├── conversation/# Conversation related
│   │   └── messages/    # Message handling
│   └── worker/          # Worker process
├── config/              # Configuration files
├── public/              # Static resources
└── package.json
```

## 🎯 Use Cases

- **Code Development**: Code review, refactoring suggestions, bug fixes
- **Document Writing**: Automatic document generation, report summaries
- **Data Analysis**: Data visualization, analysis reports
- **Project Management**: Task planning, progress tracking
- **Learning Assistant**: Knowledge Q&A, concept explanation
- **Daily Office Work**: Email writing, meeting notes, work summaries
- **Learning & Growth**: Language learning, skill training, knowledge organization
- **Creative Work**: Copywriting, brainstorming, inspiration collection
- **Multi-Model Collaboration**: Choose the most suitable AI model based on task characteristics
  - **Gemini**: Code generation, technical documentation
  - **OpenAI**: Creative writing, content creation
  - **ModelScope**: Chinese understanding, localization tasks
  - **OpenRouter**: Cost optimization, model comparison



## 🔧 Configuration

### 🔑 API Configuration

Supports multiple authentication methods and platforms:

1. **Gemini Platform**:
   - Gemini API Key: Direct use of Gemini API
   - Vertex AI: Use Google Cloud Vertex AI
   - Personal Authentication: OAuth personal authentication

2. **Other Platforms**:
   - **OpenAI Compatible**: Support any service compatible with OpenAI API
   - **ModelScope**: Support Alibaba Cloud ModelScope platform
   - **OpenRouter**: Support OpenRouter aggregation platform
   - **Custom Platform**: Support custom API endpoints and models

### 🌐 Proxy Configuration

Supports HTTP proxy configuration for network-restricted environments.

## 🚀 Where We're Going
We envision AionUi evolving into a **Universal AI Agent Platform** that democratizes powerful AI agents for everyday users:

### 🤖 **Multiple AI Assistants**
- **Terminal Assistants**: Starting with Gemini CLI, will support more terminal tools in the future
- **Browser Assistants**: Integrate open-source web automation tools to help with web tasks
- **Unified Interface**: All AI assistants use the same simple chat interface
- **Easy Discovery**: New AI assistants can be easily found and used

### 🔄 **Flexible AI Model Selection**
- **Multi-Model Support**: Can use various AI models like Gemini, Claude, GPT, etc.
- **Switch Anytime**: Use whichever model you want without changing your workflow
- **Independent Configuration**: Each model has independent settings, no interference
- **Smart Recommendations**: Automatically recommend the most suitable AI model based on task
- **Cost Comparison**: Help you choose the most cost-effective model

### 🎯 **Making AI Agents Accessible**
Our goal is to make AI agents simple and easy to use, so ordinary users can get started easily. We believe that:
- **Simplicity is beauty**: Complex AI features should be simple to use
- **AI should understand users**: Users shouldn't need to adapt to AI, but AI should adapt to users
- **Open source is more transparent**: We prioritize using open-source agents so everyone can see the code
- **Chat is most natural**: Complex work can be done through simple chat

AionUi aims to bridge the gap between powerful AI capabilities and everyday usability, making sophisticated AI agents as easy to use as chatting with a friend.

---

## 📄 License

This project is licensed under the [Apache-2.0](LICENSE) License.

## 🤝 Contributing

Issues and Pull Requests are welcome!

1. Fork this project
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📊 Star History

<p align="center">
  <a href="https://www.star-history.com/#office-sec/aionui&Date" target="_blank">
    <img src="https://api.star-history.com/svg?repos=office-sec/aionui&type=Date" alt="GitHub Stars Trend" width="600">
  </a>
</p>

<div align="center">

**⭐ Star the repo if you like it**

[Report Bug](https://github.com/office-sec/AionUi/issues) · [Request Feature](https://github.com/office-sec/AionUi/issues)

</div>
