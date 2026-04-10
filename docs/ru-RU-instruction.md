# 🇷🇺 AionUi — Инструкция по русифицированной версии

## Что русифицировано

| Компонент                               | Статус  |
| --------------------------------------- | ------- |
| Десктоп UI (меню, настройки, чат, трей) | ✅ 100% |
| Системные уведомления и ошибки          | ✅ 100% |
| Мобильное приложение                    | ✅ 100% |
| Промпты ассистентов (19 штук)           | ✅ 100% |
| Примеры расширений                      | ✅ 100% |
| Документация                            | ✅ 100% |

---

## Быстрый старт

### 1. Запуск в режиме разработки

```bash
cd /Users/lma/Documents/Project/AionUi

# Убедитесь что на правильной ветке
git branch
# Должно быть: * feature/ru-RU-full

# Запуск
bun run start
```

### 2. Сборка готового приложения

```bash
# macOS (.app / .dmg)
bun run dist:mac

# Windows (.exe)
bun run dist:win

# Linux (.deb / .rpm)
bun run dist:linux
```

Готовые сборки появятся в директории `dist/`.

---

## Обновление из официального репозитория

Когда в основном репозитории появляются обновления:

```bash
cd /Users/lma/Documents/Project/AionUi

# 1. Переключитесь на main
git checkout main

# 2. Заберите обновления
git pull origin main

# 3. Вернитесь на ветку с русификацией
git checkout feature/ru-RU-full

# 4. Влейте обновления из main
git rebase main

# Если будут конфликты — разрешите их, затем:
git rebase --continue

# 5. Переустановите зависимости
bun install

# 6. Запустите
bun run start
```

### Альтернатива: merge вместо rebase

```bash
git checkout feature/ru-RU-full
git merge main
```

---

## Переключение языка

### Автоматически

Если язык системы — русский (`ru-RU`), приложение запустится на русском автоматически.

### Вручную

1. Откройте **Настройки** (⚙️)
2. Перейдите в раздел **Язык**
3. Выберите **Русский**
4. Приложение перезагрузится с русским интерфейсом

---

## Структура русификации

```
src/renderer/services/i18n/locales/ru-RU/   ← UI десктопа (19 JSON файлов)
src/process/services/i18n/index.ts           ← Подключение ru-RU в main process
mobile/src/i18n/locales/ru-RU.json           ← Мобильное приложение
src/process/resources/assistant/*/           ← Промпты ассистентов (*.ru-RU.md)
examples/*/i18n/ru-RU/                       ← Переводы расширений
docs/readme/readme_ru.md                     ← Русская документация
```

---

## Если что-то на английском

### UI элементы на английском

Скорее всего это новые ключи, добавленные после русификации. Добавьте перевод:

```bash
# Найдите недостающие ключи
node scripts/check-i18n.js

# Отредактируйте нужный файл в:
# src/renderer/services/i18n/locales/ru-RU/
```

### Ошибки/уведомления на английском

Проверьте `src/process/bridge/updateBridge.ts` — возможно появились новые хардкод-строки.

### Ассистенты отвечают на английском

Это нормально — ассистенты отвечают на языке запроса. Напишите им на русском, и они ответят на русском.

---

## Полезные команды

```bash
# Проверка типов TypeScript
bunx tsc --noEmit

# Линтер (автофикс)
bun run lint:fix

# Форматирование кода
bun run format

# Валидация i18n
bun run i18n:types
node scripts/check-i18n.js

# Тесты
bun run test
```

---

## Решение проблем

### «Another instance is already running»

Закройте все окна AionUi и запустите заново:

```bash
pkill -f "AionUi" && bun run start
```

### База данных повреждена

Приложение автоматически создаст резервную копию и новую БД при запуске.
Для полного сброса:

```bash
rm -rf ~/Library/Application\ Support/AionUi-Dev/
bun run start
```

### Конфликты при git rebase

```bash
# Отменить rebase
git rebase --abort

# Или пропустить проблемный коммит
git rebase --skip

# После разрешения конфликтов
git add -A
git rebase --continue
```

---

## Контакты

- Официальный репозиторий: https://github.com/iOfficeAI/AionUi
- Discord: https://discord.gg/2QAwJn7Egx
- Сайт: https://www.aionui.com
