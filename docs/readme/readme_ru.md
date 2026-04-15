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
  <strong>Бесплатное приложение с открытым исходным кодом для совместной работы с ИИ-агентами</strong><br>
  <em>Встроенный агент | Без настройки | Любой API-ключ | Мультиагентность | Удалённый доступ | Кроссплатформенность | Автоматизация 24/7</em>
</p>

<p align="center">
  <a href="https://github.com/iOfficeAI/AionUi/releases">
    <img src="https://img.shields.io/badge/⬇️%20Download%20Now-Latest%20Release-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="Download Latest Release" height="50">
  </a>
</p>

<p align="center">
  <a href="./readme.md">English</a> | <a href="./docs/readme/readme_ch.md">简体中文</a> | <a href="./docs/readme/readme_tw.md">繁體中文</a> | <a href="./docs/readme/readme_jp.md">日本語</a> | <a href="./docs/readme/readme_ko.md">한국어</a> | <a href="./docs/readme/readme_es.md">Español</a> | <a href="./docs/readme/readme_pt.md">Português</a> | <a href="./docs/readme/readme_tr.md">Türkçe</a> | <strong>Русский</strong> | <a href="https://www.aionui.com" target="_blank">Официальный сайт</a>
</p>

<p align="center">
  <strong>💬 Сообщество:</strong> <a href="https://discord.gg/2QAwJn7Egx" target="_blank">Discord (English)</a> | <a href="./resources/wx-6.png" target="_blank">微信 (中文群)</a> | <a href="https://twitter.com/AionUI" target="_blank">Twitter</a>
</p>

---

## 📋 Быстрая навигация

<p align="center">

