#!/bin/bash
echo "=== Nox Desk 状态检查 ==="
echo ""
echo "1. 应用是否运行："
ps aux | grep -i noxdesk | grep -v grep | wc -l
echo ""
echo "2. aioncore 后端："
ps aux | grep aioncore | grep -v grep | head -1
echo ""
echo "3. 注册的 Agent："
sqlite3 ~/Library/Application\ Support/Nox\ Desk/aionui/aionui-backend.db \
  "SELECT name, enabled, last_check_status FROM agent_metadata WHERE enabled=1"
echo ""
echo "4. 模型配置："
cat ~/Library/Application\ Support/Nox\ Desk/nox/model-source.json
echo ""
echo "5. 测试文件："
ls -lh ~/Documents/test-nox*.txt 2>/dev/null || echo "无测试文件"
echo ""
echo "=== 检查完成 ==="
