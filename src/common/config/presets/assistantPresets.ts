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
      'zh-CN': 'Cowork 协作',
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
      'zh-CN': '文件规划',
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
    id: 'prd-issue-splitter',
    avatar: '📝',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/prd-issue-splitter',
    ruleFiles: {
      'en-US': 'prd-issue-splitter.md',
      'zh-CN': 'prd-issue-splitter.zh-CN.md',
    },
    nameI18n: {
      'en-US': 'PRD to Issue Splitter',
      'zh-CN': 'PRD 转 Issue 拆解',
      'ru-RU': 'PRD → Issue Декомпозитор',
      'uk-UA': 'PRD → Issue Декомпозитор',
    },
    descriptionI18n: {
      'en-US':
        'Decompose PRD documents into structured epics, user stories, and tasks. Outputs GitHub Issues, Jira, or Linear format.',
      'zh-CN': '将 PRD 文档拆解为结构化的 Epic、用户故事和任务，支持输出 GitHub Issues、Jira 或 Linear 格式。',
      'ru-RU':
        'Декомпозиция PRD на эпики, пользовательские истории и задачи. Экспорт в GitHub Issues, Jira или Linear.',
      'uk-UA':
        'Декомпозиція PRD на епіки, користувацькі історії та задачі. Експорт у GitHub Issues, Jira або Linear.',
    },
    promptsI18n: {
      'en-US': [
        'Split this PRD into GitHub Issues with acceptance criteria',
        'Decompose the user authentication feature into epics and sub-tasks',
        'Generate a Jira-ready issue list from this product requirements doc',
      ],
      'zh-CN': [
        '将这份 PRD 拆解为带验收标准的 GitHub Issues',
        '将用户认证功能拆解为 Epic 和子任务',
        '根据这份产品需求文档生成可导入 Jira 的 Issue 列表',
      ],
      'ru-RU': [
        'Разбей этот PRD на GitHub Issues с критериями приёмки',
        'Декомпозируй функцию аутентификации на эпики и подзадачи',
        'Сгенерируй список задач для Jira из этого документа с требованиями',
      ],
      'uk-UA': [
        'Розбий цей PRD на GitHub Issues з критеріями прийому',
        'Декомпозуй функцію автентифікації на епіки та підзадачі',
        'Згенеруй список задач для Jira з цього документа вимог',
      ],
    },
    showOnHome: true,
  },
  {
    id: 'tech-solution-designer',
    avatar: '🏗️',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/tech-solution-designer',
    ruleFiles: {
      'en-US': 'tech-solution-designer.md',
      'zh-CN': 'tech-solution-designer.zh-CN.md',
    },
    nameI18n: {
      'en-US': 'Tech Solution Designer',
      'zh-CN': '技术方案生成',
      'ru-RU': 'Технический Архитектор',
      'uk-UA': 'Технічний Архітектор',
    },
    descriptionI18n: {
      'en-US':
        'Generate technical design documents with architecture diagrams, API specs, and data models from feature requirements.',
      'zh-CN': '根据功能需求生成技术设计文档，包含架构图、API 规范和数据模型。',
      'ru-RU':
        'Генерация технических проектных документов с диаграммами архитектуры, спецификациями API и моделями данных.',
      'uk-UA':
        'Генерація технічних проектних документів із діаграмами архітектури, специфікаціями API та моделями даних.',
    },
    promptsI18n: {
      'en-US': [
        'Design the technical architecture for a real-time chat system',
        'Create an API spec and database schema for a multi-tenant SaaS app',
        'Write a technical design doc for migrating a monolith to microservices',
      ],
      'zh-CN': [
        '为实时聊天系统设计技术架构',
        '为多租户 SaaS 应用创建 API 规范和数据库结构',
        '编写单体应用迁移到微服务的技术设计文档',
      ],
      'ru-RU': [
        'Спроектируй техническую архитектуру для системы чата в реальном времени',
        'Создай спецификацию API и схему БД для мультитенантного SaaS',
        'Напиши технический документ по миграции монолита на микросервисы',
      ],
      'uk-UA': [
        'Спроектуй технічну архітектуру для системи чату в реальному часі',
        'Створи специфікацію API та схему БД для мультитенантного SaaS',
        'Напиши технічний документ щодо міграції моноліту на мікросервіси',
      ],
    },
    showOnHome: true,
  },
  {
    id: 'cicd-failure-diagnoser',
    avatar: '🔍',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/cicd-failure-diagnoser',
    ruleFiles: {
      'en-US': 'cicd-failure-diagnoser.md',
      'zh-CN': 'cicd-failure-diagnoser.zh-CN.md',
    },
    nameI18n: {
      'en-US': 'CI/CD Failure Diagnoser',
      'zh-CN': 'CI/CD 流水线失败诊断',
      'ru-RU': 'Диагностика CI/CD Сбоев',
      'uk-UA': 'Діагностика CI/CD Збоїв',
    },
    descriptionI18n: {
      'en-US':
        'Diagnose CI/CD pipeline failures from logs. Identifies root causes and provides step-by-step fix instructions.',
      'zh-CN': '通过日志诊断 CI/CD 流水线故障，识别根本原因并提供分步修复指导。',
      'ru-RU': 'Диагностика сбоев CI/CD по логам. Определяет первопричины и даёт пошаговые инструкции по исправлению.',
      'uk-UA':
        'Діагностика збоїв CI/CD за логами. Визначає першопричини та надає покрокові інструкції з виправлення.',
    },
    promptsI18n: {
      'en-US': [
        'Why did my GitHub Actions workflow fail? Here are the logs',
        'Diagnose this Docker build failure and suggest a fix',
        'My Jest tests pass locally but fail in CI — what could cause this?',
      ],
      'zh-CN': [
        '我的 GitHub Actions 工作流为什么失败？这是日志',
        '诊断这个 Docker 构建失败并建议修复方案',
        '我的 Jest 测试本地通过但在 CI 中失败——可能是什么原因？',
      ],
      'ru-RU': [
        'Почему упал мой GitHub Actions воркфлоу? Вот логи',
        'Диагностируй этот сбой сборки Docker и предложи исправление',
        'Jest-тесты проходят локально, но падают в CI — в чём причина?',
      ],
      'uk-UA': [
        'Чому впав мій GitHub Actions воркфлоу? Ось логи',
        'Діагностуй цей збій збірки Docker та запропонуй виправлення',
        'Jest-тести проходять локально, але падають у CI — яка причина?',
      ],
    },
    showOnHome: true,
  },
  {
    id: 'sast-security-advisor',
    avatar: '🔒',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/sast-security-advisor',
    ruleFiles: {
      'en-US': 'sast-security-advisor.md',
      'zh-CN': 'sast-security-advisor.zh-CN.md',
    },
    nameI18n: {
      'en-US': 'SAST Security Advisor',
      'zh-CN': '代码安全 / SAST 修复建议',
      'ru-RU': 'SAST Советник по Безопасности',
      'uk-UA': 'SAST Радник з Безпеки',
    },
    descriptionI18n: {
      'en-US':
        'Analyze SAST scan results and provide prioritized, code-level fix recommendations for security vulnerabilities.',
      'zh-CN': '分析 SAST 扫描结果，对安全漏洞提供有优先级的代码级修复建议。',
      'ru-RU':
        'Анализ результатов SAST и приоритизированные рекомендации по исправлению уязвимостей на уровне кода.',
      'uk-UA':
        'Аналіз результатів SAST та пріоритизовані рекомендації щодо виправлення вразливостей на рівні коду.',
    },
    promptsI18n: {
      'en-US': [
        'Analyze these Semgrep findings and provide fix suggestions',
        'Explain this SQL injection vulnerability and show me the secure fix',
        'Review my code for OWASP Top 10 vulnerabilities',
      ],
      'zh-CN': [
        '分析这些 Semgrep 扫描结果并提供修复建议',
        '解释这个 SQL 注入漏洞并给出安全修复方案',
        '检查我的代码是否存在 OWASP Top 10 漏洞',
      ],
      'ru-RU': [
        'Проанализируй результаты Semgrep и предложи исправления',
        'Объясни эту уязвимость SQL-инъекции и покажи безопасное исправление',
        'Проверь мой код на наличие уязвимостей OWASP Top 10',
      ],
      'uk-UA': [
        'Проаналізуй результати Semgrep та запропонуй виправлення',
        "Поясни цю вразливість SQL-ін'єкції та покажи безпечне виправлення",
        'Перевір мій код на наявність вразливостей OWASP Top 10',
      ],
    },
    showOnHome: true,
  },
  {
    id: 'test-case-generator',
    avatar: '🧪',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/test-case-generator',
    ruleFiles: {
      'en-US': 'test-case-generator.md',
      'zh-CN': 'test-case-generator.zh-CN.md',
    },
    nameI18n: {
      'en-US': 'Test Case Generator',
      'zh-CN': '测试用例生成',
      'ru-RU': 'Генератор тест-кейсов',
      'uk-UA': 'Генератор тест-кейсів',
    },
    descriptionI18n: {
      'en-US':
        'Generate comprehensive test cases from requirements or code. Supports unit, integration, E2E, and BDD Gherkin formats.',
      'zh-CN': '根据需求或代码生成全面的测试用例，支持单元测试、集成测试、E2E 测试和 BDD Gherkin 格式。',
      'ru-RU':
        'Генерация тест-кейсов по требованиям или коду. Поддержка unit, integration, E2E и BDD Gherkin форматов.',
      'uk-UA': 'Генерація тест-кейсів за вимогами або кодом. Підтримка unit, integration, E2E та BDD Gherkin форматів.',
    },
    promptsI18n: {
      'en-US': [
        'Generate test cases for a user login feature',
        'Write Gherkin BDD scenarios for a shopping cart checkout',
        'Create a test plan for a REST API with CRUD operations',
      ],
      'zh-CN': [
        '为用户登录功能生成测试用例',
        '为购物车结账流程编写 Gherkin BDD 场景',
        '为具有 CRUD 操作的 REST API 创建测试计划',
      ],
      'ru-RU': [
        'Создай тест-кейсы для функции входа пользователя',
        'Напиши Gherkin BDD сценарии для оформления заказа в корзине',
        'Создай план тестирования REST API с CRUD операциями',
      ],
      'uk-UA': [
        'Створи тест-кейси для функції входу користувача',
        'Напиши Gherkin BDD сценарії для оформлення замовлення в кошику',
        'Створи план тестування REST API з CRUD операціями',
      ],
    },
    showOnHome: true,
  },
  {
    id: 'swagger-api-tester',
    avatar: '🔌',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/swagger-api-tester',
    ruleFiles: {
      'en-US': 'swagger-api-tester.md',
      'zh-CN': 'swagger-api-tester.zh-CN.md',
    },
    nameI18n: {
      'en-US': 'Swagger API Tester',
      'zh-CN': 'Swagger 接口测试',
      'ru-RU': 'Swagger API Тестер',
      'uk-UA': 'Swagger API Тестер',
    },
    descriptionI18n: {
      'en-US':
        'Test REST APIs using Swagger/OpenAPI specs. Generates curl commands, Postman collections, and test scripts.',
      'zh-CN': '基于 Swagger/OpenAPI 规范测试 REST API，生成 curl 命令、Postman Collection 和测试脚本。',
      'ru-RU':
        'Тестирование REST API по Swagger/OpenAPI спецификациям. Генерация curl команд, Postman коллекций и тест-скриптов.',
      'uk-UA':
        'Тестування REST API за Swagger/OpenAPI специфікаціями. Генерація curl команд, Postman колекцій та тест-скриптів.',
    },
    promptsI18n: {
      'en-US': [
        'Generate test cases from this Swagger spec URL',
        'Create a Postman collection for all endpoints in the API',
        'Write Python requests tests for user authentication endpoints',
      ],
      'zh-CN': [
        '根据 Swagger 规范 URL 生成测试用例',
        '为 API 中所有端点创建 Postman Collection',
        '为用户认证接口编写 Python requests 测试脚本',
      ],
      'ru-RU': [
        'Создай тест-кейсы по URL Swagger спецификации',
        'Создай Postman коллекцию для всех эндпоинтов API',
        'Напиши тесты на Python requests для эндпоинтов аутентификации',
      ],
      'uk-UA': [
        'Створи тест-кейси за URL Swagger специфікації',
        'Створи Postman колекцію для всіх ендпоінтів API',
        'Напиши тести на Python requests для ендпоінтів автентифікації',
      ],
    },
    showOnHome: true,
  },
  {
    id: 'webui-automation-tester',
    avatar: '🤖',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/webui-automation-tester',
    ruleFiles: {
      'en-US': 'webui-automation-tester.md',
      'zh-CN': 'webui-automation-tester.zh-CN.md',
    },
    nameI18n: {
      'en-US': 'WebUI Automation Tester',
      'zh-CN': 'WebUI 自动化测试',
      'ru-RU': 'WebUI Автотестер',
      'uk-UA': 'WebUI Автотестер',
    },
    descriptionI18n: {
      'en-US':
        'Create automated UI tests using Playwright, Cypress, or Selenium with Page Object Model patterns.',
      'zh-CN': '使用 Playwright、Cypress 或 Selenium 按照页面对象模型模式创建 WebUI 自动化测试脚本。',
      'ru-RU': 'Создание автотестов UI с Playwright, Cypress или Selenium по паттерну Page Object Model.',
      'uk-UA': 'Створення автотестів UI з Playwright, Cypress або Selenium за паттерном Page Object Model.',
    },
    promptsI18n: {
      'en-US': [
        'Write Playwright tests for a user login and dashboard flow',
        'Create Cypress E2E tests for a multi-step checkout process',
        'Generate a Selenium Python test suite for form validation',
      ],
      'zh-CN': [
        '为用户登录和仪表盘流程编写 Playwright 测试',
        '为多步骤结账流程创建 Cypress E2E 测试',
        '为表单验证生成 Selenium Python 测试套件',
      ],
      'ru-RU': [
        'Напиши Playwright тесты для потока входа пользователя и дашборда',
        'Создай Cypress E2E тесты для многошагового процесса оформления заказа',
        'Сгенерируй тест-сьют на Selenium Python для валидации форм',
      ],
      'uk-UA': [
        'Напиши Playwright тести для потоку входу користувача та дашборду',
        'Створи Cypress E2E тести для багатокрокового процесу оформлення замовлення',
        'Згенеруй тест-сьют на Selenium Python для валідації форм',
      ],
    },
    showOnHome: true,
  },
  {
    id: 'code-review',
    avatar: '🔎',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/code-review',
    ruleFiles: {
      'en-US': 'code-review.md',
      'zh-CN': 'code-review.zh-CN.md',
    },
    nameI18n: {
      'en-US': 'Code Review',
      'zh-CN': 'Code Review',
      'ru-RU': 'Code Review',
      'uk-UA': 'Code Review',
    },
    descriptionI18n: {
      'en-US':
        'Senior-level code review: catches bugs, security holes, and design flaws. Prioritized findings with blocking / important / minor severity.',
      'zh-CN': '资深级代码审查：发现 Bug、安全漏洞和设计缺陷，按阻塞 / 重要 / 次要优先级分级输出。',
      'ru-RU':
        'Code review уровня senior: выявляет баги, уязвимости и архитектурные проблемы с приоритизацией по severity.',
      'uk-UA':
        'Code review рівня senior: виявляє баги, вразливості та архітектурні проблеми з пріоритизацією за severity.',
    },
    promptsI18n: {
      'en-US': [
        'Review this diff for bugs and security issues',
        'Check this function for correctness and edge cases',
        'Review my PR and flag anything blocking before merge',
      ],
      'zh-CN': [
        '审查这个 diff，找出 Bug 和安全问题',
        '检查这个函数的正确性和边界情况',
        '审查我的 PR，标出合并前必须修复的问题',
      ],
      'ru-RU': [
        'Проверь этот diff на баги и проблемы безопасности',
        'Проверь эту функцию на корректность и граничные случаи',
        'Проверь мой PR и отметь блокирующие проблемы',
      ],
      'uk-UA': [
        'Перевір цей diff на баги та проблеми безпеки',
        'Перевір цю функцію на коректність та граничні випадки',
        'Перевір мій PR та відзнач блокуючі проблеми',
      ],
    },
    showOnHome: true,
  },
  {
    id: 'code-archaeology',
    avatar: '🏺',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/code-archaeology',
    ruleFiles: {
      'en-US': 'code-archaeology.md',
      'zh-CN': 'code-archaeology.zh-CN.md',
    },
    nameI18n: {
      'en-US': 'Code Archaeology',
      'zh-CN': '代码考古',
      'ru-RU': 'Код Археология',
      'uk-UA': 'Код Археологія',
    },
    descriptionI18n: {
      'en-US':
        'Uncover the why behind code — trace git history, decode intent, map evolution, and surface hidden constraints through systematic archaeology.',
      'zh-CN': '挖掘代码背后的"为什么"——追踪 git 历史、解码意图、绘制演进脉络，系统性地揭露隐性约束与决策根源。',
      'ru-RU':
        'Раскрывает причины существования кода: трассирует git-историю, декодирует намерения и выявляет скрытые ограничения.',
      'uk-UA':
        'Розкриває причини існування коду: трасує git-історію, декодує наміри та виявляє приховані обмеження.',
    },
    promptsI18n: {
      'en-US': [
        'Why does this function exist and when was it introduced?',
        'Trace the history of this file and explain its major changes',
        'Is this code safe to delete? Find all references and dependencies',
      ],
      'zh-CN': [
        '这个函数为什么存在，是什么时候引入的？',
        '追溯这个文件的历史，解释它的主要变更',
        '这段代码可以安全删除吗？找出所有引用和依赖',
      ],
      'ru-RU': [
        'Почему существует эта функция и когда она была добавлена?',
        'Проследи историю этого файла и объясни основные изменения',
        'Безопасно ли удалить этот код? Найди все ссылки и зависимости',
      ],
      'uk-UA': [
        'Чому існує ця функція і коли вона була додана?',
        'Простеж історію цього файлу та поясни основні зміни',
        'Чи безпечно видалити цей код? Знайди всі посилання та залежності',
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
      'zh-CN': 'Mermaid 图表',
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
