<p align="center">
  <img src="./resources/aionui-banner-1.png" alt="AionUi - Cowork with AI Agents" width="100%">
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
  <strong>A free, open-source, Cowork app with AI Agents</strong><br>
  <em>Built-in Agent | Zero Setup | Any API Key | Multi-Agents | Remote Access | Cross-Platform | 24/7 Automation</em>
</p>

<p align="center">
  <a href="https://github.com/iOfficeAI/AionUi/releases">
    <img src="https://img.shields.io/badge/⬇️%20Download%20Now-Latest%20Release-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="Download Latest Release" height="50">
  </a>
</p>

<p align="center">
  <strong>English</strong> | <a href="./docs/readme/readme_ch.md">简体中文</a> | <a href="./docs/readme/readme_tw.md">繁體中文</a> | <a href="./docs/readme/readme_jp.md">日本語</a> | <a href="./docs/readme/readme_ko.md">한국어</a> | <a href="./docs/readme/readme_es.md">Español</a> | <a href="./docs/readme/readme_pt.md">Português</a> | <a href="./docs/readme/readme_tr.md">Türkçe</a> | <a href="./docs/readme/readme_ru.md">Русский</a> | <a href="./docs/readme/readme_uk.md">Українська</a> | <a href="https://www.aionui.com" target="_blank">Official Website</a>
</p>

<p align="center">
  <strong>💬 Community:</strong> <a href="https://discord.gg/2QAwJn7Egx" target="_blank">Discord (English)</a> | <a href="./resources/wx-0413.png" target="_blank">微信 (中文群)</a> | <a href="https://twitter.com/AionUI" target="_blank">Twitter</a>
</p>

---

## 📋 Quick Navigation

<p align="center">