[✨ Cowork в действии](#-cowork-in-action) ·
[🤔 Почему AionUi?](#-why-choose-aionui-over-claude-cowork) ·
[🚀 Быстрый старт](#-quick-start) ·
[💬 Сообщество](#-community--support)

</p>

---

## Cowork — ИИ-агенты, которые работают вместе с вами

**AionUi — это больше, чем просто клиент для чата.** Это платформа Cowork, где ИИ-агенты работают вместе с вами на вашем компьютере — читают файлы, пишут код, просматривают веб-страницы и автоматизируют задачи. Вы видите всё, что делает агент, и всегда остаётесь в управлении.

|                                        | Традиционные ИИ-чаты | **AionUi (Cowork)**                                                                          |
| :------------------------------------- | :------------------- | :------------------------------------------------------------------------------------------- |
| ИИ может работать с вашими файлами     | Ограниченно или нет  | **Да — встроенный агент с полным доступом к файлам**                                         |
| ИИ может выполнять многошаговые задачи | Ограниченно          | **Да — автономно с вашего одобрения**                                                        |
| Удалённый доступ с телефона            | Редко                | **WebUI + Telegram / Lark / DingTalk**                                                       |
| Запланированная автоматизация          | Нет                  | **Cron — 24/7 без присмотра**                                                                |
| Несколько ИИ-агентов одновременно      | Нет                  | **Claude Code, Codex, OpenClaw, Qwen Code и 12+ других — автоопределение, единый интерфейс** |
| Цена                                   | Бесплатно / Платно   | **Бесплатно и с открытым исходным кодом**                                                    |

<p align="center">
  <img src="./resources/offica-ai BANNER-function.png" alt="AionUi Cowork Platform" width="800">
</p>

---

## Встроенный агент — установил и работай, без настройки

AionUi поставляется с полноценным движком ИИ-агента. В отличие от инструментов, требующих отдельной установки CLI-агентов, **AionUi работает сразу после установки**.

- **Не нужно устанавливать CLI-инструменты** — движок агента встроен
- **Без сложной настройки** — войдите через Google или вставьте любой API-ключ
- **Полные возможности агента** — чтение/запись файлов, поиск в интернете, генерация изображений, MCP-инструменты
- **Готовые ассистенты** — 11+ встроенных профессиональных ассистентов (Cowork, Генератор PPTX, PDF в PPT, 3D-игра, UI/UX Pro Max и другие), готовые к использованию немедленно

<p align="center">
  <img src="./resources/build-in agents.png" alt="Built-in Agents" width="800">
</p>

### **Офисные ассистенты — PPT, Word и Excel**

Эти направления соответствуют тому, что приложение действительно предоставляет: предустановки **Morph PPT** и навыки **`pptx` / `docx` / `xlsx`** (см. предустановки `assistant/` и `skills/` в репозитории). Нужен вывод в документы или таблицы? Встроенный **[OfficeCLI](https://github.com/iOfficeAI/OfficeCli)** помогает превратить запрос в готовый PPT (Morph), Word (`.docx`) и Excel (`.xlsx/.xlsm/.csv`) быстрее и надёжнее.
Три типа ассистентов соответствуют файловым рабочим процессам, а итоговые файлы можно сразу редактировать и использовать повторно.

#### **Ассистент PPT**

> **Результат:** редактируемый Morph PPT (`.pptx`)
> Морфированные переходы между слайдами с согласованным повествованием; на базе [OfficeCLI](https://github.com/iOfficeAI/OfficeCli).

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

#### **Ассистент Word**

> **Результат:** редактируемый Word (`.docx`)
> Написание статей/диссертаций и готовое редактирование документов через навык `docx`; на базе [OfficeCLI](https://github.com/iOfficeAI/OfficeCli).

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

#### **Ассистент Excel**

> **Результат:** готовый Excel (`.xlsx/.xlsm/.csv`)
> Генерация/обновление таблиц через `xlsx` для анализа, автоформатирования и диаграмм; на базе [OfficeCLI](https://github.com/iOfficeAI/OfficeCli).

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

## Мультиагентный режим — уже есть CLI-агенты? Подключайте их

Если вы уже используете Claude Code, Codex или Qwen Code, AionUi автоматически обнаружит их и позволит работать со всеми ними вместе со встроенным агентом.

**Поддерживаемые агенты:** Встроенный агент (без настройки) • Claude Code • Codex • Qwen Code • Goose AI • OpenClaw • Augment Code • iFlow CLI • CodeBuddy • Kimi CLI • OpenCode • Factory Droid • GitHub Copilot • Qoder CLI • Mistral Vibe • Nanobot и другие

<p align="center">
  <img src="./resources/multi-agent支持openclaw.gif" alt="Multi-Agent Cowork" width="800">
</p>

- **Автоопределение** — автоматически распознаёт установленные CLI-инструменты
- **Единый интерфейс** — одна платформа Cowork для всех ваших ИИ-агентов
- **Параллельные сессии** — запуск нескольких агентов одновременно с независимым контекстом
- **Единое управление MCP** — настройте MCP (Model Context Protocol) инструменты один раз, автоматическая синхронизация со всеми агентами — не нужно настраивать каждый агент отдельно

---

## Любой API-ключ, полная мощь Cowork-агента

Другие ИИ-приложения дают вам чат с вашим API-ключом. **AionUi даёт полноценного Cowork-агента.**

| Ваш API-ключ                                        | Что вы получаете            |
| :-------------------------------------------------- | :-------------------------- |
| API-ключ Gemini (или вход через Google — бесплатно) | Cowork-агент на базе Gemini |
| API-ключ OpenAI                                     | Cowork-агент на базе GPT    |
| API-ключ Anthropic                                  | Cowork-агент на базе Claude |
| Ollama / LM Studio (локально)                       | Локальный Cowork-агент      |
| Шлюз NewAPI                                         | Единый доступ к 20+ моделям |

Одни и те же возможности — чтение/запись файлов, поиск в интернете, генерация изображений, использование инструментов — независимо от того, какая модель лежит в основе. AionUi поддерживает **20+ ИИ-платформ**, включая облачные сервисы и локальные развёртывания.

<p align="center">
  <img src="./resources/llm_newapi.png" alt="Multi-Model Support" width="800">
</p>

<details>
<summary><strong>🔍 Посмотреть все 20+ поддерживаемых платформ ▶️</strong></summary>

<br>

**Комплексная поддержка платформ:**

- **Официальные платформы** — Gemini, Gemini (Vertex AI), Anthropic (Claude), OpenAI
- **Облачные провайдеры** — AWS Bedrock, New API (унифицированный шлюз ИИ-моделей)
- **Китайские платформы** — Dashscope (Qwen), Zhipu, Moonshot (Kimi), Qianfan (Baidu), Hunyuan (Tencent), Lingyi, ModelScope, InfiniAI, Ctyun, StepFun
- **Международные платформы** — DeepSeek, MiniMax, OpenRouter, SiliconFlow, xAI, Ark (Volcengine), Poe
- **Локальные модели** — Ollama, LM Studio (через пользовательскую платформу с локальной API-точкой)

AionUi также поддерживает шлюз-сервис [NewAPI](https://github.com/QuantumNous/new-api) — единый хаб ИИ-моделей, агрегирующий и распространяющий различные LLM. Гибкое переключение между разными моделями в одном интерфейсе для решения различных задач.

</details>

---

## Расширяемые ассистенты и навыки

_Расширяемая система ассистентов с 12 встроенными профессиональными ассистентами и поддержкой пользовательских навыков. Создавайте и управляйте собственными ассистентами и навыками._

- **Создание пользовательских ассистентов** — определяйте собственных ассистентов с пользовательскими правилами и возможностями
- **Управление навыками** — создавайте, включайте и отключайте навыки для любого ассистента, расширяя возможности ИИ

<p align="center">
  <img src="./resources/assistants_skills.png" alt="AI Assistants & Skills Ecosystem" width="800">
</p>

<details>
<summary><strong>🔍 Подробности об ассистентах и пользовательских навыках ▶️</strong></summary>

<br>

AionUi включает **12 профессиональных ассистентов** с предопределёнными возможностями, расширяемыми через пользовательские навыки:

- **🤝 Cowork** — автономное выполнение задач (операции с файлами, обработка документов, планирование рабочих процессов)
- **📊 PPTX Generator** — генерация презентаций PPTX
- **📄 PDF to PPT** — конвертация PDF в PPT
- **🎮 3D Game** — генерация 3D-игр в одном файле
- **🎨 UI/UX Pro Max** — профессиональный UI/UX дизайн (57 стилей, 95 цветовых палитр)
- **📋 Planning with Files** — планирование на основе файлов для сложных задач (постоянное markdown-планирование в стиле Manus)
- **🧭 HUMAN 3.0 Coach** — персональный коуч по развитию
- **📣 Social Job Publisher** — публикация и размещение вакансий
- **🦞 moltbook** — социальная сеть ИИ-агентов без развёртывания
- **📈 Beautiful Mermaid** — блок-схемы, диаграммы последовательностей и многое другое
- **🔧 OpenClaw Setup** — ассистент по настройке и конфигурации интеграции OpenClaw
- **📖 Story Roleplay** — иммерсивная ролевая игра с карточками персонажей и информацией о мире (совместимо с SillyTavern)

**Пользовательские навыки**: создавайте навыки в директории `skills/`, включайте/отключайте навыки для ассистентов, расширяя возможности ИИ. Встроенные навыки включают `pptx`, `docx`, `pdf`, `xlsx`, `mermaid` и другие.

> 💡 Каждый ассистент определяется markdown-файлом. Проверьте директорию `assistant/` для примеров.

</details>

---

## Cowork откуда угодно

_Ваш ИИ-ассистент 24/7 — доступ к AionUi с любого устройства, из любой точки мира._

- **Режим WebUI** — доступ через браузер с телефона, планшета или любого компьютера. Поддержка LAN, кросс-сетевой доступ и развёртывание на сервере. Вход по QR-коду или паролю.

- **Интеграция с платформами чатов**
  - **Telegram** — совместная работа с ИИ-агентом напрямую через Telegram
  - **Lark (Feishu)** — Cowork через Feishu-ботов для корпоративного взаимодействия
  - **DingTalk** — потоковая передача AI-карт с автоматическим переключением
  - **Slack** и другие платформы скоро появятся

> **Настройка:** Настройки AionUi → Настройки WebUI → Канал, настройте токен бота.

<p align="center">
  <img src="./resources/webui-remote.gif" alt="WebUI remote access demo" width="800">
</p>

<p align="center"><em>Удалённое управление и мониторин агента — Claude, Gemini, Codex. Используйте из браузера или с телефона, так же как удалённый доступ Claude Code.</em></p>

> [Руководство по удалённому доступу через интернет](https://github.com/iOfficeAI/AionUi/wiki/Remote-Internet-Access-Guide-Chinese)

## ✨ Cowork в действии

### **Запланированные задачи — Cowork на автопилоте**

_Настройте один раз, ИИ-агент работает автоматически по расписанию — настоящая круглосуточная работа без присмотра._

- **Естественный язык** — скажите агенту, что нужно сделать, как в обычном чате
- **Гибкое планирование** — ежедневно, еженедельно, ежемесячно или пользовательские cron-выражения
- **Примеры использования:** запланированная агрегация данных, генерация отчётов, организация файлов, напоминания

<p align="center">
  <img src="./resources/alart/task.png" alt="Scheduled Tasks" width="800">
</p>

<details>
<summary><strong>🔍 Подробности о запланированных задачах ▶️</strong></summary>

<br>

- **Привязка к разговору** — каждая запланированная задача привязана к разговору, сохраняя контекст и историю
- **Автоматическое выполнение** — задачи выполняются автоматически в запланированное время, отправляя сообщения в разговор
- **Простое управление** — создавайте, изменяйте, включайте/отключайте, удаляйте и просматривайте запланированные задачи в любое время

**Примеры из реальной жизни:**

- Ежедневная генерация отчёта о погоде
- Еженедельная агрегация данных о продажах
- Ежемесячная организация файлов резервных копий
- Пользовательские уведомления-напоминания

</details>

---

### **Панель предпросмотра — мгновенный просмотр результатов, созданных ИИ**

_10+ форматов: PDF, Word, Excel, PPT, код, Markdown, изображения, HTML, Diff — просматривайте всё без переключения приложений._

- **Мгновенный предпросмотр** — после генерации файлов агентом просматривайте результаты сразу, без переключения приложений
- **Отслеживание в реальном времени + редактирование** — автоматически отслеживает изменения файлов; поддерживает живое редактирование Markdown, кода, HTML
- **Поддержка нескольких вкладок** — открывайте несколько файлов одновременно, каждый в собственной вкладке
- **История версий** — просматривайте и восстанавливайте предыдущие версии файлов (на базе Git)

<p align="center">
  <img src="./resources/preview.gif" alt="Preview Panel" width="800">
</p>

<details>
<summary><strong>🔍 Полный список поддерживаемых форматов ▶️</strong></summary>

<br>

**Поддерживаемые форматы предпросмотра:**

- **Документы** — PDF, Word (`.doc`, `.docx`, `.odt`), Excel (`.xls`, `.xlsx`, `.ods`, `.csv`), PowerPoint (`.ppt`, `.pptx`, `.odp`)
- **Код** — JavaScript, TypeScript, Python, Java, Go, Rust, C/C++, CSS, JSON, XML, YAML, Shell-скрипты и 30+ языков программирования
- **Разметка** — Markdown (`.md`, `.markdown`), HTML (`.html`, `.htm`)
- **Изображения** — PNG, JPG, JPEG, GIF, SVG, WebP, BMP, ICO, TIFF, AVIF
- **Другое** — Diff-файлы (`.diff`, `.patch`)

</details>

---

### **Умное управление файлами — автоматические операции с файлами**

_Пакетное переименование, автоматическая организация, умная классификация, объединение файлов — Cowork-агент справится с этим за вас._

<p align="center">
  <img src="./resources/aionui sort file 2.gif" alt="Smart File Management" width="800">
</p>

<details>
<summary><strong>🔍 Подробности о функциях управления файлами ▶️</strong></summary>

<br>

- **Автоорганизация** — интеллектуальное определение содержимого и автоклассификация, поддержание порядка в папках
- **Эффективная пакетная обработка** — переименование в один клик, объединение файлов, прощайте, рутинные задачи
- **Автоматическое выполнение** — ИИ-агенты могут самостоятельно выполнять операции с файлами, читать/записывать файлы и завершать задачи автоматически

**Примеры использования:**

- Организация захламлённых папок загрузок по типу файлов
- Пакетное переименование фотографий с осмысленными именами
- Объединение нескольких документов в один
- Автоклассификация файлов по содержимому

</details>

---

### **Обработка данных Excel — анализ на базе ИИ**

_Глубокий анализ данных Excel, автоматическое美化 отчётов и генерация выводов — всё на базе ИИ-агентов._

<p align="center">
  <img src="./resources/generate_xlsx.gif" alt="Excel Processing" width="800">
</p>

<details>
<summary><strong>🔍 Функции обработки Excel ▶️</strong></summary>

<br>

- **Умный анализ** — ИИ анализирует паттерны данных и генерирует выводы
- **Автоформатирование** — автоматическое美化 Excel-отчётов с профессиональным оформлением
- **Трансформация данных** — конвертация, объединение и реструктуризация данных командами на естественном языке
- **Генерация отчётов** — создание комплексных отчётов из сырых данных

**Примеры использования:**

- Анализ данных о продажах и генерация ежемесячных отчётов
- Очистка и форматирование захламлённых Excel-файлов
- Умное объединение нескольких таблиц
- Создание визуализаций данных и диаграмм

</details>

---

### **Генерация и редактирование изображений на базе ИИ**

_Интеллектуальная генерация, редактирование и распознавание изображений на базе Gemini_

<p align="center">

  <img src="./resources/Image_Generation.gif" alt="AI Image Generation" width="800">
</p>

<details>
<summary><strong>🔍 Функции генерации изображений ▶️</strong></summary>

<br>

- **Текст в изображение** — генерация изображений из описаний на естественном языке
- **Редактирование изображений** — модификация и улучшение существующих изображений
- **Распознавание изображений** — анализ и описание содержимого изображений
- **Пакетная обработка** — генерация нескольких изображений одновременно

</details>

> [Руководство по конфигурации модели генерации изображений](https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide)

---

### **Генерация документов — PPT, Word, Markdown**

_Автоматическая генерация профессиональных документов — презентаций, отчётов и многого другого — с помощью ИИ-агентов._

<p align="center">
  <img src="./resources/file_generation_preview.png" alt="Document Generation" width="800">
</p>

<details>
<summary><strong>🔍 Функции генерации документов ▶️</strong></summary>

<br>

- **PPTX Generator** — создание профессиональных презентаций из плана или темы
- **Документы Word** — генерация форматированных Word-документов с правильной структурой
- **Markdown-файлы** — создание и форматирование Markdown-документов для документации
- **Конвертация PDF** — конвертация между различными форматами документов

**Примеры использования:**

- Генерация квартальных бизнес-презентаций
- Создание технической документации
- Конвертация PDF в редактируемые форматы
- Автоформатирование научных статей

</details>

### **Персонализация интерфейса**

_Настройте с помощью собственного CSS-кода, сделайте интерфейс под свои предпочтения_

<p align="center">
  <img src="./resources/css with skin.gif" alt="CSS Customization" width="800">
</p>

- ✅ **Полная настраиваемость** — свободно настраивайте цвета, стили, макет интерфейса через CSS-код, создайте свой уникальный опыт

---

### **Многозадачная параллельная обработка**

_Открывайте несколько разговоров, задачи не перемешиваются, независимая память, двойная эффективность_

<p align="center">
  <img src="./resources/multichat-side-by-side.gif" alt="Multi-Task Parallel" width="800">
</p>

- ✅ **Независимый контекст** — каждый разговор сохраняет собственный контекст и историю
- ✅ **Параллельное выполнение** — запуск нескольких задач одновременно без помех
- ✅ **Умное управление** — лёгкое переключение между разговорами с визуальными индикаторами

---

## 🤔 Почему AionUi вместо Claude Cowork?

<details>
<summary><strong>Нажмите для подробного сравнения</strong></summary>

<br>

AionUi — это **бесплатный мультиагентный рабочий стол с открытым исходным кодом**. По сравнению с Claude Cowork, который работает только на macOS и привязан к Claude, AionUi — его кроссплатформенная улучшенная версия со всеми моделями.

| Параметр          | Claude Cowork  | AionUi                                              |
| :---------------- | :------------- | :-------------------------------------------------- |
| ОС                | Только macOS   | macOS / Windows / Linux                             |
| Поддержка моделей | Только Claude  | Gemini, Claude, DeepSeek, OpenAI, Ollama, ...       |
| Взаимодействие    | Десктопный GUI | Десктопный GUI + WebUI + Telegram / Lark / DingTalk |
| Автоматизация     | Только вручную | Cron запланированные задачи — 24/7 без присмотра    |
| Стоимость         | $100/месяц     | Бесплатно и с открытым исходным кодом               |

Глубокая поддержка сценариев ИИ-офиса:

- **Управление файлами**: интеллектуальная организация локальных папок и пакетное переименование в один клик.
- **Обработка данных**: глубокий анализ и автоматическое美化 Excel-отчётов.
- **Генерация документов**: автоматическое написание и форматирование PPT, Word и Markdown-документов.
- **Мгновенный предпросмотр**: встроенные панели предпросмотра 10+ форматов, результаты ИИ-сотрудничества видны сразу.

</details>

---

## Быстрые вопросы и ответы

<details>
<summary><strong>В: Нужно ли сначала устанавливать Gemini CLI или Claude Code?</strong></summary>
О: <strong>Нет.</strong> AionUi имеет встроенный ИИ-агент, который работает сразу после установки. Просто войдите через Google или введите любой API-ключ. Если у вас также установлены CLI-инструменты, такие как Claude Code или Gemini CLI, AionUi автоматически обнаружит и интегрирует их для ещё больших возможностей.
</details>

<details>
<summary><strong>В: Что я могу делать с AionUi?</strong></summary>
О: AionUi — это ваше <strong>приватное Cowork-рабочее пространство</strong>. Встроенный агент может пакетно организовывать папки, обрабатывать данные Excel, генерировать документы, искать в интернете и генерировать изображения. С мультиагентным режимом вы также можете использовать Claude Code, Codex и другие мощные CLI-агенты через один и тот же интерфейс.
</details>

<details>
<summary><strong>В: Это бесплатно?</strong></summary>
О: AionUi полностью бесплатен и имеет открытый исходный код. Вы можете войти через Google, чтобы бесплатно использовать Gemini, или использовать API-ключи любого провайдера по вашему выбору.
</details>

<details>
<summary><strong>В: Мои данные в безопасности?</strong></summary>
О: Все данные хранятся локально в базе данных SQLite. Ничего не загружается на какие-либо серверы.
</details>

---

## Посмотрите, как люди используют AionUi

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
  <em>WorldofAI (200 тыс. подписчиков)</em> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <em>Julian Goldie SEO (318 тыс. подписчиков)</em>
</p>

### Статьи сообщества

- [Бесплатный Cowork с открытым исходным кодом, интеграция всех моделей + автономные операции с файлами](https://mp.weixin.qq.com/s/F3f-CCsVPaK3lK00jXhOOg) — Open Source AI Project Landing
- [Как сделать так, чтобы обычные люди использовали Claude Code как приложение](https://mp.weixin.qq.com/s/TsMojSbkUUFvsd-HQCazZg) — Lazy Cat Loves Fishing
- [5500 звёзд: как открытый исходный код ломает защитный ров ИИ-инструмента Anthropic](https://mp.weixin.qq.com/s/saEk49cYV6MqBgw19Lw6Gw) — AI Silicon Moment

> **Сняли видео об AionUi?** [Сообщите нам в X](https://x.com/AionUi), и мы разместим его здесь!

---

## 🚀 Быстрый старт

### Системные требования

- **macOS**: 10.15 или выше
- **Windows**: Windows 10 или выше
- **Linux**: Ubuntu 18.04+ / Debian 10+ / Fedora 32+
- **Память**: рекомендуется 4 ГБ+
- **Хранилище**: 500 МБ+ свободного места

### Установка

<p>
  <a href="https://github.com/iOfficeAI/AionUi/releases">
    <img src="https://img.shields.io/badge/Download-Latest%20Release-32CD32?style=for-the-badge&logo=github&logoColor=white" alt="Download Latest Release" height="50">
  </a>
</p>

```bash
# macOS через Homebrew
brew install aionui
```

### Начало работы за 3 шага

1. **Установите** AionUi
2. **Войдите** через аккаунт Google или введите любой API-ключ
3. **Начните Cowork** — встроенный ИИ-агент готов к работе

### 📖 Подробные руководства

<details>
<summary><strong>📖 Развернуть для просмотра полного руководства по использованию</strong></summary>

<br>

**🚀 Быстрый старт**

- [📖 Полное руководство по установке](https://github.com/iOfficeAI/AionUi/wiki/Getting-Started) — подробные шаги от загрузки до настройки
- [⚙️ Руководство по настройке LLM](https://github.com/iOfficeAI/AionUi/wiki/LLM-Configuration) — настройка ИИ-моделей на множестве платформ
- [🤖 Настройка мультиагентного режима](https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup) — интеграция ИИ-агентов терминала
- [🔌 Настройка MCP-инструментов](https://github.com/iOfficeAI/AionUi/wiki/MCP-Configuration-Guide) — настройка сервера Model Context Protocol
- [🌐 Руководство по настройке WebUI](https://github.com/iOfficeAI/AionUi/wiki/WebUI-Configuration-Guide) — полное руководство по настройке WebUI

**🎯 Сценарии использования**

- [📁 Управление файлами](https://github.com/iOfficeAI/AionUi/wiki/file-management) — умная организация файлов
- [📊 Обработка Excel](https://github.com/iOfficeAI/AionUi/wiki/excel-processing) — обработка данных на базе ИИ
- [🎨 Генерация изображений](https://github.com/iOfficeAI/AionUi/wiki/AionUi-Image-Generation-Tool-Model-Configuration-Guide) — создание изображений на базе ИИ
- [📚 Больше сценариев](https://github.com/iOfficeAI/AionUi/wiki/Use-Cases-Overview)

**❓ Поддержка и помощь**

- [❓ FAQ](https://github.com/iOfficeAI/AionUi/wiki/FAQ) — вопросы и устранение неполадок
- [🔧 Руководства по настройке и использованию](https://github.com/iOfficeAI/AionUi/wiki/Configuration-Guides) — полная документация по настройке

</details>

---

## 💬 Сообщество и поддержка

**Ваши идеи важны!** Мы ценим каждое предложение и отзыв.

<p align="center">
  <a href="https://x.com/AionUi" target="_blank">
    <img src="./resources/contactus-x.png" alt="Contact Us on X" width="600">
  </a>
</p>

- [GitHub Discussions](https://github.com/iOfficeAI/AionUi/discussions) — делитесь идеями и обменивайтесь советами
- [Сообщить о проблемах](https://github.com/iOfficeAI/AionUi/issues) — ошибки и запросы функций
- [Обновления релизов](https://github.com/iOfficeAI/AionUi/releases) — получите последнюю версию
- [Сообщество Discord](https://discord.gg/2QAwJn7Egx) — англоязычное сообщество
- [Группа WeChat](./resources/wx-6.png) — русскоязычное сообщество

### Вклад в проект

1. Сделайте форк этого проекта
2. Создайте ветку функции (`git checkout -b feature/AmazingFeature`)
3. Зафиксируйте изменения (`git commit -m 'Add some AmazingFeature'`)
4. Отправьте в ветку (`git push origin feature/AmazingFeature`)
5. Откройте Pull Request

---

## Лицензия

Этот проект лицензирован на условиях [Apache-2.0](LICENSE).

---

## Участники

<p align="center">
  <a href="https://github.com/iOfficeAI/AionUi/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=iOfficeAI/AionUi&max=50" alt="Contributors" />
  </a>
</p>

## История звёзд

<p align="center">
  <a href="https://www.star-history.com/#iOfficeAI/aionui&Date" target="_blank">
    <img src="https://api.star-history.com/svg?repos=iOfficeAI/aionui&type=Date" alt="Star History" width="600">
  </a>
</p>

<div align="center">

**Если нравится, поставьте нам звезду**

[Сообщить об ошибке](https://github.com/iOfficeAI/AionUi/issues) · [Запросить функцию](https://github.com/iOfficeAI/AionUi/issues)

</div>
