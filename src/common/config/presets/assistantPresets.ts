import type { PresetAgentType } from '@/common/types/acpTypes';

export type AssistantPreset = {
  id: string;
  avatar: string;
  presetAgentType?: PresetAgentType;
  /**
   * Directory containing all resources for this preset (relative to project root).
   * If set, both ruleFiles and skillFiles will be resolved from this directory.
   * Default: rules/ for rules, skills/ for skills
   */
  resourceDir?: string;
  ruleFiles: Record<string, string>;
  skillFiles?: Record<string, string>;
  /**
   * Default enabled skills for this assistant (skill names from skills/ directory).
   * 此助手默认启用的技能列表（来自 skills/ 目录的技能名称）
   */
  defaultEnabledSkills?: string[];
  nameI18n: Record<string, string>;
  descriptionI18n: Record<string, string>;
  promptsI18n?: Record<string, string[]>;
};

export const ASSISTANT_PRESETS: AssistantPreset[] = [
  {
    id: 'morph-ppt',
    avatar: '✨',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/morph-ppt',
    ruleFiles: {
      'en-US': 'morph-ppt.md',
      'zh-CN': 'morph-ppt.zh-CN.md',
    },
    defaultEnabledSkills: ['morph-ppt'],
    nameI18n: {
      'en-US': 'Morph PPT',
      'zh-CN': 'Morph PPT',
    },
    descriptionI18n: {
      'en-US':
        'Create professional Morph-animated presentations with officecli. Supports multiple visual styles and end-to-end workflow from topic to polished slides.',
      'zh-CN': '使用 officecli 创建专业的 Morph 动画演示文稿。支持多种视觉风格，从主题到精美幻灯片的端到端工作流。',
    },
    promptsI18n: {
      'en-US': [
        'Pick a fun topic yourself and create a complete PPT',
        'Create the most beautiful PPT you can imagine, topic is up to you',
        'Create a coffee brand introduction PPT with a minimalist premium feel',
      ],
      'zh-CN': [
        '自己想一个有趣的主题，帮我做一份PPT',
        '做一个你认为最好看的 PPT，主题你定',
        '做一份咖啡品牌介绍PPT，要极简高级感',
      ],
    },
  },
  {
    id: 'star-office-helper',
    avatar: '📺',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/star-office-helper',
    ruleFiles: {
      'en-US': 'star-office-helper.md',
      'zh-CN': 'star-office-helper.zh-CN.md',
    },
    defaultEnabledSkills: ['star-office-helper'],
    nameI18n: {
      'en-US': 'Star Office Helper',
      'zh-CN': 'Star Office 助手',
    },
    descriptionI18n: {
      'en-US': 'Install, connect, and troubleshoot Star-Office-UI visualization for Aion preview.',
      'zh-CN': '用于在 Aion 预览中安装、连接并排查 Star-Office-UI 可视化问题。',
    },
    promptsI18n: {
      'en-US': [
        'Set up Star Office on my machine',
        'Fix Unauthorized on Star Office page',
        'Connect Aion preview to http://127.0.0.1:19000',
      ],
      'zh-CN': ['帮我安装 Star Office', '排查 Star Office Unauthorized', '把 Aion 预览连接到 http://127.0.0.1:19000'],
    },
  },
  {
    id: 'openclaw-setup',
    avatar: '🦞',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/openclaw-setup',
    ruleFiles: {
      'en-US': 'openclaw-setup.md',
      'zh-CN': 'openclaw-setup.zh-CN.md',
    },
    defaultEnabledSkills: ['openclaw-setup', 'aionui-webui-setup'],
    nameI18n: {
      'en-US': 'OpenClaw Setup Expert',
      'zh-CN': 'OpenClaw 部署专家',
    },
    descriptionI18n: {
      'en-US':
        'Expert guide for installing, deploying, configuring, and troubleshooting OpenClaw. Proactively helps with setup, diagnoses issues, and provides security best practices.',
      'zh-CN': 'OpenClaw 安装、部署、配置和故障排查专家。主动协助设置、诊断问题并提供安全最佳实践。',
    },
    promptsI18n: {
      'en-US': [
        'Help me install OpenClaw step by step',
        "My OpenClaw isn't working, please diagnose the issue",
        'Configure Telegram channel for OpenClaw integration',
      ],
      'zh-CN': ['帮我一步步安装 OpenClaw', '我的 OpenClaw 出问题了，请帮我诊断', '为 OpenClaw 配置 Telegram 渠道'],
    },
  },
  {
    id: 'cowork',
    avatar: 'cowork.svg',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/cowork',
    ruleFiles: {
      'en-US': 'cowork.md',
      'zh-CN': 'cowork.md', // 使用同一个文件，内容已精简 / Use same file, content is simplified
    },
    skillFiles: {
      'en-US': 'cowork-skills.md',
      'zh-CN': 'cowork-skills.zh-CN.md',
    },
    defaultEnabledSkills: ['skill-creator', 'pptx', 'docx', 'pdf', 'xlsx'],
    nameI18n: {
      'en-US': 'Cowork',
      'zh-CN': 'Cowork',
    },
    descriptionI18n: {
      'en-US': 'Autonomous task execution with file operations, document processing, and multi-step workflow planning.',
      'zh-CN': '具有文件操作、文档处理和多步骤工作流规划的自主任务执行助手。',
    },
    promptsI18n: {
      'en-US': [
        'Analyze the current project structure and suggest improvements',
        'Automate the build and deployment process',
        'Extract and summarize key information from all PDF files',
      ],
      'zh-CN': ['分析当前项目结构并建议改进方案', '自动化构建和部署流程', '提取并总结所有 PDF 文件的关键信息'],
    },
  },
  {
    id: 'pptx-generator',
    avatar: '📊',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/pptx-generator',
    ruleFiles: {
      'en-US': 'pptx-generator.md',
      'zh-CN': 'pptx-generator.zh-CN.md',
    },
    nameI18n: {
      'en-US': 'PPTX Generator',
      'zh-CN': 'PPTX 生成器',
    },
    descriptionI18n: {
      'en-US': 'Generate local PPTX assets and structure for pptxgenjs.',
      'zh-CN': '生成本地 PPTX 资产与结构（pptxgenjs）。',
    },
    promptsI18n: {
      'en-US': [
        'Create a professional slide deck about AI trends with 10 slides',
        'Generate a quarterly business report presentation',
        'Make a product launch presentation with visual elements',
      ],
      'zh-CN': ['创建一个包含 10 页的专业 AI 趋势幻灯片', '生成季度业务报告演示文稿', '制作包含视觉元素的产品发布演示'],
    },
  },
  {
    id: 'pdf-to-ppt',
    avatar: '📄',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/pdf-to-ppt',
    ruleFiles: {
      'en-US': 'pdf-to-ppt.md',
      'zh-CN': 'pdf-to-ppt.zh-CN.md',
    },
    nameI18n: {
      'en-US': 'PDF to PPT',
      'zh-CN': 'PDF 转 PPT',
    },
    descriptionI18n: {
      'en-US': 'Convert PDF to PPT with watermark removal rules.',
      'zh-CN': 'PDF 转 PPT 并去除水印规则',
    },
    promptsI18n: {
      'en-US': [
        'Convert report.pdf to a PowerPoint presentation',
        'Extract all charts and diagrams from whitepaper.pdf',
        'Transform this PDF document into slides with proper formatting',
      ],
      'zh-CN': [
        '将 report.pdf 转换为 PowerPoint 演示文稿',
        '从白皮书提取所有图表和示意图',
        '将此 PDF 文档转换为格式正确的幻灯片',
      ],
    },
  },
  {
    id: 'game-3d',
    avatar: '🎮',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/game-3d',
    ruleFiles: {
      'en-US': 'game-3d.md',
      'zh-CN': 'game-3d.zh-CN.md',
    },
    nameI18n: {
      'en-US': '3D Game',
      'zh-CN': '3D 游戏生成',
    },
    descriptionI18n: {
      'en-US': 'Generate a complete 3D platform collection game in one HTML file.',
      'zh-CN': '用单个 HTML 文件生成完整的 3D 平台收集游戏。',
    },
    promptsI18n: {
      'en-US': [
        'Create a 3D platformer game with jumping mechanics',
        'Make a coin collection game with obstacles',
        'Build a 3D maze exploration game',
      ],
      'zh-CN': ['创建一个带跳跃机制的 3D 平台游戏', '制作一个带障碍物的金币收集游戏', '构建一个 3D 迷宫探索游戏'],
    },
  },
  {
    id: 'ui-ux-pro-max',
    avatar: '🎨',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/ui-ux-pro-max',
    ruleFiles: {
      'en-US': 'ui-ux-pro-max.md',
      'zh-CN': 'ui-ux-pro-max.zh-CN.md',
    },
    nameI18n: {
      'en-US': 'UI/UX Pro Max',
      'zh-CN': 'UI/UX 专业设计师',
    },
    descriptionI18n: {
      'en-US':
        'Professional UI/UX design intelligence with 57 styles, 95 color palettes, 56 font pairings, and stack-specific best practices.',
      'zh-CN': '专业 UI/UX 设计智能助手，包含 57 种风格、95 个配色方案、56 个字体配对及技术栈最佳实践。',
    },
    promptsI18n: {
      'en-US': [
        'Design a modern login page for a fintech mobile app',
        'Create a color palette for a nature-themed website',
        'Design a dashboard interface for a SaaS product',
      ],
      'zh-CN': ['为金融科技移动应用设计现代登录页', '创建自然主题网站的配色方案', '为 SaaS 产品设计仪表板界面'],
    },
  },
  {
    id: 'planning-with-files',
    avatar: '📋',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/planning-with-files',
    ruleFiles: {
      'en-US': 'planning-with-files.md',
      'zh-CN': 'planning-with-files.zh-CN.md',
    },
    nameI18n: {
      'en-US': 'Planning with Files',
      'zh-CN': '文件规划助手',
    },
    descriptionI18n: {
      'en-US':
        'Manus-style file-based planning for complex tasks. Uses task_plan.md, findings.md, and progress.md to maintain persistent context.',
      'zh-CN': 'Manus 风格的文件规划，用于复杂任务。使用 task_plan.md、findings.md 和 progress.md 维护持久化上下文。',
    },
    promptsI18n: {
      'en-US': [
        'Plan a comprehensive refactoring task with milestones',
        'Break down the feature implementation into actionable steps',
        'Create a project plan for migrating to a new framework',
      ],
      'zh-CN': ['规划一个包含里程碑的全面重构任务', '将功能实现拆分为可执行的步骤', '创建迁移到新框架的项目计划'],
    },
  },
  {
    id: 'human-3-coach',
    avatar: '🧭',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/human-3-coach',
    ruleFiles: {
      'en-US': 'human-3-coach.md',
      'zh-CN': 'human-3-coach.zh-CN.md',
    },
    nameI18n: {
      'en-US': 'HUMAN 3.0 Coach',
      'zh-CN': 'HUMAN 3.0 教练',
    },
    descriptionI18n: {
      'en-US':
        'Personal development coach based on HUMAN 3.0 framework: 4 Quadrants (Mind/Body/Spirit/Vocation), 3 Levels, 3 Growth Phases.',
      'zh-CN': '基于 HUMAN 3.0 框架的个人发展教练：4 象限（思维/身体/精神/职业）、3 层次、3 成长阶段。',
    },
    promptsI18n: {
      'en-US': [
        'Help me set quarterly goals across all life quadrants',
        'Reflect on my career progress and plan next steps',
        'Create a personal development plan for the next 3 months',
      ],
      'zh-CN': [
        '帮我设定涵盖所有生活象限的季度目标',
        '反思我的职业发展进度并规划下一步',
        '为未来 3 个月创建个人发展计划',
      ],
    },
  },
  {
    id: 'social-job-publisher',
    avatar: '📣',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/social-job-publisher',
    ruleFiles: {
      'en-US': 'social-job-publisher.md',
      'zh-CN': 'social-job-publisher.zh-CN.md',
    },
    skillFiles: {
      'en-US': 'social-job-publisher-skills.md',
      'zh-CN': 'social-job-publisher-skills.zh-CN.md',
    },
    defaultEnabledSkills: ['xiaohongshu-recruiter', 'x-recruiter'],
    nameI18n: {
      'en-US': 'Social Job Publisher',
      'zh-CN': '社交招聘发布助手',
    },
    descriptionI18n: {
      'en-US': 'Expand hiring requests into a full JD, images, and publish to social platforms via connectors.',
      'zh-CN': '扩写招聘需求为完整 JD 与图片，并通过 connector 发布到社交平台。',
    },
    promptsI18n: {
      'en-US': [
        'Create a comprehensive job post for Senior Full-Stack Engineer',
        'Draft an engaging hiring tweet for social media',
        'Create a multi-platform job posting (LinkedIn, X, Redbook)',
      ],
      'zh-CN': [
        '创建一份高级全栈工程师的完整招聘启事',
        '起草一条适合社交媒体的招聘推文',
        '创建多平台职位发布（LinkedIn、X、小红书）',
      ],
    },
  },
  {
    id: 'moltbook',
    avatar: '🦞',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/moltbook',
    ruleFiles: {
      'en-US': 'moltbook.md',
      'zh-CN': 'moltbook.md',
    },
    skillFiles: {
      'en-US': 'moltbook-skills.md',
      'zh-CN': 'moltbook-skills.zh-CN.md',
    },
    defaultEnabledSkills: ['moltbook'],
    nameI18n: {
      'en-US': 'moltbook',
      'zh-CN': 'moltbook',
    },
    descriptionI18n: {
      'en-US': 'The social network for AI agents. Post, comment, upvote, and create communities.',
      'zh-CN': 'AI 代理的社交网络。发帖、评论、投票、创建社区。',
    },
    promptsI18n: {
      'en-US': [
        'Check my moltbook feed for latest updates',
        'Post an interesting update to moltbook',
        'Check for new direct messages',
      ],
      'zh-CN': ['查看我的 moltbook 最新动态', '在 moltbook 发布一条有趣的动态', '检查是否有新私信'],
    },
  },
  {
    id: 'beautiful-mermaid',
    avatar: '📈',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/beautiful-mermaid',
    ruleFiles: {
      'en-US': 'beautiful-mermaid.md',
      'zh-CN': 'beautiful-mermaid.zh-CN.md',
    },
    defaultEnabledSkills: ['mermaid'],
    nameI18n: {
      'en-US': 'Beautiful Mermaid',
      'zh-CN': 'Beautiful Mermaid',
    },
    descriptionI18n: {
      'en-US':
        'Create flowcharts, sequence diagrams, state diagrams, class diagrams, and ER diagrams with beautiful themes.',
      'zh-CN': '创建流程图、时序图、状态图、类图和 ER 图，支持多种精美主题。',
    },
    promptsI18n: {
      'en-US': [
        'Draw a detailed user login authentication flowchart',
        'Create an API sequence diagram for payment processing',
        'Create a system architecture diagram',
      ],
      'zh-CN': ['绘制详细的用户登录认证流程图', '创建支付处理的 API 时序图', '创建系统架构图'],
    },
  },
  {
    id: 'story-roleplay',
    avatar: '📖',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/story-roleplay',
    ruleFiles: {
      'en-US': 'story-roleplay.md',
      'zh-CN': 'story-roleplay.zh-CN.md',
    },
    defaultEnabledSkills: ['story-roleplay'],
    nameI18n: {
      'en-US': 'Story Roleplay',
      'zh-CN': '故事角色扮演',
    },
    descriptionI18n: {
      'en-US':
        'Immersive story roleplay. Start by: 1) Natural language to create characters, 2) Paste PNG images, or 3) Open folder with character cards (PNG/JSON) and world info.',
      'zh-CN':
        '沉浸式故事角色扮演。三种开始方式：1) 自然语言直接对话创建角色，2) 直接粘贴PNG图片，3) 打开包含角色卡（PNG/JSON）和世界书的文件夹。',
    },
    promptsI18n: {
      'en-US': [
        'Start an epic fantasy adventure with a brave warrior',
        'Create a detailed character with backstory and personality',
        'Begin an interactive story in a sci-fi setting',
      ],
      'zh-CN': ['开始一个勇敢战士的史诗奇幻冒险', '创建一个有背景故事和个性的详细角色', '在科幻设定中开始一个互动故事'],
    },
  },
];
