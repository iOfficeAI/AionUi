#!/bin/bash

# AionUi 版本发布脚本
# 使用方法: ./scripts/release.sh [patch|minor|major|prerelease]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 显示帮助信息
show_help() {
    echo "AionUi 版本发布脚本"
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

# 检查是否在正确的分支
current_branch=$(git branch --show-current)
if [ "$current_branch" != "main" ]; then
    echo -e "${YELLOW}警告: 当前不在 main 分支 (当前: $current_branch)${NC}"
    read -p "是否继续? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "已取消发布"
        exit 0
    fi
fi

# 检查工作区是否干净
if ! git diff-index --quiet HEAD --; then
    echo -e "${RED}错误: 工作区不干净，请先提交或储藏更改${NC}"
    exit 1
fi

# 拉取最新代码
echo -e "${GREEN}拉取最新代码...${NC}"
git pull origin main

# 运行测试
echo -e "${GREEN}运行代码质量检查...${NC}"
npm run lint
npm run format:check
npx tsc --noEmit

echo -e "${GREEN}代码质量检查通过!${NC}"

# 获取当前版本
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}当前版本: $CURRENT_VERSION${NC}"

# 升级版本
if [ "$VERSION_TYPE" = "prerelease" ]; then
    NEW_VERSION=$(npm version prerelease --preid=beta --no-git-tag-version)
else
    NEW_VERSION=$(npm version $VERSION_TYPE --no-git-tag-version)
fi

echo -e "${GREEN}新版本: $NEW_VERSION${NC}"

# 确认发布
echo -e "${YELLOW}准备发布版本 $NEW_VERSION${NC}"
read -p "确认发布? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    # 恢复版本号
    git checkout package.json package-lock.json
    echo "已取消发布"
    exit 0
fi

# 提交版本更改
echo -e "${GREEN}提交版本更改...${NC}"
git add package.json package-lock.json
git commit -m "chore: release $NEW_VERSION"

# 创建标签
echo -e "${GREEN}创建版本标签...${NC}"
git tag $NEW_VERSION

# 推送到远程
echo -e "${GREEN}推送到远程仓库...${NC}"
git push origin main --tags

echo -e "${GREEN}✅ 版本 $NEW_VERSION 发布成功!${NC}"
echo -e "${GREEN}GitHub Actions 将自动构建和发布应用程序${NC}"
echo -e "${GREEN}查看进度: https://github.com/iOfficeAI/AionUi/actions${NC}"