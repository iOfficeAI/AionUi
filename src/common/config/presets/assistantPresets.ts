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
};

export const ASSISTANT_PRESETS: AssistantPreset[] = [
  {
    id: 'word-creator',
    avatar: '📝',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/word-creator',
    ruleFiles: {
      'en-US': 'word-creator.md',
      'zh-CN': 'word-creator.zh-CN.md',
      'ru-RU': 'word-creator.ru-RU.md',
    },
    defaultEnabledSkills: ['officecli-docx'],
    nameI18n: {
      'en-US': 'Word Creator',
      'zh-CN': 'Word 文档助手',
      'ru-RU': 'Помощник Word',
      'uk-UA': 'Помічник Word',
    },
    descriptionI18n: {
      'en-US':
        'Create, edit, and analyze professional Word documents with officecli. Reports, proposals, letters, memos, and more.',
      'zh-CN': '使用 officecli 创建、编辑和分析专业 Word 文档。报告、方案、信函、备忘录等。',
      'ru-RU':
        'Создаёт, редактирует и анализирует профессиональные документы Word с помощью officecli: отчёты, предложения, письма, служебные записки и другое.',
      'uk-UA':
        'Створюйте, редагуйте та аналізуйте професійні документи Word за допомогою officecli: звіти, пропозиції, листи, нотатки тощо.',
    },
    promptsI18n: {
      'en-US': [
        'Create a Q1 2026 quarterly report with TOC, financial highlights table, revenue trend chart, and KPI metrics section',
        'Write an academic research paper on machine learning with LaTeX equations, citations, data tables, and bibliography',
        'Create a project status report with DRAFT watermark, color-coded status table, and a Gantt timeline in landscape section',
      ],
      'zh-CN': [
        '创建一份 2026 年 Q1 季度报告，包含目录、财务亮点表格、营收趋势图和 KPI 指标',
        '写一篇关于机器学习的学术论文，包含 LaTeX 公式、引用、数据表格和参考文献',
        '创建一份项目状态报告，带 DRAFT 水印、彩色状态表格和横向甘特图时间线',
      ],
      'ru-RU': [
        'Создай отчёт за Q1 2026 с оглавлением, таблицей финансовых показателей, графиком трендов выручки и разделом KPI',
        'Напиши академическую статью по машинному обучению с формулами LaTeX, цитатами, таблицами данных и библиографией',
        'Создай отчёт о статусе проекта с водяным знаком DRAFT, цветовой таблицей статусов и диаграммой Ганта в альбомной секции',
      ],
      'uk-UA': [
        'Створити квартальний звіт за 1 квартал 2026 року зі змістом, таблицею фінансових показників, графіком трендів доходів та розділом KPI',
        'Написати наукову статтю про машинне навчання з формулами LaTeX, цитатами, таблицями даних та бібліографією',
        'Створити звіт про статус проекту з водяним знаком DRAFT, кольоровою таблицею статусів та діаграмою Ганта',
      ],
    },
  },
  {
    id: 'ppt-creator',
    avatar: '📊',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/ppt-creator',
    ruleFiles: {
      'en-US': 'ppt-creator.md',
      'zh-CN': 'ppt-creator.zh-CN.md',
    },
    defaultEnabledSkills: ['officecli-pptx'],
    nameI18n: {
      'en-US': 'PPT Creator',
      'zh-CN': 'PPT 演示助手',
      'ru-RU': 'Помощник PPT',
      'uk-UA': 'Помічник PPT',
    },
    descriptionI18n: {
      'en-US':
        'Create, edit, and analyze professional PowerPoint presentations with officecli. Bold designs, varied layouts, and visual impact.',
      'zh-CN': '使用 officecli 创建、编辑和分析专业 PPT 演示文稿。大胆设计、丰富版式、视觉冲击。',
      'ru-RU':
        'Создаёт, редактирует и анализирует профессиональные презентации PowerPoint с помощью officecli: выразительный дизайн, разнообразные макеты и сильная визуальная подача.',
      'uk-UA':
        'Створюйте, редагуйте та аналізуйте професійні презентації PowerPoint за допомогою officecli: виразний дизайн, різноманітні макети та візуальний вплив.',
    },
    promptsI18n: {
      'en-US': [
        'Create a 10-slide Kubernetes migration proposal with architecture comparison, cost analysis, and migration timeline',
        'Create a 10-slide SaaS analytics dashboard for a project management tool with user growth charts, conversion funnel, and competitive landscape',
        'Create a 10-slide fintech product roadmap for a digital payment platform with user growth trajectory and investment analysis',
      ],
      'zh-CN': [
        '做一份 10 页的 Kubernetes 迁移方案 PPT，包含架构对比、成本分析和迁移时间线',
        '做一份 10 页的 SaaS 产品数据看板 PPT，包含用户增长图表、转化漏斗和竞品分析',
        '做一份 10 页的金融科技产品路线图 PPT，包含用户增长趋势和投资分析',
      ],
      'ru-RU': [
        'Создай презентацию на 10 слайдов о миграции в Kubernetes со сравнением архитектур, анализом затрат и графиком миграции',
        'Создай презентацию на 10 слайдов с аналитическим дашбордом для SaaS-инструмента управления проектами: графики роста пользователей, воронка конверсий и конкурентный ландшафт',
        'Создай презентацию на 10 слайдов с дорожной картой финтех-продукта для платформы цифровых платежей: траектория роста пользователей и инвестиционный анализ',
      ],
      'uk-UA': [
        'Створити презентацію на 10 слайдів щодо міграції на Kubernetes з порівнянням архітектур, аналізом витрат та графіком міграції',
        'Створити 10 слайдів дашборду аналітики SaaS для інструменту управління проектами з графіками росту користувачів та аналізом конкурентів',
        'Створити дорожню карту фінтех-продукту на 10 слайдів для платформи цифрових платежів з аналізом інвестицій',
      ],
    },
  },
  {
    id: 'excel-creator',
    avatar: '📈',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/excel-creator',
    ruleFiles: {
      'en-US': 'excel-creator.md',
      'zh-CN': 'excel-creator.zh-CN.md',
    },
    defaultEnabledSkills: ['officecli-xlsx'],
    nameI18n: {
      'en-US': 'Excel Creator',
      'zh-CN': 'Excel 表格助手',
      'ru-RU': 'Помощник Excel',
      'uk-UA': 'Помічник Excel',
    },
    descriptionI18n: {
      'en-US':
        'Create, edit, and analyze professional Excel spreadsheets with officecli. Financial models, dashboards, trackers, and data analysis.',
      'zh-CN': '使用 officecli 创建、编辑和分析专业 Excel 表格。财务模型、数据看板、追踪表和数据分析。',
      'ru-RU':
        'Создаёт, редактирует и анализирует профессиональные таблицы Excel с помощью officecli: финансовые модели, дашборды, трекеры и анализ данных.',
      'uk-UA':
        'Створюйте, редагуйте та аналізуйте професійні таблиці Excel за допомогою officecli: фінансові моделі, дашборди, трекери та аналіз даних.',
    },
    promptsI18n: {
      'en-US': [
        'Build a 3-sheet financial dashboard with income statement, revenue breakdown chart, and conditional formatting for variances',
        'Create a sales pipeline tracker with deal stages, weighted pipeline formulas, funnel chart, and rep performance scorecards',
        'Create a budget tracker with cross-sheet variance formulas, budget vs actuals bar chart, and color-coded over-budget highlights',
      ],
      'zh-CN': [
        '创建一个 3 页的财务看板，包含利润表、营收分布图和差异条件格式',
        '创建一个销售管道追踪表，包含阶段统计、加权管道公式、漏斗图和销售代表业绩看板',
        '创建一个预算追踪表，包含跨表差异公式、预算对比柱状图和超支红色高亮',
      ],
      'ru-RU': [
        'Собери финансовый дашборд на 3 листах: отчёт о прибылях и убытках, диаграмма структуры выручки и условное форматирование для отклонений',
        'Создай трекер воронки продаж с этапами сделок, формулами взвешенного пайплайна, воронкообразной диаграммой и карточками эффективности менеджеров',
        'Создай трекер бюджета с межлистовыми формулами отклонений, столбчатой диаграммой «план/факт» и цветовой подсветкой превышения бюджета',
      ],
      'uk-UA': [
        'Побудувати фінансовий дашборд на 3 аркуші зі звітом про прибутки, діаграмою доходів та умовним форматуванням',
        'Створити трекер продажів зі стадіями угод, формулами зваженого пайплайну та картками показників менеджерів',
        'Створити бюджетний трекер із формулами розбіжностей між аркушами та гістограмою "бюджет проти факту"',
      ],
    },
  },
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
      'ru-RU': 'Morph PPT',
      'uk-UA': 'Morph PPT',
    },
    descriptionI18n: {
      'en-US':
        'Create professional Morph-animated presentations with officecli. Supports multiple visual styles and end-to-end workflow from topic to polished slides.',
      'zh-CN': '使用 officecli 创建专业的 Morph 动画演示文稿。支持多种视觉风格，从主题到精美幻灯片的端到端工作流。',
      'ru-RU':
        'Создаёт профессиональные презентации с анимацией Morph через officecli. Поддерживает разные визуальные стили и полный цикл от идеи до готовых слайдов.',
      'uk-UA':
        'Створюйте професійні презентації з анімацією Morph за допомогою officecli. Підтримує різні візуальні стилі та повний робочий процес від ідеї до готових слайдів.',
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
      'ru-RU': [
        'Выбери интересную тему на своё усмотрение и создай полноценную презентацию',
        'Создай самую красивую презентацию, которую только можешь представить — тему выбери сам',
        'Создай презентацию о кофейном бренде в минималистичном премиальном стиле',
      ],
      'uk-UA': [
        'Вибери цікаву тему самостійно та створи повноцінну презентацію',
        'Створи найкрасивішу презентацію, яку тільки можеш уявити, тема на твій вибір',
        'Створи презентацію про кавовий бренд у стилі мінімалістичного преміуму',
      ],
    },
  },
  {
    id: 'morph-ppt-3d',
    avatar: '🎬',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/morph-ppt-3d',
    ruleFiles: {
      'en-US': 'morph-ppt-3d.md',
      'zh-CN': 'morph-ppt-3d.zh-CN.md',
    },
    defaultEnabledSkills: ['morph-ppt-3d', 'morph-ppt'],
    nameI18n: {
      'en-US': '3D Morph PPT',
      'zh-CN': '3D Morph PPT',
    },
    descriptionI18n: {
      'en-US':
        "Turn a GLB 3D model into a cinematic Morph presentation. The model is the visual hero — close-up for details, bird's eye for structure, low angle for drama, with smooth Morph transitions between every shot. Note: 3D models and Morph transitions require Microsoft PowerPoint to display correctly.",
      'zh-CN':
        '把 GLB 3D 模型变成电影感 Morph 演示文稿。模型是视觉主角——特写看细节、俯视看结构、仰拍看气势，每页之间用 Morph 转场做流畅的镜头运动。注意：3D 模型和 Morph 转场效果需要在微软 PowerPoint 中打开才能正常显示。',
    },
    promptsI18n: {
      'en-US': [
        "Use this GLB model to create a product showcase. Content should revolve around the model — what it is, its features, its story. Each slide shows a different angle that matches the topic: close-up for details, bird's eye for structure, dramatic low angle for the climax.",
        'Here is my GLB model. Study it carefully, then create a cinematic presentation where the model is the hero of every frame. I want varied camera work: push in for detail shots, pull back for overview, bleed the model off the edge for dramatic transitions.',
        "Build a presentation around this 3D model that feels like a movie trailer. Big dramatic moments, intimate close-ups, sweeping overview shots. The story should match what the model actually is — don't just add generic text.",
      ],
      'zh-CN': [
        '用这个 GLB 模型做一份产品展示 PPT。内容要围绕模型展开——它是什么、有什么特点、背后的故事。每页用不同视角配合主题：讲细节就特写、讲结构就俯视、讲气势就仰拍，画面要丰富有层次。',
        '这是我的 GLB 模型，仔细观察它，然后做一份电影感演示，模型是每一帧的主角。镜头要多变：推近看细节、拉远看全貌、模型出血到画面边缘做冲击转场。内容必须贴合模型本身。',
        '围绕这个 3D 模型做一份像电影预告片一样的演示。要有大气的高潮时刻、细腻的特写镜头、开阔的全景俯瞰。故事要契合模型本身的特征——不要用跟模型无关的通用文案。',
      ],
    },
  },
  {
    id: 'pitch-deck-creator',
    avatar: '🎯',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/pitch-deck-creator',
    ruleFiles: {
      'en-US': 'pitch-deck-creator.md',
      'zh-CN': 'pitch-deck-creator.zh-CN.md',
    },
    defaultEnabledSkills: ['officecli-pitch-deck'],
    nameI18n: {
      'en-US': 'Pitch Deck Creator',
      'zh-CN': '路演 PPT 助手',
      'ru-RU': 'Создатель питч-деков',
      'uk-UA': 'Створювач пітч-деків',
    },
    descriptionI18n: {
      'en-US':
        'Build investor pitch decks, product launch presentations, and enterprise sales decks with gradient designs, data charts, competitive tables, team slides, and speaker notes. Supports seed to Series A+ decks.',
      'zh-CN':
        '制作投资路演、产品发布和企业销售演示文稿，包含渐变设计、数据图表、竞品表格、团队页和演讲者备注。支持从种子轮到 A 轮及以上的路演。',
      'ru-RU':
        'Создаёт инвесторские питч-деки, презентации запусков и корпоративные продажи: градиентный дизайн, графики, таблицы конкурентов, слайды команды и заметки спикера. Подходит для стадий от seed до Series A и выше.',
      'uk-UA':
        'Створюйте інвесторські пітч-деки, презентації продуктів та корпоративні продажі: градієнтний дизайн, графіки, таблиці конкурентів, слайди команди та нотатки доповідача. Підходить для стадій від Seed до Series A+.',
    },
    promptsI18n: {
      'en-US': [
        'Create a 12-slide Series A investor deck for a B2B SaaS data pipeline startup with ARR charts, competitive comparison table, team avatars, and financial projections',
        'Create an 8-slide product launch deck for an AI code review tool with 5 feature icons, before/after comparison, customer satisfaction doughnut chart, and 3-tier pricing table',
        'Create a 10-slide enterprise sales deck for a cybersecurity platform with ROI analysis, radar chart vs competitors, financial impact table, and implementation timeline',
      ],
      'zh-CN': [
        '为一个 B2B SaaS 数据管道创业公司制作 12 页 A 轮投资路演，包含 ARR 图表、竞品对比表、团队头像和财务预测',
        '为一个 AI 代码审查工具制作 8 页产品发布演示，包含 5 个功能图标、前后对比、客户满意度环形图和 3 档定价表',
        '为一个网络安全平台制作 10 页企业销售演示，包含 ROI 分析、雷达图竞品对比、财务影响表和实施时间线',
      ],
      'ru-RU': [
        'Создай инвесторский питч-дек на 12 слайдов для B2B SaaS-стартапа по построению дата-пайплайнов: графики ARR, таблица сравнения с конкурентами, аватары команды и финансовые прогнозы',
        'Создай презентацию запуска продукта на 8 слайдов для инструмента AI-ревью кода: 5 иконок функций, сравнение «до/после», кольцевая диаграмма удовлетворённости клиентов и трёхуровневая таблица тарифов',
        'Создай корпоративный продающий дек на 10 слайдов для платформы кибербезопасности: анализ ROI, радарная диаграмма сравнения с конкурентами, таблица финансового влияния и график внедрения',
      ],
      'uk-UA': [
        'Створити інвесторський дек на 12 слайдів раунду A для стартапу B2B SaaS з графіками ARR, таблицею конкурентів та фінансовими прогнозами',
        'Створити 8 слайдів для запуску продукту AI code review з іконками функцій, порівнянням "до/після" та таблицею цін',
        'Створити 10 слайдів корпоративної презентації для платформи кібербезпеки з аналізом ROI та графіком впровадження',
      ],
    },
  },
  {
    id: 'dashboard-creator',
    avatar: '📊',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/dashboard-creator',
    ruleFiles: {
      'en-US': 'dashboard-creator.md',
      'zh-CN': 'dashboard-creator.zh-CN.md',
    },
    defaultEnabledSkills: ['officecli-data-dashboard'],
    nameI18n: {
      'en-US': 'Dashboard Creator',
      'zh-CN': '数据仪表盘',
      'ru-RU': 'Создатель дашбордов',
      'uk-UA': 'Створювач дашбордів',
    },
    descriptionI18n: {
      'en-US':
        'Turn CSV or tabular data into polished Excel dashboards with KPI cards, charts linked to live data, sparklines, and conditional formatting. Automatically scales complexity to dataset size — from quick summaries to full analytics panels.',
      'zh-CN':
        '将 CSV 或表格数据转化为精美的 Excel 仪表盘，包含 KPI 卡片、关联实时数据的图表、迷你图和条件格式。根据数据量自动缩放复杂度——从简洁汇总到完整分析面板。',
      'ru-RU':
        'Преобразует CSV и табличные данные в аккуратные Excel-дашборды: KPI-карточки, графики с привязкой к данным, спарклайны и условное форматирование. Масштабирует сложность под объём данных - от краткой сводки до полноценной аналитической панели.',
      'uk-UA':
        "Перетворюйте CSV або табличні дані на професійні дашборди Excel: KPI-картки, графіки з прив'язкою до даних, спарклайни та умовне форматування. Автоматично масштабує складність під обсяг даних.",
    },
    promptsI18n: {
      'en-US': [
        'Create a SaaS MRR dashboard with 12 months of sample data — show MRR trend, month-over-month growth, and churn breakdown for a board meeting',
        'Build an e-commerce regional sales dashboard with sample data across 5 regions: revenue by region, weekly trends, and category split',
        'Make a budget-vs-actuals dashboard for 8 departments showing variance indicators and over/under-budget status',
      ],
      'zh-CN': [
        '做一个 SaaS MRR 仪表盘，用 12 个月的示例数据，展示 MRR 趋势、环比增长和流失分析，适合董事会汇报',
        '做一个电商区域销售仪表盘，生成 5 个区域的示例数据，展示按区域收入、周趋势和品类占比',
        '做一个 8 个部门的预算 vs 实际仪表盘，展示偏差指标和超支/节余状态',
      ],
      'ru-RU': [
        'Создай дашборд MRR для SaaS с примерными данными за 12 месяцев — покажи тренд MRR, помесячный рост и разбивку оттока для совета директоров',
        'Собери дашборд региональных продаж электронной коммерции с данными по 5 регионам: выручка по регионам, недельные тренды и разбивка по категориям',
        'Сделай дашборд «план/факт» для 8 отделов с индикаторами отклонений и статусом превышения/недоиспользования бюджета',
      ],
      'uk-UA': [
        'Створити дашборд SaaS MRR на основі даних за 12 місяців — показати тренд MRR, щомісячне зростання та аналіз відтоку',
        'Побудувати регіональний дашборд продажів для e-commerce з даними по 5 регіонах: дохід за регіоном, тижневі тренди',
        'Зробити дашборд "бюджет проти факту" для 8 відділів з індикаторами розбіжностей',
      ],
    },
  },
  {
    id: 'academic-paper',
    avatar: '📚',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/academic-paper',
    ruleFiles: {
      'en-US': 'academic-paper.md',
      'zh-CN': 'academic-paper.zh-CN.md',
    },
    defaultEnabledSkills: ['officecli-academic-paper'],
    nameI18n: {
      'en-US': 'Academic Paper',
      'zh-CN': '学术论文助手',
      'ru-RU': 'Помощник по академическим работам',
      'uk-UA': 'Академічний помічник',
    },
    descriptionI18n: {
      'en-US':
        'Create formally structured academic papers, research papers, and white papers with native Word TOC, LaTeX-to-OMML equations, scholarly bibliography (APA/Physics/Chicago), footnotes, multi-column layouts, and paper-type-specific styling.',
      'zh-CN':
        '创建正式结构的学术论文、研究论文和白皮书，支持原生 Word 目录、LaTeX 转 OMML 公式、学术参考文献（APA/物理/芝加哥格式）、脚注、多栏排版和论文类型专属样式。',
      'ru-RU':
        'Создаёт академические статьи, научные работы и white paper со строгой структурой: нативное оглавление Word, формулы LaTeX в OMML, библиография в форматах APA/Physics/Chicago, сноски, многоколоночная вёрстка и стили под тип работы.',
      'uk-UA':
        'Створюйте структуровані академічні статті, наукові роботи та White Papers: зміст Word, формули LaTeX в OMML, бібліографія (APA/Physics/Chicago), виноски та багатоколонкова верстка.',
    },
    promptsI18n: {
      'en-US': [
        'Create a white paper on rural EV charging infrastructure with executive summary, data tables, footnotes, CONFIDENTIAL watermark, and professional headers',
        'Write a physics paper on topological insulators with display equations, multi-column abstract, theorem/definition blocks, and landscape figures',
        'Create an APA-style research paper on organizational culture with 3 data tables, endnotes, 15 references with hanging indent, and double spacing',
      ],
      'zh-CN': [
        '创建一份农村电动汽车充电基础设施白皮书，包含执行摘要、数据表格、脚注、CONFIDENTIAL 水印和专业页头',
        '写一篇拓扑绝缘体物理论文，包含展示式公式、多栏摘要、定理/定义模块和横向图表',
        '创建一份 APA 格式的组织文化研究论文，包含 3 个数据表格、尾注、15 条挂缩进参考文献和双倍行距',
      ],
      'ru-RU': [
        'Создай white paper о зарядной инфраструктуре для электромобилей в сельской местности с резюме, таблицами данных, сносками, водяным знаком CONFIDENTIAL и профессиональными колонтитулами',
        'Напиши статью по физике о топологических изоляторах с выключенными формулами, многоколоночным аннотацией, блоками теорем/определений и альбомными иллюстрациями',
        'Создай исследовательскую работу об организационной культуре в формате APA с 3 таблицами данных, концевыми сносками, 15 источниками с выступающим отступом и двойным интервалом',
      ],
      'uk-UA': [
        'Створити White Paper про інфраструктуру зарядки електромобілів у сільській місцевості з таблицями даних та виносками',
        'Написати статтю з фізики про топологічні ізолятори з формулами, анотацією та блоками теорем',
        'Створити наукову роботу в стилі APA про організаційну культуру з 3 таблицями даних та 15 джерелами',
      ],
    },
  },
  {
    id: 'financial-model-creator',
    avatar: '💰',
    presetAgentType: 'gemini',
    resourceDir: 'src/process/resources/assistant/financial-model-creator',
    ruleFiles: {
      'en-US': 'financial-model-creator.md',
      'zh-CN': 'financial-model-creator.zh-CN.md',
    },
    defaultEnabledSkills: ['officecli-financial-model'],
    nameI18n: {
      'en-US': 'Financial Model Creator',
      'zh-CN': '财务建模助手',
      'ru-RU': 'Создатель финансовых моделей',
      'uk-UA': 'Фінансовий моделіст',
    },
    descriptionI18n: {
      'en-US':
        'Build formula-driven financial models from text prompts: 3-statement models, DCF valuations, cap tables, scenario analyses, sensitivity tables, and debt schedules. All values flow from assumptions through interconnected formula chains.',
      'zh-CN':
        '根据文本描述构建公式驱动的财务模型：三表联动、DCF 估值、股权表、情景分析、敏感性分析和债务计划。所有数值通过公式链从假设条件层层推导。',
      'ru-RU':
        'Строит финансовые модели на основе текстового запроса: три финансовые формы, DCF-оценка, cap table, сценарный анализ, таблицы чувствительности и долговые графики. Все значения выводятся через связные формульные цепочки от исходных предположений.',
      'uk-UA':
        'Будуйте фінансові моделі на основі формул за текстовим запитом: три фінансові форми, DCF-оцінка, Cap Tables, сценарний аналіз та графіки боргів.',
    },
    promptsI18n: {
      'en-US': [
        'Build a 3-year SaaS financial model with income statement, balance sheet, cash flow, and dashboard charts',
        'Create a DCF valuation for a manufacturing company with WACC calculation and sensitivity table',
        'Build a cap table with seed and Series A rounds, liquidation preferences, and exit waterfall analysis',
      ],
      'zh-CN': [
        '搭建一个 3 年期 SaaS 财务模型，包含利润表、资产负债表、现金流量表和看板图表',
        '为制造业公司创建 DCF 估值模型，包含 WACC 计算和敏感性分析表',
        '搭建股权表，包含种子轮和 A 轮融资、清算优先权和退出瀑布分析',
      ],
      'ru-RU': [
        'Построй трёхлетнюю финансовую модель для SaaS с отчётом о прибылях и убытках, балансом, отчётом о движении денежных средств и графиками дашборда',
        'Создай DCF-оценку для производственной компании с расчётом WACC и таблицей чувствительности',
        'Построй cap table с раундами seed и Series A, ликвидационными преференциями и каскадным анализом выхода',
      ],
      'uk-UA': [
        'Побудувати 3-річну фінансову модель SaaS зі звітом про прибутки, балансом та графіками',
        'Створити оцінку DCF для виробничої компанії з розрахунком WACC та таблицею чутливості',
        'Побудувати Cap Table з раундами Seed та раундом A, преференціями ліквідації',
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
      'ru-RU': 'Помощник Star Office',
      'uk-UA': 'Помічник Star Office',
    },
    descriptionI18n: {
      'en-US': 'Install, connect, and troubleshoot Star-Office-UI visualization for Aion preview.',
      'zh-CN': '用于在 Aion 预览中安装、连接并排查 Star-Office-UI 可视化问题。',
      'ru-RU':
        'Помогает установить, подключить и диагностировать визуализацию Star-Office-UI для предпросмотра в Aion.',
      'uk-UA':
        'Допомагає встановлювати, підключати та діагностувати візуалізацію Star-Office-UI для попереднього перегляду в Aion.',
    },
    promptsI18n: {
      'en-US': [
        'Set up Star Office on my machine',
        'Fix Unauthorized on Star Office page',
        'Connect Aion preview to http://127.0.0.1:19000',
      ],
      'zh-CN': ['帮我安装 Star Office', '排查 Star Office Unauthorized', '把 Aion 预览连接到 http://127.0.0.1:19000'],
      'ru-RU': [
        'Настрой Star Office на моём компьютере',
        'Исправь ошибку Unauthorized на странице Star Office',
        'Подключи предпросмотр Aion к http://127.0.0.1:19000',
      ],
      'uk-UA': [
        "Налаштувати Star Office на моєму комп'ютері",
        'Виправити помилку Unauthorized на сторінці Star Office',
        'Підключити попередній перегляд Aion до http://127.0.0.1:19000',
      ],
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
      'ru-RU': 'Эксперт по настройке OpenClaw',
      'uk-UA': 'Експерт з налаштування OpenClaw',
    },
    descriptionI18n: {
      'en-US':
        'Expert guide for installing, deploying, configuring, and troubleshooting OpenClaw. Proactively helps with setup, diagnoses issues, and provides security best practices.',
      'zh-CN': 'OpenClaw 安装、部署、配置和故障排查专家。主动协助设置、诊断问题并提供安全最佳实践。',
      'ru-RU':
        'Эксперт по установке, развёртыванию, настройке и устранению неполадок OpenClaw. Помогает пройти настройку, диагностирует проблемы и подсказывает безопасные практики.',
      'uk-UA':
        'Експертний посібник зі встановлення, розгортання, налаштування та усунення несправностей OpenClaw. Допомагає з налаштуванням та безпекою.',
    },
    promptsI18n: {
      'en-US': [
        'Help me install OpenClaw step by step',
        "My OpenClaw isn't working, please diagnose the issue",
        'Configure Telegram channel for OpenClaw integration',
      ],
      'zh-CN': ['帮我一步步安装 OpenClaw', '我的 OpenClaw 出问题了，请帮我诊断', '为 OpenClaw 配置 Telegram 渠道'],
      'ru-RU': [
        'Помоги мне установить OpenClaw пошагово',
        'Мой OpenClaw не работает, пожалуйста, диагностируй проблему',
        'Настрой Telegram-канал для интеграции с OpenClaw',
      ],
      'uk-UA': [
        'Допоможи мені встановити OpenClaw крок за кроком',
        'Мій OpenClaw не працює, будь ласка, діагностуй проблему',
        'Налаштувати канал Telegram для інтеграції з OpenClaw',
      ],
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
      'ru-RU': 'cowork-skills.ru-RU.md',
    },
    defaultEnabledSkills: ['skill-creator', 'officecli-pptx', 'officecli-docx', 'pdf', 'officecli-xlsx'],
    nameI18n: {
      'en-US': 'Cowork',
      'zh-CN': 'Cowork',
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
  },
  // Deprecated: replaced by ppt-creator (officecli-based)
  // {
  //   id: 'pptx-generator',
  //   avatar: '📊',
  //   presetAgentType: 'gemini',
  //   resourceDir: 'src/process/resources/assistant/pptx-generator',
  //   ruleFiles: {
  //     'en-US': 'pptx-generator.md',
  //     'zh-CN': 'pptx-generator.zh-CN.md',
  //   },
  //   nameI18n: {
  //     'en-US': 'PPTX Generator',
  //     'zh-CN': 'PPTX 生成器',
  //   },
  //   descriptionI18n: {
  //     'en-US': 'Generate local PPTX assets and structure for pptxgenjs.',
  //     'zh-CN': '生成本地 PPTX 资产与结构（pptxgenjs）。',
  //   },
  //   promptsI18n: {
  //     'en-US': [
  //       'Create a professional slide deck about AI trends with 10 slides',
  //       'Generate a quarterly business report presentation',
  //       'Make a product launch presentation with visual elements',
  //     ],
  //     'zh-CN': ['创建一个包含 10 页的专业 AI 趋势幻灯片', '生成季度业务报告演示文稿', '制作包含视觉元素的产品发布演示'],
  //   },
  // },
  // Deprecated: replaced by ppt-creator (officecli-based)
  // {
  //   id: 'pdf-to-ppt',
  //   avatar: '📄',
  //   presetAgentType: 'gemini',
  //   resourceDir: 'src/process/resources/assistant/pdf-to-ppt',
  //   ruleFiles: {
  //     'en-US': 'pdf-to-ppt.md',
  //     'zh-CN': 'pdf-to-ppt.zh-CN.md',
  //   },
  //   nameI18n: {
  //     'en-US': 'PDF to PPT',
  //     'zh-CN': 'PDF 转 PPT',
  //   },
  //   descriptionI18n: {
  //     'en-US': 'Convert PDF to PPT with watermark removal rules.',
  //     'zh-CN': 'PDF 转 PPT 并去除水印规则',
  //   },
  //   promptsI18n: {
  //     'en-US': [
  //       'Convert report.pdf to a PowerPoint presentation',
  //       'Extract all charts and diagrams from whitepaper.pdf',
  //       'Transform this PDF document into slides with proper formatting',
  //     ],
  //     'zh-CN': [
  //       '将 report.pdf 转换为 PowerPoint 演示文稿',
  //       '从白皮书提取所有图表和示意图',
  //       '将此 PDF 文档转换为格式正确的幻灯片',
  //     ],
  //   },
  // },
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
      'ru-RU': 'Генератор 3D-игр',
      'uk-UA': 'Генератор 3D-ігор',
    },
    descriptionI18n: {
      'en-US': 'Generate a complete 3D platform collection game in one HTML file.',
      'zh-CN': '用单个 HTML 文件生成完整的 3D 平台收集游戏。',
      'ru-RU': 'Генерирует полноценную 3D-игру-платформер со сбором предметов в одном HTML-файле.',
      'uk-UA': 'Генеруйте повноцінну 3D-гру-платформер зі збором предметів в одному HTML-файлі.',
    },
    promptsI18n: {
      'en-US': [
        'Create a 3D platformer game with jumping mechanics',
        'Make a coin collection game with obstacles',
        'Build a 3D maze exploration game',
      ],
      'zh-CN': ['创建一个带跳跃机制的 3D 平台游戏', '制作一个带障碍物的金币收集游戏', '构建一个 3D 迷宫探索游戏'],
      'ru-RU': [
        'Создай 3D-платформер с механикой прыжков',
        'Сделай игру со сбором монет и препятствиями',
        'Построй 3D-игру с исследованием лабиринта',
      ],
      'uk-UA': [
        'Створити 3D-платформер з механікою стрибків',
        'Зробити гру зі збором монет та перешкодами',
        'Побудувати 3D-гру з дослідженням лабіринту',
      ],
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
      'ru-RU': 'UI/UX Pro Max',
      'uk-UA': 'UI/UX Pro Max',
    },
    descriptionI18n: {
      'en-US':
        'Professional UI/UX design intelligence with 57 styles, 95 color palettes, 56 font pairings, and stack-specific best practices.',
      'zh-CN': '专业 UI/UX 设计智能助手，包含 57 种风格、95 个配色方案、56 个字体配对及技术栈最佳实践。',
      'ru-RU':
        'Профессиональный UI/UX-помощник с 57 стилями, 95 цветовыми палитрами, 56 сочетаниями шрифтов и лучшими практиками для разных стеков.',
      'uk-UA':
        'Професійний UI/UX-помічник з 57 стилями, 95 кольоровими палітрами, 56 поєднаннями шрифтів та найкращими практиками для різних технологій.',
    },
    promptsI18n: {
      'en-US': [
        'Design a modern login page for a fintech mobile app',
        'Create a color palette for a nature-themed website',
        'Design a dashboard interface for a SaaS product',
      ],
      'zh-CN': ['为金融科技移动应用设计现代登录页', '创建自然主题网站的配色方案', '为 SaaS 产品设计仪表板界面'],
      'ru-RU': [
        'Разработай современную страницу входа для мобильного финтех-приложения',
        'Создай цветовую палитру для сайта в природной тематике',
        'Спроектируй интерфейс дашборда для SaaS-продукта',
      ],
      'uk-UA': [
        'Спроектувати сучасну сторінку входу для мобільного фінтех-додатку',
        'Створити кольорову палітру для сайту на природну тематику',
        'Розробити інтерфейс дашборду для SaaS-продукту',
      ],
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
      'ru-RU': 'Коуч HUMAN 3.0',
      'uk-UA': 'Коуч HUMAN 3.0',
    },
    descriptionI18n: {
      'en-US':
        'Personal development coach based on HUMAN 3.0 framework: 4 Quadrants (Mind/Body/Spirit/Vocation), 3 Levels, 3 Growth Phases.',
      'zh-CN': '基于 HUMAN 3.0 框架的个人发展教练：4 象限（思维/身体/精神/职业）、3 层次、3 成长阶段。',
      'ru-RU':
        'Коуч по личному развитию на основе фреймворка HUMAN 3.0: 4 квадранта (ум, тело, дух, призвание), 3 уровня и 3 фазы роста.',
      'uk-UA':
        'Коуч з особистого розвитку на основі фреймворка HUMAN 3.0: 4 квадранти (Розум/Тіло/Дух/Призвання), 3 рівні та 3 фази росту.',
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
      'ru-RU': [
        'Помоги мне поставить квартальные цели по всем сферам жизни',
        'Проанализируй мой карьерный прогресс и спланируй следующие шаги',
        'Создай план личного развития на ближайшие 3 месяца',
      ],
      'uk-UA': [
        'Допоможи мені встановити квартальні цілі в усіх сферах життя',
        "Проаналізувати мій кар'єрний шлях та спланувати наступні кроки",
        'Створити план особистого розвитку на наступні 3 місяці',
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
      'ru-RU': 'social-job-publisher-skills.ru-RU.md',
    },
    defaultEnabledSkills: ['xiaohongshu-recruiter', 'x-recruiter'],
    nameI18n: {
      'en-US': 'Social Job Publisher',
      'zh-CN': '社交招聘发布助手',
      'ru-RU': 'Публикатор вакансий в соцсетях',
      'uk-UA': 'Публікатор вакансій',
    },
    descriptionI18n: {
      'en-US': 'Expand hiring requests into a full JD, images, and publish to social platforms via connectors.',
      'zh-CN': '扩写招聘需求为完整 JD 与图片，并通过 connector 发布到社交平台。',
      'ru-RU':
        'Разворачивает запрос на найм в полноценное описание вакансии и изображения, а затем публикует это в соцсетях через коннекторы.',
      'uk-UA':
        'Розгортає запит на найм у повноцінний опис вакансії та зображення, а потім публікує це в соцмережах через конектори.',
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
      'ru-RU': [
        'Создай развёрнутую вакансию на позицию Senior Full-Stack Engineer',
        'Составь привлекательный твит о найме для соцсетей',
        'Создай публикацию вакансии для нескольких платформ (LinkedIn, X, Xiaohongshu)',
      ],
      'uk-UA': [
        'Створити повний опис вакансії Senior Full-Stack інженера',
        'Написати цікавий пост про найм для соцмереж',
        'Створити пост про вакансію для кількох платформ (LinkedIn, X)',
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
      'ru-RU': 'moltbook-skills.ru-RU.md',
    },
    defaultEnabledSkills: ['moltbook'],
    nameI18n: {
      'en-US': 'moltbook',
      'zh-CN': 'moltbook',
      'ru-RU': 'moltbook',
      'uk-UA': 'moltbook',
    },
    descriptionI18n: {
      'en-US': 'The social network for AI agents. Post, comment, upvote, and create communities.',
      'zh-CN': 'AI 代理的社交网络。发帖、评论、投票、创建社区。',
      'ru-RU': 'Социальная сеть для AI-агентов: публикации, комментарии, голосования и создание сообществ.',
      'uk-UA': 'Соціальна мережа для AI-агентів. Публікації, коментарі, голосування та створення спільнот.',
    },
    promptsI18n: {
      'en-US': [
        'Check my moltbook feed for latest updates',
        'Post an interesting update to moltbook',
        'Check for new direct messages',
      ],
      'zh-CN': ['查看我的 moltbook 最新动态', '在 moltbook 发布一条有趣的动态', '检查是否有新私信'],
      'ru-RU': [
        'Проверь мою ленту moltbook на наличие новых обновлений',
        'Опубликуй интересное обновление в moltbook',
        'Проверь новые личные сообщения',
      ],
      'uk-UA': [
        'Перевірити стрічку moltbook на наявність оновлень',
        'Опублікувати цікавий пост у moltbook',
        'Перевірити нові особисті повідомлення',
      ],
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
      'ru-RU': 'Ролевые истории',
      'uk-UA': 'Рольові історії',
    },
    descriptionI18n: {
      'en-US':
        'Immersive story roleplay. Start by: 1) Natural language to create characters, 2) Paste PNG images, or 3) Open folder with character cards (PNG/JSON) and world info.',
      'zh-CN':
        '沉浸式故事角色扮演。三种开始方式：1) 自然语言直接对话创建角色，2) 直接粘贴PNG图片，3) 打开包含角色卡（PNG/JSON）和世界书的文件夹。',
      'ru-RU':
        'Иммерсивный сюжетный ролевой режим. Можно начать тремя способами: описать персонажей словами, вставить PNG-изображения или открыть папку с карточками персонажей и лором мира.',
      'uk-UA':
        'Іммерсивний сюжетний рольовий режим. Можна почати трьома способами: описати персонажів словами, вставити PNG-зображення або відкрити папку з картками персонажів та лором світу.',
    },
    promptsI18n: {
      'en-US': [
        'Start an epic fantasy adventure with a brave warrior',
        'Create a detailed character with backstory and personality',
        'Begin an interactive story in a sci-fi setting',
      ],
      'zh-CN': ['开始一个勇敢战士的史诗奇幻冒险', '创建一个有背景故事和个性的详细角色', '在科幻设定中开始一个互动故事'],
      'ru-RU': [
        'Начни эпическое фэнтези-приключение с отважным воином',
        'Создай детального персонажа с предысторией и характером',
        'Начни интерактивную историю в научно-фантастическом сеттинге',
      ],
      'uk-UA': [
        'Почати епічну фентезі-пригоду з хоробрим воїном',
        'Створити детального персонажа з історією та характером',
        'Почати інтерактивну історію в науково-фантастичному сетингу',
      ],
    },
  },
];
