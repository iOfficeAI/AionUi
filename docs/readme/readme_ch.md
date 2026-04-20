<p align="center">
  <img src="../../resources/aionui-banner-1.png" alt="AionUi - Cowork with AI Agents" width="100%">
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
  <strong>免费、开源，与AI Agents协作的Cowork App</strong><br>
  <em>内置 Agent | 零配置 | 任意 API 密钥 | 多 Agent | 远程访问 | 跨平台 | 24/7 自动化</em>
</p>

<p align="center">
  <a href="https://github.com/iOfficeAI/AionUi/releases">
    <img src="https://img.shields.io/badge/⬇️%20立即下载-最新版本-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="下载最新版本" height="50">
  </a>
</p>

<p align="center">
  <a href="../../readme.md">English</a> | <strong>简体中文</strong> | <a href="./readme_tw.md">繁體中文</a> | <a href="./readme_jp.md">日本語</a> | <a href="./readme_ko.md">한국어</a> | <a href="./readme_es.md">Español</a> | <a href="./readme_pt.md">Português</a> | <a href="./readme_tr.md">Türkçe</a> | <a href="./readme_ru.md">Русский</a> | <a href="./readme_uk.md">Українська</a> | <a href="https://www.aionui.com" target="_blank">官方网站</a>
</p>

<p align="center">
  <strong>💬 社区：</strong> <a href="https://discord.gg/2QAwJn7Egx" target="_blank">Discord (English)</a> | <a href="../../resources/wx-0413.png" target="_blank">微信 (中文群)</a> | <a href="https://twitter.com/AionUI" target="_blank">Twitter</a>
</p>

---

## 📋 快速导航

