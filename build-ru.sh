#!/bin/bash
# AionRu Builder — автоматическая сборка AionUi с русской локализацией
# Использование: ./build-ru.sh [mac|win|linux]
# По умолчанию: mac

set -e

ARCH="${1:-mac}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================="
echo "  AionRu Builder — Русская сборка AionUi"
echo "========================================="
echo ""

# 1. Проверка зависимостей
echo "[1/6] Проверка зависимостей..."
if ! command -v bun &> /dev/null; then
    echo "❌ bun не установлен. Установите: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi
echo "✅ bun $(bun --version)"

# 2. Обновление из оф. репозитория
echo ""
echo "[2/6] Обновление из официального репозитория..."
git fetch origin main 2>/dev/null || {
    echo "⚠️ Не удалось получить обновления. Продолжаю с текущей версией..."
}

# 3. Переключение на ветку русификации
echo ""
echo "[3/6] Переключение на ветку русификации..."
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "feature/ru-RU-full" ]; then
    git checkout feature/ru-RU-full 2>/dev/null || {
        echo "❌ Ветка feature/ru-RU-full не найдена!"
        echo "   Убедитесь, что вы находитесь в директории с русифицированной версией."
        exit 1
    }
fi

# 4. Вливание обновлений из main
echo ""
echo "[4/6] Вливание обновлений из main..."
git rebase origin/main 2>/dev/null || {
    echo "⚠️ Конфликты при rebase! Разрешите их вручную, затем:"
    echo "   git add -A && git rebase --continue"
    echo "   После этого запустите скрипт снова."
    exit 1
}

# 5. Установка зависимостей
echo ""
echo "[5/6] Установка зависимостей..."
bun install 2>/dev/null

# 6. Сборка
echo ""
echo "[6/6] Сборка для $ARCH..."
case "$ARCH" in
    mac)
        echo "   → bun run dist:mac"
        bun run dist:mac
        echo ""
        echo "========================================="
        echo "  ✅ Сборка завершена!"
        echo "========================================="
        echo ""
        echo "  Файлы:"
        ls -lh out/*.dmg out/*.zip 2>/dev/null | awk '{print "  📦 " $NF " (" $5 ")"}'
        echo ""
        echo "  Установка: откройте .dmg и перетащите AionUi в Applications"
        ;;
    win)
        echo "   → bun run dist:win"
        bun run dist:win
        echo ""
        echo "  Файлы:"
        ls -lh out/*.exe 2>/dev/null | awk '{print "  📦 " $NF " (" $5 ")"}'
        ;;
    linux)
        echo "   → bun run dist:linux"
        bun run dist:linux
        echo ""
        echo "  Файлы:"
        ls -lh out/*.deb out/*.rpm out/*.AppImage 2>/dev/null | awk '{print "  📦 " $NF " (" $5 ")"}'
        ;;
    *)
        echo "❌ Неизвестная платформа: $ARCH"
        echo "   Используйте: mac, win или linux"
        exit 1
        ;;
esac

echo ""
echo "  Версия: $(node -p "require('./package.json').version")"
echo "  Ветка: $(git branch --show-current)"
echo "  Коммит: $(git rev-parse --short HEAD)"
echo "========================================="
