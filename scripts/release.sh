#!/bin/bash

# AionUi 版本号更新脚本
# 使用方法: ./scripts/release.sh [patch|minor|major|prerelease]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 显示帮助信息
show_help() {
    echo "AionUi 版本号更新脚本"
    echo ""
    echo "使用方法:"
    echo "  ./scripts/release.sh [VERSION_TYPE]"
    echo ""
    echo "VERSION_TYPE:"
    echo "  patch      - 修复版本 (1.0.0 -> 1.0.1)"
    echo "  minor      - 功能版本 (1.0.0 -> 1.1.0)"
    echo "  major      - 重大版本 (1.0.0 -> 2.0.0)"
    echo "  prerelease - 预发布版本 (1.0.0 -> 1.0.1-beta.0)"
    echo ""
    echo "示例:"
    echo "  ./scripts/release.sh patch"
    echo "  ./scripts/release.sh minor"
    echo ""
    echo "注意: 此脚本仅更新版本号，不会提交代码或创建标签"
}

# 检查参数
if [ $# -eq 0 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_help
    exit 0
fi

VERSION_TYPE=$1

# 验证版本类型
if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major|prerelease)$ ]]; then
    echo -e "${RED}错误: 无效的版本类型 '$VERSION_TYPE'${NC}"
    show_help
    exit 1
fi

# 确保在项目根目录
if [ ! -f "package.json" ]; then
    echo -e "${RED}错误: 未找到 package.json，请在项目根目录执行此脚本${NC}"
    exit 1
fi

# 获取当前版本
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}当前版本: $CURRENT_VERSION${NC}"

# 升级版本
echo -e "${GREEN}更新版本号...${NC}"
if [ "$VERSION_TYPE" = "prerelease" ]; then
    NEW_VERSION=$(npm version prerelease --preid=beta --no-git-tag-version)
else
    NEW_VERSION=$(npm version $VERSION_TYPE --no-git-tag-version)
fi

echo -e "${GREEN}✅ 版本号已更新: $CURRENT_VERSION -> $NEW_VERSION${NC}"
echo -e "${YELLOW}请手动提交 package.json 和 package-lock.json 的更改${NC}"