[Cowork in Action](#-cowork-in-action) ·
[Why Choose AionUi?](#-why-choose-aionui-over-claude-cowork) ·
[Quick Start](#-quick-start) ·
[Community](#-community--support)

</p>

---

## Cowork — AI Agents That Work Alongside You

**AionUi is more than a chat client.** It's a Cowork platform where AI agents work alongside you on your computer — reading files, writing code, browsing the web, and automating tasks. You see everything the agent does, and you're always in control.

|                                 | Traditional AI Chat Clients | **AionUi (Cowork)**                                                                                                           |
| :------------------------------ | :-------------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| AI can operate on your files    | Limited or No               | **Yes — built-in agent with full file access**                                                                                |
| AI can execute multi-step tasks | Limited                     | **Yes — autonomous with your approval**                                                                                       |
| Remote access from phone        | Rarely                      | **WebUI + Telegram / Lark / DingTalk / WeChat / WeCom**                                                                       |
| Scheduled automation            | No                          | **Cron — 24/7 unattended**                                                                                                    |
| Multiple AI Agents at once      | No                          | **Claude Code, Codex, Qwen Code, Kiro, Hermes Agent, Snow CLI, Cursor Agent and 16+ more — auto-detected, unified interface** |
| Price                           | Free / Paid                 | **Free & Open Source**                                                                                                        |

<p align="center">
  <img src="./resources/offica-ai BANNER-function.png" alt="AionUi Cowork Platform" width="800">
</p>

---

## Built-in Agent — Install & Go, Zero Configuration

AionUi ships with a complete AI agent engine. Unlike tools that require you to install CLI agents separately, **AionUi works the moment you install it**.

- **No CLI tools to install** — the agent engine is built in
- **No complex setup** — sign in with Google or paste any API key
- **Full agent capabilities** — file read/write, web search, image generation, MCP (Model Context Protocol) tools
- **Ready-to-use assistants** — 20 built-in professional assistants (Cowork, PPT Creator, Word Creator, Excel Creator, Morph PPT 3D, Pitch Deck Creator, Dashboard Creator, Academic Paper Writer, Financial Model Creator, and more) ready to use immediately

<p align="center">
  <img src="./resources/homepage.png" alt="Built-in Agents" width="800">
</p>

### **Office assistants — PPT, Word & Excel**

These tracks match what the app actually ships: **Morph PPT** presets and the **`pptx` / `docx` / `xlsx` skills** (see `assistant/` presets and `skills/` in the repo). Want document/table output? AionUi’s built-in **[OfficeCLI](https://github.com/iOfficeAI/OfficeCli)** helps PPT (Morph), Word (`.docx`), and Excel (`.xlsx/.xlsm/.csv`) go from request to deliverable faster and more reliably.
The three assistant types map to file workflows, and the final outputs are directly editable and reusable.

#### **PPT assistant**

> **Output:** editable Morph PPT (`.pptx`)
> Morph-animated slide-to-slide transitions with coherent story pacing; powered by [OfficeCLI](https://github.com/iOfficeAI/OfficeCli).

<table>
  <tr>
    <td align="center" width="50%">
      <img src="./resources/morph-ppt-balanced.gif" alt="Morph PPT — slide-to-slide transitions (OfficeCLI)" width="390">
    </td>
    <td align="center" width="50%">
      <img src="./resources/readme-demo-assistant-ppt.gif" alt="PPT assistant — screen recording" width="390">
    </td>
  </tr>
</table>

#### **Word assistant**

> **Output:** editable Word (`.docx`)
> Paper/thesis writing and production-ready document editing via the `docx` skill; powered by [OfficeCLI](https://github.com/iOfficeAI/OfficeCli).

<table>
  <tr>
    <td align="center" width="50%">
      <img src="./resources/readme-demo-generate-academic-paper.gif" alt="Generate academic paper demo" width="390">
    </td>
    <td align="center" width="50%">
      <img src="./resources/readme-demo-assistant-write-paper.gif" alt="Paper writing assistant demo" width="390">
    </td>
  </tr>
</table>

#### **Excel assistant**

> **Output:** usable Excel (`.xlsx/.xlsm/.csv`)
> Generate/refresh spreadsheets with `xlsx` for analysis, auto-formatting, and charts; powered by [OfficeCLI](https://github.com/iOfficeAI/OfficeCli).

<table>
  <tr>
    <td align="center" width="50%">
      <img src="./resources/readme-demo-generate-excel.gif" alt="Excel generation demo" width="390">
    </td>
    <td align="center" width="50%">
      <img src="./resources/readme-demo-assistant-excel.gif" alt="Excel assistant demo" width="390">
    </td>
  </tr>
</table>

---

## Multi-Agent Mode — Already Have CLI Agents? Bring Them In

If you already use Claude Code, Codex, or Qwen Code, AionUi auto-detects them and lets you Cowork with all of them — alongside the built-in agent.

**Supported Agents:** Built-in Agent (zero setup) • Claude Code • Codex • Qwen Code • Goose AI • OpenClaw • Augment Code • CodeBuddy • Kimi CLI • OpenCode • Factory Droid • GitHub Copilot • Qoder CLI • Mistral Vibe • Nanobot • Aion CLI (aionrs, the Rust-based backend service bundled with AionUi) • Snow CLI • Kiro • Hermes Agent • Cursor Agent and more

<p align="center">
  <img src="./resources/multi-agent支持openclaw.gif" alt="Multi-Agent Cowork" width="800">
</p>

- **Auto Detection** — automatically recognizes installed CLI tools
- **Unified Interface** — one Cowork platform for all your AI agents
- **Parallel Sessions** — run multiple agents simultaneously with independent context
- **MCP Unified Management** — configure MCP (Model Context Protocol) tools once, automatically sync to all agents — no need to configure each agent separately
- **YOLO Mode** (auto-approve all agent actions without manual confirmation) / **Full-Auto Mode** — one click to bypass permission prompts; all agents support full-auto mode for unattended execution

### Team Mode — Coordinated Multi-Agent Collaboration

Run multiple AI agents as an organized team: a **Leader** agent receives your instructions, breaks them into subtasks, and delegates to **Teammate** agents via a built-in Team MCP Server. Teammates execute in parallel, share results through an async mailbox, and write to a shared task board.

<p align="center">
  <img src="./resources/AionUi_team.gif" alt="Team Mode overview" width="800">
</p>

- **Parallel multi-agent execution** — Leader breaks tasks into subtasks and delegates to Teammate agents running in parallel; each Teammate uses its own model via ACP (Agent Communication Protocol, AionUi's multi-agent coordination layer), Gemini, or Aionrs
- **Leader orchestration** — Leader assigns, tracks, and aggregates results; supported backends include Claude Code, Codex, Gemini, Snow CLI, and Aion CLI
- **Team-isolated workspace** — all agents share the same folder; each has its own permission dialog with sidebar badge for pending approvals

<details>
<summary><strong>🔍 View Team Mode Details ▶️</strong></summary>

<br>

- **Shared Workspace** — all agents read/write the same folder; the file panel stays visible throughout
- **Supported backends** — Claude Code, Codex, Gemini, Snow CLI, Aion CLI (aionrs); other ACP backends with `mcpCapabilities.stdio` are auto-supported
- **Dynamic scaling** — add or remove Teammates while the team is running; silent agents auto-escalate to failed with one-click removal
- **Granular permissions** — each agent has its own permission confirmation dialog; sidebar badge shows pending approvals
- **File sharing** — Leader can pass file attachments to Teammates

</details>

---

## Any API Key, Full Cowork Agent Power

Other AI apps give you a chatbox with your API key. **AionUi gives you a full Cowork agent.**

| Your API Key                            | What You Get                                |
| :-------------------------------------- | :------------------------------------------ |
| Gemini API Key (or Google login — free) | Gemini-powered Cowork Agent                 |
| OpenAI API Key                          | GPT-powered Cowork Agent                    |
| Anthropic API Key                       | Claude-powered Cowork Agent                 |
| AWS Bedrock credentials                 | Bedrock-powered Agent via Aion CLI (aionrs) |
| Ollama / LM Studio (local)              | Local model Cowork Agent                    |
| NewAPI Gateway                          | Unified access to 20+ models                |

Same agent capabilities — file read/write, web search, image generation, tool use — regardless of which model powers it. AionUi supports **20+ AI platforms** including cloud services and local deployments.

<p align="center">
  <img src="./resources/llm_newapi.png" alt="Multi-Model Support" width="800">
</p>

<details>
<summary><strong>🔍 View All 20+ Supported Platforms ▶️</strong></summary>

<br>

**Comprehensive Platform Support:**

- **Official Platforms** — Gemini, Gemini (Vertex AI), Anthropic (Claude), OpenAI
- **Cloud Providers** — AWS Bedrock, New API (unified AI model gateway)
- **Chinese Platforms** — Dashscope (Qwen), Zhipu, Moonshot (Kimi), Qianfan (Baidu), Hunyuan (Tencent), Lingyi, ModelScope, InfiniAI, Ctyun, StepFun
- **International Platforms** — DeepSeek, MiniMax, OpenRouter, SiliconFlow, xAI, Ark (Volcengine), Poe
- **Local Models** — Ollama, LM Studio (via Custom platform with local API endpoint)

AionUi also supports [NewAPI](https://github.com/QuantumNous/new-api) gateway service — a unified AI model hub that aggregates and distributes various LLMs. Flexibly switch between different models in the same interface to meet various task requirements.

</details>

---

## Extensible Assistants & Skills

_Extensible assistant system with 20 built-in professional assistants and a three-tier skill system. Create and manage your own assistants and skills._

- **Create Custom Assistants** — Define your own assistants with custom rules and capabilities
- **Three-tier Skills** — Builtin skills (shipped with AionUi), custom skills (your own), and Extension skills (contributed by third-party extensions); enable/disable per conversation with the skill indicator
- **Per-conversation Control** — A skill indicator in the chat header shows active skills for the current conversation; search and exclude skills as needed

<p align="center">
  <img src="./resources/assitants.png" alt="AI Assistants & Skills Ecosystem" width="800">
</p>

AionUi supports three skill layers: **built-in** skills (shipped with the app), **custom** skills (user-defined), and **extension** skills (loaded from the Extension SDK).

<details>
<summary><strong>🔍 View Assistant Details and Custom Skills ▶️</strong></summary>

<br>

AionUi includes **20 professional assistants** with predefined capabilities, extendable through custom skills:

- **🤝 Cowork** — Autonomous task execution (file operations, document processing, workflow planning)
- **📊 PPT Creator / Morph PPT / Morph PPT 3D** — Generate and animate PPTX presentations with Morph transitions
- **📐 Pitch Deck Creator** — Investor-ready pitch deck generation
- **📊 Dashboard Creator** — Data dashboard generation
- **📝 Word Creator** — Production-ready Word (`.docx`) document generation
- **📗 Excel Creator** — Spreadsheet generation with analysis, charts, and auto-formatting
- **🎓 Academic Paper Writer** — Structured academic paper writing
- **💰 Financial Model Creator** — Financial models and projections
- **⭐ Star Office Helper** — Office productivity assistant
- **📄 PDF to PPT** — Convert PDF to PPT
- **🎮 3D Game** — Single-file 3D game generation
- **🎨 UI/UX Pro Max** — Professional UI/UX design (57 styles, 95 color palettes)
- **📋 Planning with Files** — File-based planning for complex tasks (Manus-style persistent markdown planning)
- **🧭 HUMAN 3.0 Coach** — Personal development coach
- **📣 Social Job Publisher** — Job posting and publishing
- **🦞 moltbook** — Zero-deployment AI agent social networking
- **📈 Beautiful Mermaid** — Flowcharts, sequence diagrams, and more
- **🔧 OpenClaw Setup** — Setup and configuration assistant for OpenClaw integration
- **📖 Story Roleplay** — Immersive story roleplay with character cards and world info (SillyTavern compatible)

**Custom Skills**: Create skills in the `skills/` directory, enable/disable skills for assistants to extend AI capabilities. Skills come from three sources: builtin (shipped with AionUi), custom (your own), and Extension (contributed via the Extension SDK). Built-in skills include `pptx`, `docx`, `pdf`, `xlsx`, `mermaid`, and more.

> 💡 Each assistant is defined by a markdown file. Check the `assistant/` directory for examples.

</details>

---

## Cowork from Anywhere

_Your 24/7 AI assistant — access AionUi from any device, anywhere._

- **WebUI Mode** — access via browser from phone, tablet, or any computer. Supports LAN, cross-network, and server deployment. QR code or password login.

- **Chat Platform Integration**
  - **Telegram** — Cowork with your AI agent directly from Telegram
  - **Lark (Feishu)** — Cowork through Feishu bots for enterprise collaboration
  - **DingTalk** — AI Card streaming with automatic fallback
  - **WeChat** — Personal WeChat account integration
  - **WeCom (企业微信)** — Enterprise WeChat bot for team collaboration
  - **Slack** and more platforms coming soon

> **Setup:** AionUi Settings → WebUI Settings → Channel, configure the Bot Token.

<p align="center">
  <img src="./resources/webui-remote.gif" alt="WebUI remote access demo" width="800">
</p>

<p align="center"><em>Remote control &amp; monitor your agent — Claude, Gemini, Codex. Use from browser or phone, same as Claude Code remote.</em></p>

> [Remote Internet Access Tutorial](https://github.com/iOfficeAI/AionUi/wiki/Remote-Internet-Access-Guide-Chinese)

## ✨ Cowork in Action

### **Scheduled Tasks — Cowork on Autopilot**

_Set it up once, the AI agent runs automatically on schedule — truly 24/7 unattended operation._

- **Natural Language** — tell the agent what to do, just like chatting
- **Three scheduling modes** — standard cron expression (with timezone), fixed interval (every N minutes/hours), or one-time trigger
- **AI-created tasks** — agents can autonomously create scheduled tasks during a conversation
- **Use Cases:** scheduled data aggregation, report generation, file organization, reminders

<p align="center">
  <img src="./resources/alart-task.png" alt="Scheduled Tasks" width="800">
</p>

<details>
<summary><strong>🔍 View Scheduled Task Details ▶️</strong></summary>

<br>

**Scheduling modes:**

- `Cron expression` — standard 5-field cron with timezone support (e.g. `0 9 * * 1`, `Asia/Shanghai`)
- `Every N minutes/hours` — fixed interval, e.g. run every 30 minutes
- `One-time` — trigger once at a specified datetime, then auto-disable

**Execution modes:**

- `Continue in existing conversation` — appends to the bound conversation so the AI retains full context history
- `Create new conversation each time` — opens a fresh session on each trigger, ideal for independent periodic reports

**Other capabilities:**

- **Conversation-Bound** — Each scheduled task is bound to a conversation, maintaining context and history
- **Automatic Execution** — Tasks run automatically at scheduled times, sending messages to the conversation
- **Easy Management** — Create, modify, enable/disable, delete, and view scheduled tasks anytime
- **Keep-awake** — AionUi automatically prevents system sleep while tasks are active, and detects missed triggers after wake
- **Advanced config** — each task can have its own model, workspace directory, and reasoning effort settings

**Real-World Examples:**

- Daily weather report generation
- Weekly sales data aggregation
- Monthly backup file organization
- Custom reminder notifications

</details>

---

### **Preview Panel — Instantly View AI-Generated Results**

_10+ formats: PDF, Word, Excel, PPT, code, Markdown, images, HTML, Diff — view everything without switching apps._

- **Instant Preview** — after the agent generates files, view results immediately without switching apps
- **Real-time Tracking + Editable** — automatically tracks file changes; supports live editing of Markdown, code, HTML
- **Multi-Tab Support** — open multiple files simultaneously, each in its own tab
- **Version History** — view and restore historical versions of files (Git-based)

<p align="center">
  <img src="./resources/preview.gif" alt="Preview Panel" width="800">
</p>

<details>
<summary><strong>🔍 View Complete Format List ▶️</strong></summary>

<br>

**Supported Preview Formats:**

- **Documents** — PDF, Word (`.doc`, `.docx`, `.odt`), Excel (`.xls`, `.xlsx`, `.ods`, `.csv`), PowerPoint (`.ppt`, `.pptx`, `.odp`)
- **Code** — JavaScript, TypeScript, Python, Java, Go, Rust, C/C++, CSS, JSON, XML, YAML, Shell scripts, and 30+ programming languages
- **Markup** — Markdown (`.md`, `.markdown`), HTML (`.html`, `.htm`)
- **Images** — PNG, JPG, JPEG, GIF, SVG, WebP, BMP, ICO, TIFF, AVIF
- **Other** — Diff files (`.diff`, `.patch`)

</details>

---

### **Smart File Management — Automated File Operations**

_Batch renaming, automatic organization, smart classification, file merging — the Cowork agent handles it for you._

<p align="center">
  <img src="./resources/aionui sort file 2.gif" alt="Smart File Management" width="800">
</p>

<details>
<summary><strong>🔍 View File Management Features Details ▶️</strong></summary>

<br>

- **Auto Organize** — Intelligently identify content and auto-classify, keeping folders tidy
- **Efficient Batch** — One-click rename, merge files, say goodbye to tedious manual tasks
- **Automated Execution** — AI agents can independently execute file operations, read/write files, and complete tasks automatically

**Use Cases:**

- Organize messy download folders by file type
- Batch rename photos with meaningful names
- Merge multiple documents into one
- Auto-classify files by content

</details>

---

### **Excel Data Processing — AI-Powered Analysis**

_Deeply analyze Excel data, automatically beautify reports, and generate insights — all powered by AI agents._

<p align="center">
  <img src="./resources/generate_xlsx.gif" alt="Excel Processing" width="800">
</p>

<details>
<summary><strong>🔍 View Excel Processing Features ▶️</strong></summary>

<br>

- **Smart Analysis** — AI analyzes data patterns and generates insights
- **Auto Formatting** — Automatically beautify Excel reports with professional styling
- **Data Transformation** — Convert, merge, and restructure data with natural language commands
- **Report Generation** — Create comprehensive reports from raw data

**Use Cases:**

- Analyze sales data and generate monthly reports
- Clean and format messy Excel files
- Merge multiple spreadsheets intelligently
- Create data visualizations and charts

</details>

---

### **AI Image Generation & Editing**

_Intelligent image generation, editing, and recognition, powered by Gemini_

<p align="center">
  <img src="./resources/Image_Generation.gif" alt="AI Image Generation" width="800">
</p>

<details>
<summary><strong>🔍 View Image Generation Features ▶️</strong></summary>

<br>

- **Text-to-Image** — Generate images from natural language descriptions
- **Image Editing** — Modify and enhance existing images
- **Image Recognition** — Analyze and describe image content
- **Batch Processing** — Generate multiple images at once

</details>

> [Image generation model configuration guide](https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide)

---

### **Document Generation — PPT, Word, Markdown**

_Automatically generate professional documents — presentations, reports, and more — with AI agents._

<p align="center">
  <img src="./resources/file_generation_preview.png" alt="Document Generation" width="800">
</p>

<details>
<summary><strong>🔍 View Document Generation Features ▶️</strong></summary>

<br>

- **PPTX Generator** — Create professional presentations from outlines or topics
- **Word Documents** — Generate formatted Word documents with proper structure
- **Markdown Files** — Create and format Markdown documents for documentation
- **PDF Conversion** — Convert between various document formats

**Use Cases:**

- Generate quarterly business presentations
- Create technical documentation
- Convert PDF to editable formats
- Auto-format research papers

</details>

### **Personalized Interface Customization**

_Customize with your own CSS code, make your interface match your preferences_

<p align="center">
  <img src="./resources/css with skin.gif" alt="CSS Customization" width="800">
</p>

- ✅ **Fully Customizable** — Freely customize interface colors, styles, layout through CSS code, create your exclusive experience

---

### **Multi-Task Parallel Processing**

_Open multiple conversations, tasks don't get mixed up, independent memory, double efficiency_

<p align="center">
  <img src="./resources/multichat-side-by-side.gif" alt="Multi-Task Parallel" width="800">
</p>

- ✅ **Independent Context** — Each conversation maintains its own context and history
- ✅ **Parallel Execution** — Run multiple tasks simultaneously without interference
- ✅ **Smart Management** — Easy switching between conversations with visual indicators

---

## 🤔 Why Choose AionUi Over Claude Cowork?

<details>
<summary><strong>Click to see detailed comparison</strong></summary>

<br>

AionUi is a **free and open-source Multi-AI Agent Desktop**. Compared to Claude Cowork which only runs on macOS and is locked to Claude, AionUi is its full-model, cross-platform enhanced version.

| Dimension     | Claude Cowork | AionUi                                                            |
| :------------ | :------------ | :---------------------------------------------------------------- |
| OS            | macOS Only    | macOS / Windows / Linux                                           |
| Model Support | Claude Only   | Gemini, Claude, DeepSeek, OpenAI, Ollama, ...                     |
| Interaction   | Desktop GUI   | Desktop GUI + WebUI + Telegram / Lark / DingTalk / WeChat / WeCom |
| Automation    | Manual only   | Cron scheduled tasks — 24/7 unattended                            |
| Cost          | $100/month    | Free & Open Source                                                |

Deep AI Office Scenario Support:

- **File Management**: Intelligently organize local folders and batch rename with one click.
- **Data Processing**: Deeply analyze and automatically beautify Excel reports.
- **Document Generation**: Automatically write and format PPT, Word, and Markdown documents.
- **Instant Preview**: Built-in 10+ format preview panels, AI collaboration results instantly visible.

</details>

---

## Quick Q&A

<details>
<summary><strong>Q: Do I need to install Gemini CLI or Claude Code first?</strong></summary>
A: <strong>No.</strong> AionUi has a built-in AI agent that works immediately after installation. Just sign in with Google or enter any API key. If you also have CLI tools like Claude Code or Gemini CLI installed, AionUi will auto-detect and integrate them for even more capabilities.
</details>

<details>
<summary><strong>Q: What can I do with AionUi?</strong></summary>
A: AionUi is your <strong>private Cowork workspace</strong>. The built-in agent can batch organize folders, process Excel data, generate documents, search the web, and generate images. With Multi-Agent Mode, you can also leverage Claude Code, Codex, and other powerful CLI agents through the same interface.
</details>

<details>
<summary><strong>Q: Is it free?</strong></summary>
A: AionUi is completely free and open source. You can sign in with Google to use Gemini for free, or use API keys from any provider you prefer.
</details>

<details>
<summary><strong>Q: Can I run AionUi on a server (headless)?</strong></summary>
A: Yes — AionUi WebUI mode runs as a standalone HTTP server. See the WebUI section above for setup instructions.
</details>

<details>
<summary><strong>Q: Is my data secure?</strong></summary>
A: All data is stored locally in a SQLite database. Nothing is uploaded to any server.
</details>

---

## See How People Use AionUi

<p align="center">
  <a href="https://www.youtube.com/watch?v=yUU5E-U5B3M" target="_blank">
    <img src="https://img.youtube.com/vi/yUU5E-U5B3M/maxresdefault.jpg" alt="WorldofAI Review" width="400">
  </a>
  &nbsp;&nbsp;
  <a href="https://www.youtube.com/watch?v=enQnkKfth10" target="_blank">
    <img src="https://img.youtube.com/vi/enQnkKfth10/maxresdefault.jpg" alt="Julian Goldie SEO Review" width="400">
  </a>
</p>
<p align="center">
  <em>WorldofAI (200K subscribers)</em> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <em>Julian Goldie SEO (318K subscribers)</em>
</p>

### Community Articles

- [Open-source free Cowork, full model integration + autonomous file operations](https://mp.weixin.qq.com/s/F3f-CCsVPaK3lK00jXhOOg) — Open Source AI Project Landing
- [Making ordinary people use Claude Code like an APP](https://mp.weixin.qq.com/s/TsMojSbkUUFvsd-HQCazZg) — Lazy Cat Loves Fishing
- [5500 Stars: How Open Source Breaks Anthropic's AI Tool Moat](https://mp.weixin.qq.com/s/saEk49cYV6MqBgw19Lw6Gw) — AI Silicon Moment

> **Made a video about AionUi?** [Let us know on X](https://x.com/AionUi) and we'll feature it here!

---

## 🚀 Quick Start

### System Requirements

- **macOS**: 10.15 or higher
- **Windows**: Windows 10 or higher
- **Linux**: Ubuntu 18.04+ / Debian 10+ / Fedora 32+
- **Memory**: 4GB+ recommended
- **Storage**: 500MB+ available space

### Install

<p>
  <a href="https://github.com/iOfficeAI/AionUi/releases">
    <img src="https://img.shields.io/badge/Download-Latest%20Release-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="Download Latest Release" height="50">
  </a>
</p>

Click the button above to go to the Releases page and download the installer for your platform (macOS / Windows / Linux).

```bash
# Alternatively, macOS via Homebrew
brew install aionui
```

### Get Started in 3 Steps

1. **Install** AionUi
2. **Sign in** with Google account or enter any API key
3. **Start Coworking** — the built-in AI agent is ready to go

### 📖 Detailed Guides

<details>
<summary><strong>📖 Expand to View Complete Usage Guide</strong></summary>

<br>

**🚀 Quick Start**

- [📖 Complete Installation Guide](https://github.com/iOfficeAI/AionUi/wiki/Getting-Started) — Detailed steps from download to configuration
- [⚙️ LLM Configuration Guide](https://github.com/iOfficeAI/AionUi/wiki/LLM-Configuration) — Multi-platform AI model configuration
- [🤖 Multi-Agent Mode Setup](https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup) — Integrate terminal AI agents
- [🔌 MCP Tool Configuration](https://github.com/iOfficeAI/AionUi/wiki/MCP-Configuration-Guide) — Model Context Protocol server setup
- [🌐 WebUI Configuration Guide](https://github.com/iOfficeAI/AionUi/wiki/WebUI-Configuration-Guide) — Complete WebUI setup and configuration tutorial

**🎯 Use Cases**

- [📁 File Management](https://github.com/iOfficeAI/AionUi/wiki/file-management) — Smart file organization
- [📊 Excel Processing](https://github.com/iOfficeAI/AionUi/wiki/excel-processing) — AI-driven data processing
- [🎨 Image Generation](https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide) — AI image creation
- [📚 More Use Cases](https://github.com/iOfficeAI/AionUi/wiki/Use-Cases-Overview)

**❓ Support & Help**

- [❓ FAQ](https://github.com/iOfficeAI/AionUi/wiki/FAQ) — Questions and troubleshooting
- [🔧 Configuration & Usage Tutorials](https://github.com/iOfficeAI/AionUi/wiki/Configuration-Guides) — Complete configuration documentation

</details>

---

## 💬 Community & Support

**Your ideas matter!** We value every suggestion and feedback.

<p align="center">
  <a href="https://x.com/AionUi" target="_blank">
    <img src="./resources/contactus-x.png" alt="Contact Us on X" width="600">
  </a>
</p>

- [GitHub Discussions](https://github.com/iOfficeAI/AionUi/discussions) — share ideas and exchange tips
- [Report Issues](https://github.com/iOfficeAI/AionUi/issues) — bugs and feature requests
- [Release Updates](https://github.com/iOfficeAI/AionUi/releases) — get the latest version
- [Discord Community](https://discord.gg/2QAwJn7Egx) — English community
- [WeChat Group](./resources/wx-0413.png) — Chinese community

### Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

1. Fork this project
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Setup

Tech stack: Electron · Vite · React · Bun

```bash
bun install        # install dependencies
bun run dev        # start dev server
bun run test       # run unit tests
```

---

## License

This project is licensed under [Apache-2.0](LICENSE).

---

## Contributors

<p align="center">
  <a href="https://github.com/iOfficeAI/AionUi/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=iOfficeAI/AionUi&max=100" alt="Contributors" />
  </a>
</p>

## Star History

<p align="center">
  <a href="https://www.star-history.com/#iOfficeAI/aionui&Date" target="_blank">
    <img src="https://api.star-history.com/svg?repos=iOfficeAI/aionui&type=Date" alt="Star History" width="600">
  </a>
</p>

<div align="center">

**If you like it, give us a star**

[Report Bug](https://github.com/iOfficeAI/AionUi/issues) · [Request Feature](https://github.com/iOfficeAI/AionUi/issues)

</div>

<sub><a href="https://linux.do/">LINUX DO - A New Ideal Community</a></sub>
