export type AssistantPreset = {
  id: string;
  avatar: string;
  presetAgentType?: string;
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
  /** Whether to show this assistant on the home page. Defaults to false. */
  showOnHome?: boolean;
};

export const ASSISTANT_PRESETS: AssistantPreset[] = [
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
      'ru-RU': 'cowork-skills.ru-RU.md',
    },
    defaultEnabledSkills: ['skill-creator', 'officecli-pptx', 'officecli-docx', 'pdf', 'officecli-xlsx'],
    nameI18n: {
      'en-US': 'Cowork',
      'zh-CN': 'Cowork 协作助手',
      'ru-RU': 'Cowork',
      'uk-UA': 'Cowork',
    },
    descriptionI18n: {
      'en-US': 'Autonomous task execution with file operations, document processing, and multi-step workflow planning.',
      'zh-CN': '具有文件操作、文档处理和多步骤工作流规划的自主任务执行助手。',
      'ru-RU':
        'Автономный помощник для выполнения задач с работой с файлами, обработкой документов и многошаговым планированием.',
      'uk-UA':
        'Автономне виконання завдань з роботою з файлами, обробкою документів та багатокроковим плануванням робочих процесів.',
    },
    promptsI18n: {
      'en-US': [
        'Analyze the current project structure and suggest improvements',
        'Automate the build and deployment process',
        'Extract and summarize key information from all PDF files',
      ],
      'zh-CN': ['分析当前项目结构并建议改进方案', '自动化构建和部署流程', '提取并总结所有 PDF 文件的关键信息'],
      'ru-RU': [
        'Проанализируй структуру текущего проекта и предложи улучшения',
        'Автоматизируй процесс сборки и развёртывания',
        'Извлеки и обобщи ключевую информацию из всех PDF-файлов',
      ],
      'uk-UA': [
        'Проаналізувати структуру поточного проекту та запропонувати покращення',
        'Автоматизувати процес збірки та розгортання',
        'Витягти та узагальнити ключову інформацію з усіх файлів PDF',
      ],
    },
    showOnHome: true,
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
      'ru-RU': 'Планирование с файлами',
      'uk-UA': 'Планування з файлами',
    },
    descriptionI18n: {
      'en-US':
        'Manus-style file-based planning for complex tasks. Uses task_plan.md, findings.md, and progress.md to maintain persistent context.',
      'zh-CN': 'Manus 风格的文件规划，用于复杂任务。使用 task_plan.md、findings.md 和 progress.md 维护持久化上下文。',
      'ru-RU':
        'Файловое планирование в стиле Manus для сложных задач. Использует task_plan.md, findings.md и progress.md для сохранения устойчивого контекста.',
      'uk-UA':
        'Файлове планування в стилі Manus для складних завдань. Використовує task_plan.md, findings.md та progress.md для збереження контексту.',
    },
    promptsI18n: {
      'en-US': [
        'Plan a comprehensive refactoring task with milestones',
        'Break down the feature implementation into actionable steps',
        'Create a project plan for migrating to a new framework',
      ],
      'zh-CN': ['规划一个包含里程碑的全面重构任务', '将功能实现拆分为可执行的步骤', '创建迁移到新框架的项目计划'],
      'ru-RU': [
        'Спланируй комплексную задачу рефакторинга с вехами',
        'Разбей реализацию функции на конкретные шаги',
        'Создай план проекта по миграции на новый фреймворк',
      ],
      'uk-UA': [
        'Спланувати повний рефакториринг з контрольними точками',
        'Розбити реалізацію функції на конкретні кроки',
        'Створити план міграції на новий фреймворк',
      ],
    },
    showOnHome: true,
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
      'zh-CN': 'Mermaid 图表助手',
      'ru-RU': 'Beautiful Mermaid',
      'uk-UA': 'Beautiful Mermaid',
    },
    descriptionI18n: {
      'en-US':
        'Create flowcharts, sequence diagrams, state diagrams, class diagrams, and ER diagrams with beautiful themes.',
      'zh-CN': '创建流程图、时序图、状态图、类图和 ER 图，支持多种精美主题。',
      'ru-RU': 'Создаёт блок-схемы, sequence-, state-, class- и ER-диаграммы с красивыми темами оформления.',
      'uk-UA':
        'Створюйте блок-схеми, діаграми послідовності, станів, класів та ER-діаграми з красивими темами оформлення.',
    },
    promptsI18n: {
      'en-US': [
        'Draw a detailed user login authentication flowchart',
        'Create an API sequence diagram for payment processing',
        'Create a system architecture diagram',
      ],
      'zh-CN': ['绘制详细的用户登录认证流程图', '创建支付处理的 API 时序图', '创建系统架构图'],
      'ru-RU': [
        'Нарисуй подробную блок-схему аутентификации при входе пользователя',
        'Создай sequence-диаграмму API для обработки платежей',
        'Создай диаграмму системной архитектуры',
      ],
      'uk-UA': [
        'Намалювати детальну блок-схему автентифікації користувача',
        'Створити діаграму послідовності API для обробки платежів',
        'Створити діаграму архітектури системи',
      ],
    },
    showOnHome: true,
  },
];
