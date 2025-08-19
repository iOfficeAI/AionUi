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

<p align="center">
  <table align="center">
    <tr>
      <td style="border: 2px solid #6b7280; padding: 8px;">
        <img src="./resources/sort_out_folder.gif" alt="AionUi Demo" width="800">
      </td>
    </tr>
  </table>
</p>

## 📋 Table of Contents

- [🤔 Why does AionUi exist?](#-why-does-aionui-exist)
- [✨ Key Features](#-key-features)
  - [💬 Enhanced Chat Experience](#-enhanced-chat-experience)
  - [🗂️ File & Project Management](#️-file--project-management)
  - [⚡ Developer Workflow](#-developer-workflow)
  - [🔧 Simple & Convenient Settings](#-simple--convenient-settings)
- [🚀 Quick Start](#-quick-start)
  - [📥 Download](#-download)
  - [📋 Requirements](#-requirements)
  - [🔧 Installation](#-installation)
  - [🏗️ Build Application](#️-build-application)
- [🛠️ Tech Stack](#️-tech-stack)
- [📁 Project Structure](#-project-structure)
- [🎯 Use Cases](#-use-cases)
- [🎬 Feature Demonstrations](#-feature-demonstrations)
  - [📊 Excel Generation & Management](#-excel-generation--management)
  - [🤖 Multi-Model Support](#-multi-model-support)
  - [💬 Side-by-Side Chat Management](#-side-by-side-chat-management)
  - [📁 Smart Folder Organization](#-smart-folder-organization)
- [🔧 Configuration](#-configuration)
  - [🔑 API Configuration](#-api-configuration)
  - [🌐 Proxy Configuration](#-proxy-configuration)
- [🚀 What's Next?](#-whats-next)
  - [📍 Where We Are](#-where-we-are)
  - [🎯 Where We're Going](#-where-were-going)
- [📄 License](#-license)
- [🤝 Contributing](#-contributing)

---

## 🤔 Why does AionUi exist?

While the official Gemini CLI is powerful, its command-line interface has limitations for daily use. AionUi provides a GUI alternative that addresses these key pain points:

*   **File Management:** Managing code context with the `@` command can be cumbersome
*   **Chat History:** Conversations are lost when closing the CLI window
*   **Chat Experience:** Command-line interface lacks natural chat interactions
*   **Multi-tasking:** Single conversation model limits parallel workflows
*   **Model Limitations:** Restricted to Gemini models only, unable to leverage other excellent large language models

AionUi not only provides a modern interface for users who need better workflow efficiency, but more importantly, **breaks the single-model limitation**, allowing you to choose the most suitable AI model for different task requirements.

## ✨ Key Features

### 💬 **Enhanced Chat Experience**  
- **Multi-Conversation** - Manage multiple independent chat sessions
- **Persistent History** - All conversations saved locally, never lose your work
- **Modern Interface** - Natural chat UI with familiar messaging controls
- **Multi-Model Support** - Break single-model limitations, support multiple large language models

### 🗂️ **File & Project Management**
- **Visual File Tree** - Browse and select files with one-click chat integration
- **File Upload** - Upload files for AI processing with secure temporary storage
- **Code Diff View** - Side-by-side comparison of file changes
- **Smart Folder Organization** - AI-powered file sorting and categorization
- **Excel Generation** - Create and manage Excel files with AI assistance

### ⚡ **Developer Workflow**
- **Function Calling** - Full Gemini API integration for advanced features
- **Rich Markdown** - Beautiful rendering of code blocks and formatted content
- **Smart Tool Scheduling** - Automatically select appropriate tools for task execution

### 🔧 **Simple & Convenient Settings**
- **Multi-Platform Model Management** - Support mainstream platforms like Gemini, OpenAI, ModelScope, OpenRouter, etc.
- **Flexible Configuration** - Each platform can configure multiple models, support custom API endpoints
- **Unified Authentication** - Support Google personal authentication, account login is convenient and fast
- **Smart URL Fixing** - Automatically detect and fix API endpoint configuration issues

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
- **Multi-Model Collaboration**: Choose the most suitable AI model based on task characteristics
  - **Gemini**: Code generation, technical documentation
  - **OpenAI**: Creative writing, content creation
  - **ModelScope**: Chinese understanding, localization tasks
  - **OpenRouter**: Cost optimization, model comparison

## 🎬 Feature Demonstrations

### 📊 **Excel Generation & Management**
<p align="center">
  <img src="./resources/generate_xlsx.gif" alt="Excel Generation Demo" width="800">
</p>

### 🤖 **Multi-Model Support**
<p align="center">
  <img src="./resources/multi-llm.gif" alt="Multi-Model Support Demo" width="800">
</p>

### 💬 **Side-by-Side Chat Management**
<p align="center">
  <img src="./resources/multichat-side-by-side.gif" alt="Side-by-Side Chat Demo" width="800">
</p>

### 📁 **Smart Folder Organization**
<p align="center">
  <img src="./resources/sort_out_folder.gif" alt="Folder Organization Demo" width="800">
</p>

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

## 🚀 What's Next?

### 📍 Where We Are
AionUi currently provides a powerful GUI for Gemini CLI, offering enhanced chat experience, file management, and developer workflow optimization. More importantly, we have **broken the single-model limitation** and now support multiple large language model platforms, allowing users to choose the most suitable AI model for different task requirements.

### 🎯 Where We're Going
We envision AionUi evolving into a **Universal AI Agent Platform** that democratizes powerful AI agents for everyday users:

#### 🤖 **Multi-Agent Ecosystem**
- **Terminal Agents**: Starting with Gemini CLI, expanding to other terminal-based agents
- **Browser Agents**: Integrating open-source browser automation agents for web tasks
- **Unified Experience**: Simple chat interface that works across all agent types
- **Agent Discovery**: Easy access to new agents as they become available

#### 🔄 **Flexible LLM Binding**
- **Multi-LLM Support**: Bind different language models (Gemini, Claude, GPT, etc.) to any agent
- **Model Switching**: Easily switch between different LLMs without changing your workflow
- **Custom Configurations**: Configure API keys and settings for each model independently
- **Smart Model Selection**: Automatically recommend the most suitable model based on task type
- **Cost Optimization**: Support cost comparison and intelligent selection between different models

#### 🎯 **Making AI Agents Accessible**
Our goal is to make powerful AI agents accessible to everyone, not just developers. We believe that:
- **Complex tasks should feel simple**: Users shouldn't need to learn different interfaces for different agents
- **AI should adapt to users**: Not the other way around
- **Open source matters**: We prioritize integrating open-source agents to ensure transparency and community control
- **Chat is universal**: A simple conversation interface can handle complex workflows

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