<p align="center">
[✨ Cowork 演示](#-cowork-演示) ·
[🤔 为什么选择 AionUi？](#-为什么选择-aionui-而非-claude-cowork) ·
[🚀 快速开始](#-快速开始) ·
[💬 社区](#-社区与支持)

</p>

---

## Cowork — AI Agent 与您并肩工作

**AionUi 不只是个聊天工具。** 它是一个真正的 Cowork 平台，AI Agent 就像您的得力助手，在电脑上帮您处理各种任务——读文件、写代码、查资料、自动化工作流。Agent 的一举一动都在您的掌控之中，透明可见。

|                       | 传统 AI 聊天客户端 | **AionUi (Cowork)**                                                                                          |
| :-------------------- | :----------------- | :----------------------------------------------------------------------------------------------------------- |
| AI 可以操作您的文件   | 有限或不可用       | **是 — 内置 Agent，完全文件访问**                                                                            |
| AI 可以执行多步骤任务 | 有限               | **是 — 自主执行，需您批准**                                                                                  |
| 从手机远程访问        | 很少               | **WebUI + Telegram / Lark / DingTalk / WeChat / WeCom**                                                      |
| 定时自动化            | 否                 | **Cron — 24/7 无人值守**                                                                                     |
| 同时运行多个 AI Agent | 否                 | **Claude Code、Codex、Qwen Code、Kiro、Hermes Agent、Snow CLI、Cursor Agent 等 20+ 个 — 自动检测，统一界面** |
| 价格                  | 免费 / 付费        | **免费且开源**                                                                                               |

<p align="center">
  <img src="../../resources/offica-ai BANNER-function.png" alt="AionUi Cowork Platform" width="800">
</p>

---

## 内置 Agent — 安装即用，零配置

AionUi 自带完整的 AI Agent。不像其他工具需要你手动安装各种 CLI 工具，**AionUi 装好就能用，开箱即用**。

- **无需安装 CLI 工具** — Agent 引擎已内置
- **无需复杂配置** — 使用 Google 登录或粘贴任意 API 密钥
- **完整的 Agent 能力** — 文件读写、网络搜索、图像生成、MCP 工具
- **现成的专业助手** — 内置 20 个专业助手（Cowork、PPT 生成器、Word 生成器、Excel 生成器、Morph PPT 3D、Pitch Deck 生成器、仪表板生成器、学术论文写作助手、财务模型生成器等），拿来就能用

<p align="center">
  <img src="../../resources/homepage.png" alt="Built-in Agents" width="800">
</p>

### **办公助手（PPT / Word / Excel）**

想把文档/表格直接交给 Agent？AionUi 内置 **[OfficeCLI](https://github.com/iOfficeAI/OfficeCli)**，让 PPT（Morph 转场）、Word（`.docx`）与 Excel（`.xlsx/.xlsm/.csv`）从需求到可交付结果更高效、更稳定。
三类助手对应各自的文件工作流：生成的成稿可直接编辑、可复用。

#### **PPT 助手**

> **输出：可编辑 Morph PPT（`.pptx`）**
> 页间转场连贯、风格统一；底层由 [OfficeCLI](https://github.com/iOfficeAI/OfficeCli) 驱动。

<table>
  <tr>
    <td align="center" width="50%">
      <img src="../../resources/morph-ppt-balanced.gif" alt="Morph PPT — slide-to-slide transitions（由 OfficeCLI 实现）" width="390">
    </td>
    <td align="center" width="50%">
      <img src="../../resources/readme-demo-assistant-ppt.gif" alt="PPT 助手 — 录屏演示（与 OfficeCLI 联动）" width="390">
    </td>
  </tr>
</table>

#### **Word 助手**

> **输出：可编辑 Word（`.docx`）**
> 支持论文/写作的结构、段落与格式组织；底层由 [OfficeCLI](https://github.com/iOfficeAI/OfficeCli) 驱动。

<table>
  <tr>
    <td align="center" width="50%">
      <img src="../../resources/readme-demo-generate-academic-paper.gif" alt="生成学术论文演示（由 OfficeCLI 实现）" width="390">
    </td>
    <td align="center" width="50%">
      <img src="../../resources/readme-demo-assistant-write-paper.gif" alt="写论文助手演示（与 OfficeCLI 联动）" width="390">
    </td>
  </tr>
</table>

#### **Excel 助手**

> **输出：可直接复算的 Excel（`.xlsx/.xlsm/.csv`）**
> 用 `xlsx` 生成/更新表格，自动美化并完成数据分析；底层由 [OfficeCLI](https://github.com/iOfficeAI/OfficeCli) 驱动。

<table>
  <tr>
    <td align="center" width="50%">
      <img src="../../resources/readme-demo-generate-excel.gif" alt="Excel 生成演示（由 OfficeCLI 实现）" width="390">
    </td>
    <td align="center" width="50%">
      <img src="../../resources/readme-demo-assistant-excel.gif" alt="Excel 助手演示（与 OfficeCLI 联动）" width="390">
    </td>
  </tr>
</table>

---

## 多 Agent 模式 — 已有 CLI 工具？一起用起来

如果你已经在用 Claude Code、Codex 或 Qwen Code，AionUi 会自动发现它们，让你同时和这些 Agent 一起协作——当然，还有内置 Agent。

**支持的 Agent：** 内置 Agent（零配置） • Claude Code • Codex • Qwen Code • Goose AI • OpenClaw • Augment Code • CodeBuddy • Kimi CLI • OpenCode • Factory Droid • GitHub Copilot • Qoder CLI • Mistral Vibe • Nanobot • Aion CLI（aionrs，AionUi 自带的 Rust 后端服务） • Snow CLI • Kiro • Hermes Agent • Cursor Agent 等

<p align="center">
  <img src="../../resources/multi-agent支持openclaw.gif" alt="Multi-Agent Cowork" width="800">
</p>

- **自动检测** — 自动识别已安装的 CLI 工具
- **统一界面** — 一个 Cowork 平台管理所有 AI Agent
- **并行会话** — 同时运行多个 Agent，各自独立上下文
- **MCP 统一管理** — 配置一次 MCP（模型上下文协议）工具，自动同步到所有 Agent — 无需为每个 Agent 单独配置
- **YOLO Mode**（自动批准所有 Agent 操作，无需手动确认）/ **全自动模式** — 一键绕过权限提示；所有 Agent 均支持全自动无人值守执行

### Team Mode — 多 Agent 有序协作

以团队形式运行多个 AI Agent：**Leader** Agent 接收你的指令，将其分解为子任务，并通过内置 Team MCP Server 委派给 **Teammate** Agent。Teammate 并行执行，通过异步邮箱共享结果，并将进度写入共享任务看板。

<p align="center">
  <img src="../../resources/AionUi_team.gif" alt="Team Mode overview" width="800">
</p>

- **多 Agent 并行执行** — Leader 将任务分解为子任务并委派给并行运行的 Teammate Agent；每个 Teammate 通过 ACP（Agent Communication Protocol，AionUi 的多 Agent 协调层）、Gemini 或 Aionrs 使用独立模型
- **Leader 统筹编排** — Leader 分配、追踪并汇总结果；支持的后端包括 Claude Code、Codex、Gemini、Snow CLI 和 Aion CLI
- **团队隔离工作空间** — 所有 Agent 共享同一文件夹；每个 Agent 有独立的权限确认弹窗，侧边栏角标显示待确认项

<details>
<summary><strong>🔍 查看 Team Mode 详情 ▶️</strong></summary>

<br>

- **共享工作空间** — 所有 Agent 读写同一文件夹；文件面板全程可见
- **支持的后端** — Claude Code、Codex、Gemini、Snow CLI、Aion CLI（aionrs）；其他具备 `mcpCapabilities.stdio` 的 ACP 后端自动支持
- **动态伸缩** — 可在团队运行时添加或移除 Teammate；静默 Agent 自动升级为失败状态，支持一键移除
- **细粒度权限** — 每个 Agent 有独立的权限确认弹窗；侧边栏角标显示待确认项
- **文件共享** — Leader 可向 Teammate 传递文件附件

</details>

---

## 任意 API 密钥，都能获得完整 Cowork 能力

其他 AI 应用可能只给你个聊天窗口，**但 AionUi 给你的是完整的 Cowork Agent**。

| 您的 API 密钥                            | 您获得的功能                                 |
| :--------------------------------------- | :------------------------------------------- |
| Gemini API 密钥（或 Google 登录 — 免费） | Gemini 驱动的 Cowork Agent                   |
| OpenAI API 密钥                          | GPT 驱动的 Cowork Agent                      |
| Anthropic API 密钥                       | Claude 驱动的 Cowork Agent                   |
| AWS Bedrock 凭证                         | 通过 Aion CLI（aionrs）的 Bedrock 驱动 Agent |
| Ollama / LM Studio（本地）               | 本地模型 Cowork Agent                        |
| NewAPI 网关                              | 统一访问 20+ 模型                            |

不管用哪个模型，Agent 的能力都一样强大——文件读写、网络搜索、图像生成、工具调用，一个不少。AionUi 支持 **20+ 个 AI 平台**，云端本地都能用。

<p align="center">
  <img src="../../resources/llm_newapi.png" alt="Multi-Model Support" width="800">
</p>

<details>
<summary><strong>🔍 查看全部 20+ 个支持的平台 ▶️</strong></summary>

<br>

**全面的平台支持：**

- **官方平台** — Gemini、Gemini (Vertex AI)、Anthropic (Claude)、OpenAI
- **云服务提供商** — AWS Bedrock、New API（统一 AI 模型网关）
- **中国平台** — Dashscope (Qwen)、智谱、Moonshot (Kimi)、千帆 (百度)、混元 (腾讯)、零一万物、ModelScope、InfiniAI、天翼云、阶跃星辰
- **国际平台** — DeepSeek、MiniMax、OpenRouter、SiliconFlow、xAI、Ark (火山引擎)、Poe
- **本地模型** — Ollama、LM Studio（通过自定义平台设置本地 API 端点）

AionUi 还支持 [NewAPI](https://github.com/QuantumNous/new-api) 网关服务 — 一个统一的 AI 模型中心，聚合和分发各种大语言模型。在同一界面中灵活切换不同模型，满足各种任务需求。

</details>

---

## 可扩展的助手与技能生态

_灵活的助手系统，内置 20 个专业助手，支持三层技能体系，可自由创建和管理助手与技能。_

- **打造专属助手** — 按你的需求定制助手，设置专属规则和能力
- **三层技能体系** — 内置技能（随 AionUi 附带）、自定义技能（你自己的）以及扩展技能（第三方扩展贡献）；通过技能指示器按对话启用/禁用
- **对话级控制** — 聊天头部的技能指示器显示当前对话的活跃技能；可随时搜索和排除技能

<p align="center">
  <img src="../../resources/assitants.png" alt="AI Assistants & Skills Ecosystem" width="800">
</p>

<details>
<summary><strong>🔍 查看助手详情和自定义技能 ▶️</strong></summary>

<br>

AionUi 内置 **20 个专业助手**，每个都有独特能力，还能通过自定义技能继续扩展：

- **🤝 Cowork** — 自主任务执行（文件操作、文档处理、工作流规划）
- **📊 PPT 生成器 / Morph PPT / Morph PPT 3D** — 生成并制作带 Morph 转场的 PPTX 演示文稿
- **📐 Pitch Deck 生成器** — 投资人级 Pitch Deck 生成
- **📊 仪表板生成器** — 数据仪表板生成
- **📝 Word 生成器** — 生产就绪的 Word（`.docx`）文档生成
- **📗 Excel 生成器** — 带分析、图表和自动格式化的表格生成
- **🎓 学术论文写作助手** — 结构化学术论文写作
- **💰 财务模型生成器** — 财务模型与预测
- **⭐ Star Office 助手** — 办公效率助手
- **📄 PDF 转 PPT** — 将 PDF 转换为 PPT
- **🎮 3D 游戏** — 单文件 3D 游戏生成
- **🎨 UI/UX Pro Max** — 专业 UI/UX 设计（57 种风格，95 个调色板）
- **📋 文件规划助手** — 用文件管理复杂任务（Manus 风格的持久化 Markdown 规划）
- **🧭 HUMAN 3.0 教练** — 你的个人成长教练
- **📣 社交招聘发布** — 帮你发布招聘信息
- **🦞 moltbook** — 零部署 AI Agent 社交网络
- **📈 Beautiful Mermaid** — 流程图、时序图等
- **🔧 OpenClaw 设置** — OpenClaw 集成的设置和配置助手
- **📖 故事角色扮演** — 沉浸式故事角色扮演，支持角色卡和世界信息（兼容 SillyTavern）

**自定义技能**：在 `skills/` 目录下创建你的专属技能，随时为助手开启或关闭，让 AI 能力无限扩展。技能来源分三层：内置（随 AionUi 附带）、自定义（你自己的）以及扩展（通过扩展 SDK 贡献）。内置技能有 `pptx`、`docx`、`pdf`、`xlsx`、`mermaid` 等。

> 💡 每个助手都用 markdown 文件定义，想看看怎么做的？去 `assistant/` 目录找例子。

</details>

---

## 随时随地，想用就用

_你的 24/7 AI 助手 — 手机、平板、电脑，随时随地都能用。_

- **WebUI 模式** — 用浏览器就能访问，手机、平板、电脑都行。支持局域网、跨网络和服务器部署，扫码或密码登录，简单方便。

- **聊天平台集成**
  - **Telegram** — 直接在 Telegram 中与 AI Agent Cowork
  - **Lark (飞书)** — 通过飞书机器人进行企业 Cowork
  - **DingTalk** — AI Card 流式更新，自动回退
  - **WeChat** — 微信个人号接入
  - **WeCom（企业微信）** — 企业微信机器人，团队协作
  - **Slack** 等更多平台即将推出

> **设置：** AionUi 设置 → WebUI 设置 → Channel，配置 Bot Token。

<p align="center">
  <img src="../../resources/webui-remote.gif" alt="WebUI remote access demo" width="800">
</p>

<p align="center"><em>远程监管你的 Agent — Claude、Gemini、Codex，浏览器或手机即可远程控制与查看，如同 Claude Code remote。</em></p>

> [远程互联网访问教程](https://github.com/iOfficeAI/AionUi/wiki/Remote-Internet-Access-Guide-Chinese)

## ✨ Cowork 演示

### **定时任务 — 设置一次，自动运行**

_一次设置，AI Agent 就会按你的计划自动工作 — 真正的 24/7 无人值守。_

- **像聊天一样简单** — 用自然语言告诉 Agent 要做什么就行
- **三种调度模式** — 标准 Cron 表达式（支持时区）、固定间隔（每 N 分钟/小时）或一次性触发
- **AI 自建任务** — Agent 在对话中可自主创建定时任务
- **适用场景：** 定时汇总数据、自动生成报告、整理文件、发送提醒

<p align="center">
  <img src="../../resources/alart-task.png" alt="Scheduled Tasks" width="800">
</p>

<details>
<summary><strong>🔍 查看定时任务详情 ▶️</strong></summary>

<br>

**调度模式：**

- `Cron 表达式` — 标准五字段 Cron，支持时区（例如 `0 9 * * 1`，`Asia/Shanghai`）
- `每 N 分钟/小时` — 固定间隔，例如每 30 分钟运行一次
- `一次性` — 在指定日期时间触发一次，之后自动停用

**执行模式：**

- `继续已有对话` — 追加到绑定对话，AI 保留完整上下文历史
- `每次新建对话` — 每次触发时开启新会话，适合独立的周期性报告

**其他功能：**

- **绑定会话** — 每个定时任务都绑定到特定会话，上下文和历史记录都会保留
- **自动执行** — 到点就自动运行，结果直接发到对应会话
- **管理方便** — 随时创建、修改、开启/关闭、删除或查看定时任务
- **防休眠** — AionUi 会自动阻止系统休眠，任务激活期间检测唤醒后的漏触发
- **高级配置** — 每个任务可单独设置模型、工作目录和推理力度

**实际示例：**

- 每日天气报告生成
- 每周销售数据汇总
- 每月备份文件整理
- 自定义提醒通知

</details>

---

### **预览面板 — AI 生成的结果，立即就能看**

_支持 10+ 种格式：PDF、Word、Excel、PPT、代码、Markdown、图像、HTML、Diff — 不用切换应用，所有内容都能直接预览。_

- **秒开预览** — Agent 一生成文件，立马就能看到结果，不用切来切去
- **实时同步 + 直接编辑** — 文件一有变化就自动同步；Markdown、代码、HTML 都能实时编辑
- **多标签并行** — 同时打开多个文件，每个文件都有独立标签，管理更方便
- **版本回溯** — 随时查看和恢复文件的历史版本（基于 Git）

<p align="center">
  <img src="../../resources/preview.gif" alt="Preview Panel" width="800">
</p>

<details>
<summary><strong>🔍 查看完整格式列表 ▶️</strong></summary>

<br>

**支持的预览格式：**

- **文档** — PDF、Word (`.doc`, `.docx`, `.odt`)、Excel (`.xls`, `.xlsx`, `.ods`, `.csv`)、PowerPoint (`.ppt`, `.pptx`, `.odp`)
- **代码** — JavaScript、TypeScript、Python、Java、Go、Rust、C/C++、CSS、JSON、XML、YAML、Shell 脚本等 30+ 种编程语言
- **标记** — Markdown (`.md`, `.markdown`)、HTML (`.html`, `.htm`)
- **图像** — PNG、JPG、JPEG、GIF、SVG、WebP、BMP、ICO、TIFF、AVIF
- **其他** — Diff 文件 (`.diff`, `.patch`)

</details>

---

### **智能文件管理 — 让 AI 帮你整理文件**

_批量重命名、自动整理、智能分类、文件合并 — 这些繁琐的事，交给 Cowork Agent 就行。_

<p align="center">
  <img src="../../resources/aionui sort file 2.gif" alt="Smart File Management" width="800">
</p>

<details>
<summary><strong>🔍 查看文件管理功能详情 ▶️</strong></summary>

<br>

- **自动整理** — AI 会识别文件内容并自动分类，让文件夹保持整洁
- **批量处理** — 一键重命名、合并文件，再也不用一个个手动操作了
- **全自动执行** — AI Agent 可以独立完成文件操作、读写文件，自动搞定一切

**实际应用：**

- 把下载文件夹里乱七八糟的文件按类型整理好
- 批量给照片重命名，用有意义的名称
- 把多个文档合并成一个
- 按内容自动给文件分类

</details>

---

### **Excel 数据处理 — 让 AI 帮你分析数据**

_深度分析 Excel 数据，自动美化报告，生成洞察 — 这些复杂的数据工作，AI Agent 全包了。_

<p align="center">
  <img src="../../resources/generate_xlsx.gif" alt="Excel Processing" width="800">
</p>

<details>
<summary><strong>🔍 查看 Excel 处理功能 ▶️</strong></summary>

<br>

- **智能分析** — AI 会分析数据规律，帮你发现关键洞察
- **自动美化** — 自动把 Excel 报告做得专业又好看
- **数据转换** — 用自然语言就能转换、合并和重组数据
- **报告生成** — 从原始数据直接生成完整的分析报告

**实际应用：**

- 分析销售数据，自动生成月度报告
- 清理和格式化那些乱七八糟的 Excel 文件
- 智能合并多个表格，数据不丢失
- 自动创建数据可视化和图表

</details>

---

### **AI 图像生成与编辑**

_想生成图片、编辑图片、识别图片？Gemini 驱动的 AI 图像功能，样样都行_

<p align="center">
  <img src="../../resources/Image_Generation.gif" alt="AI Image Generation" width="800">
</p>

<details>
<summary><strong>🔍 查看图像生成功能 ▶️</strong></summary>

<br>

- **文本到图像** — 从自然语言描述生成图像
- **图像编辑** — 修改和增强现有图像
- **图像识别** — 分析和描述图像内容
- **批量处理** — 一次生成多张图像

</details>

> [图像生成模型配置指南](https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide)

---

### **文档生成 — PPT、Word、Markdown 都能搞定**

_演示文稿、报告、文档 — 这些专业文档，AI Agent 都能自动生成。_

<p align="center">
  <img src="../../resources/file_generation_preview.png" alt="Document Generation" width="800">
</p>

<details>
<summary><strong>🔍 查看文档生成功能 ▶️</strong></summary>

<br>

- **PPTX 生成器** — 给个大纲或主题，就能生成专业的演示文稿
- **Word 文档** — 自动生成格式规范、结构清晰的 Word 文档
- **Markdown 文件** — 创建和格式化 Markdown 文档，排版自动搞定
- **PDF 转换** — 各种文档格式之间自由转换

**使用场景：**

- 生成季度业务演示文稿
- 创建技术文档
- 将 PDF 转换为可编辑格式
- 自动格式化研究论文

</details>

### **个性化界面定制**

_想怎么改就怎么改，用 CSS 代码打造你的专属界面_

<p align="center">
  <img src="../../resources/css with skin.gif" alt="CSS Customization" width="800">
</p>

- ✅ **完全自由定制** — 用 CSS 代码随意调整颜色、样式、布局，打造独一无二的界面

---

### **多任务并行处理**

_同时开多个对话，任务不会乱，每个都有独立记忆，效率直接翻倍_

<p align="center">
  <img src="../../resources/multichat-side-by-side.gif" alt="Multi-Task Parallel" width="800">
</p>

- ✅ **独立上下文** — 每个对话都有自己的上下文和历史，互不干扰
- ✅ **并行执行** — 多个任务同时进行，各干各的，互不影响
- ✅ **智能管理** — 对话之间轻松切换，还有视觉提示，一目了然

---

## 🤔 为什么选择 AionUi 而非 Claude Cowork？

<details>
<summary><strong>点击查看详细对比</strong></summary>

<br>

AionUi 是一个**免费开源的 Multi-AI Agent 桌面应用**。相比只能在 macOS 上用、还只能绑定 Claude 的 Claude Cowork，AionUi 支持全模型、跨平台，是它的全面升级版。

| 维度     | Claude Cowork | AionUi                                                         |
| :------- | :------------ | :------------------------------------------------------------- |
| OS       | 仅 macOS      | macOS / Windows / Linux                                        |
| 模型支持 | 仅 Claude     | Gemini、Claude、DeepSeek、OpenAI、Ollama 等                    |
| 交互     | 桌面 GUI      | 桌面 GUI + WebUI + Telegram / Lark / DingTalk / WeChat / WeCom |
| 自动化   | 仅手动        | Cron 定时任务 — 24/7 无人值守                                  |
| 成本     | $100/月       | 免费且开源                                                     |

深度 AI 办公场景支持：

- **文件管理**：智能整理本地文件夹，一键批量重命名。
- **数据处理**：深入分析并自动美化 Excel 报告。
- **文档生成**：自动编写和格式化 PPT、Word 和 Markdown 文档。
- **即时预览**：内置 10+ 种格式预览面板，AI Cowork 结果立即可见。

</details>

---

## 常见问题

<details>
<summary><strong>问：我需要先安装 Gemini CLI 或 Claude Code 吗？</strong></summary>
答：<strong>完全不需要。</strong> AionUi 自带 AI Agent，装好就能用。用 Google 登录或者输入任意 API 密钥就行。如果你已经装了 Claude Code 或 Gemini CLI 这些 CLI 工具，AionUi 会自动发现并集成它们，功能更强大。
</details>

<details>
<summary><strong>问：我可以用 AionUi 做什么？</strong></summary>
答：AionUi 就是你的<strong>私有 Cowork 工作空间</strong>。内置 Agent 可以帮你批量整理文件夹、处理 Excel 数据、生成文档、搜索网络、生成图像。通过多 Agent 模式，你还能在同一界面同时使用 Claude Code、Codex 和其他强大的 CLI Agent。
</details>

<details>
<summary><strong>问：它是免费的吗？</strong></summary>
答：AionUi 完全免费且开源。你可以用 Google 登录免费使用 Gemini，或者用任何你喜欢的 API 密钥。
</details>

<details>
<summary><strong>问：我的数据安全吗？</strong></summary>
答：所有数据都保存在本地 SQLite 数据库里，不会上传到任何服务器，完全安全。
</details>

---

## 看看大家是怎么用 AionUi 的

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
  <em>WorldofAI (20 万订阅者)</em> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <em>Julian Goldie SEO (31.8 万订阅者)</em>
</p>

### 社区文章

- [开源免费 Cowork，全模型集成 + 自主文件操作](https://mp.weixin.qq.com/s/F3f-CCsVPaK3lK00jXhOOg) — 开源 AI 项目落地
- [让普通人像使用 APP 一样使用 Claude Code](https://mp.weixin.qq.com/s/TsMojSbkUUFvsd-HQCazZg) — 懒猫爱摸鱼
- [5500 Stars：开源如何打破 Anthropic 的 AI 工具护城河](https://mp.weixin.qq.com/s/saEk49cYV6MqBgw19Lw6Gw) — AI 硅基时刻

> **制作了关于 AionUi 的视频？** [在 X 上告诉我们](https://x.com/AionUi)，我们会在这里展示！

---

## 🚀 快速开始

### 系统要求

- **macOS**: 10.15 或更高版本
- **Windows**: Windows 10 或更高版本
- **Linux**: Ubuntu 18.04+ / Debian 10+ / Fedora 32+
- **内存**: 建议 4GB 以上
- **存储**: 至少 500MB 可用空间

### 安装

<p>
  <a href="https://github.com/iOfficeAI/AionUi/releases">
    <img src="https://img.shields.io/badge/下载-最新版本-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="下载最新版本" height="50">
  </a>
</p>

点击上方按钮前往 Releases 页面，下载适合您平台的安装包（macOS / Windows / Linux）。

```bash
# 或者，macOS 通过 Homebrew
brew install aionui
```

### 三步上手

1. **安装** AionUi
2. **登录** Google 账号或输入任意 API 密钥
3. **开始 Cowork** — 内置 AI Agent 已经准备好了

### 📖 详细指南

<details>
<summary><strong>📖 展开查看完整使用指南</strong></summary>

<br>

**🚀 快速开始**

- [📖 完整安装指南](https://github.com/iOfficeAI/AionUi/wiki/Getting-Started) — 从下载到配置，一步步教你
- [⚙️ LLM 配置指南](https://github.com/iOfficeAI/AionUi/wiki/LLM-Configuration) — 多平台 AI 模型怎么配置
- [🤖 多 Agent 模式设置](https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup) — 把终端 AI Agent 集成进来
- [🔌 MCP 工具配置](https://github.com/iOfficeAI/AionUi/wiki/MCP-Configuration-Guide) — 模型上下文协议服务器设置
- [🌐 WebUI 配置指南](https://github.com/iOfficeAI/AionUi/wiki/WebUI-Configuration-Guide) — WebUI 完整设置教程

**🎯 使用场景**

- [📁 文件管理](https://github.com/iOfficeAI/AionUi/wiki/file-management) — 让 AI 帮你整理文件
- [📊 Excel 处理](https://github.com/iOfficeAI/AionUi/wiki/excel-processing) — AI 驱动的数据处理
- [🎨 图像生成](https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide) — AI 图像生成
- [📚 更多使用场景](https://github.com/iOfficeAI/AionUi/wiki/Use-Cases-Overview)

**❓ 支持与帮助**

- [❓ FAQ](https://github.com/iOfficeAI/AionUi/wiki/FAQ) — 常见问题和解决方案
- [🔧 配置与使用教程](https://github.com/iOfficeAI/AionUi/wiki/Configuration-Guides) — 完整配置文档

</details>

---

## 💬 社区与支持

**你的想法很重要！** 我们非常重视每一个建议和反馈。

<p align="center">
  <a href="https://x.com/AionUi" target="_blank">
    <img src="../../resources/contactus-x.png" alt="Contact Us on X" width="600">
  </a>
</p>

- [GitHub Discussions](https://github.com/iOfficeAI/AionUi/discussions) — 分享想法，交流使用技巧
- [报告问题](https://github.com/iOfficeAI/AionUi/issues) — 遇到 bug 或有新功能想法？告诉我们
- [发布更新](https://github.com/iOfficeAI/AionUi/releases) — 获取最新版本
- [Discord 社区](https://discord.gg/2QAwJn7Egx) — 英语社区
- [微信群](../../resources/wx-0413.png) — 中文社区

### 贡献

请在提交 PR 前阅读 [CONTRIBUTING.md](../../CONTRIBUTING.md)。

1. Fork 本项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

### 开发环境搭建

技术栈：Electron · Vite · React · Bun

```bash
bun install        # 安装依赖
bun run dev        # 启动开发服务器
bun run test       # 运行单元测试
```

---

### 🙏 特别感谢

<table>
<tr>
<td width="170" align="center">
  <a href="https://linux.do/" target="_blank">
    <img src="../../resources/linuxdo.png" alt="LINUX DO" width="150">
  </a>
</td>
<td>
  <a href="https://linux.do/" target="_blank">LINUX DO</a> - 新的理想型社区。
</td>
</tr>
<tr>
<td width="170" align="center">
  <a href="https://packycode.com" target="_blank">
    <img src="../../resources/packycode.png" alt="PackyCode" width="150">
  </a>
</td>
<td>
  <a href="https://packycode.com" target="_blank">PackyCode</a> 是一家可靠高效的 API 中继服务提供商，为 Claude Code、Codex、Gemini 等平台提供中继服务。感谢 PackyCode 为支持 AionUi 用户低成本使用，为我们的用户提供专属 <a href="https://www.packyapi.com/register?aff=aionui" target="_blank">9折优惠</a>，付款时使用优惠码 <code>aionui</code> 可立减 10%。
</td>
</tr>
<tr>
<td width="170" align="center">
  <a href="https://atomgit.com/iOfficeAI/AionUi" target="_blank">AtomGit</a>
</td>
<td>
  <a href="https://atomgit.com/iOfficeAI/AionUi" target="_blank">AtomGit</a> — 面向全球开发者的开源社区与代码托管平台。AionUi 已在 AtomGit 上线，欢迎访问。
</td>
</tr>
</table>

---

## 许可证

本项目采用 [Apache-2.0](../../LICENSE) 许可证。

---

## 贡献者

<p align="center">
  <a href="https://github.com/iOfficeAI/AionUi/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=iOfficeAI/AionUi&max=100" alt="Contributors" />
  </a>
</p>

## Star 历史

<p align="center">
  <a href="https://www.star-history.com/#iOfficeAI/aionui&Date" target="_blank">
    <img src="https://api.star-history.com/svg?repos=iOfficeAI/aionui&type=Date" alt="Star History" width="600">
  </a>
</p>

<div align="center">

**如果觉得不错，给我们点个 Star 吧**

[报告 Bug](https://github.com/iOfficeAI/AionUi/issues) · [请求功能](https://github.com/iOfficeAI/AionUi/issues)

</div>
