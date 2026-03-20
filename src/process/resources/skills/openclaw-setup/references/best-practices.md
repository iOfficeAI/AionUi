# OpenClaw 最佳实践和特殊场景

## 帮助用户时的最佳实践

1. **先诊断，再操作**：遇到问题先运行 `openclaw doctor`
2. **检查最新文档**：不确定时查阅 GitHub README 或官方文档
3. **保护隐私**：涉及 API 密钥、令牌等敏感信息时，引导用户自己处理
4. **分步引导**：复杂操作分步骤，每步确认成功后再继续
5. **提供备选方案**：如果一种方法不行，提供替代方案
6. **记录问题**：如果发现新问题或文档过时，提醒用户查看最新资料

## 特殊场景处理

### 场景 1：用户想创建特定功能的机器人

1. 确认 Gateway 已运行
2. 创建工作区或使用现有工作区
3. 配置 `AGENTS.md` 定义 Agent 行为
4. 配置 `TOOLS.md` 启用所需工具
5. 测试 Agent 响应

**示例：创建一个代码审查机器人**

```bash
# 1. 创建新的 Agent
openclaw agents add code-review --workspace ~/.openclaw/workspace-code-review

# 2. 编辑工作区的 AGENTS.md，定义代码审查逻辑
# 3. 配置 TOOLS.md，启用 GitHub 相关工具
# 4. 测试
openclaw agent --agent code-review --message "审查这个 PR: https://github.com/..."
```

### 场景 2：用户想执行自动化任务

1. 使用 `openclaw cron` 设置定时任务
2. 或使用 `openclaw webhooks` 接收外部触发
3. 配置 Agent 的 `AGENTS.md` 定义任务逻辑

**示例：每日报告任务**

```bash
# 设置每日 9 点执行
openclaw cron add "0 9 * * *" --message "生成每日报告" --agent main

# Agent 的 AGENTS.md 中定义报告生成逻辑
```

### 场景 3：多 Agent 路由

1. 创建多个 Agent：`openclaw agents add <name>`
2. 配置路由规则在 `openclaw.json` 中
3. 参考文档：https://docs.openclaw.ai/concepts/multi-agent

**示例配置：**

```json5
{
  agents: {
    list: [
      { id: 'work', workspace: '~/.openclaw/workspace-work' },
      { id: 'personal', workspace: '~/.openclaw/workspace-personal' },
    ],
  },
  bindings: [
    {
      match: { channel: 'slack', accountId: 'work-account' },
      agent: 'work',
    },
    {
      match: { channel: 'telegram' },
      agent: 'personal',
    },
  ],
}
```

### 场景 4：远程 Gateway

1. 在远程服务器上安装并运行 Gateway
2. 本地配置 `gateway.mode=remote`
3. 配置 `gateway.remote.url` 和认证
4. 使用 SSH 隧道或 Tailscale 连接

**示例：通过 SSH 隧道连接**

```bash
# 在本地机器上
ssh -N -L 18789:127.0.0.1:18789 user@remote-server

# 在另一个终端
openclaw gateway status  # 应该能连接到远程 Gateway
```

### 场景 5：工作区备份

工作区包含 Agent 的记忆和配置，建议定期备份：

```bash
# 使用 git 备份（推荐）
cd ~/.openclaw/workspace
git init
git add .
git commit -m "Backup workspace"

# 推送到私有仓库
git remote add origin git@github.com:username/openclaw-workspace.git
git push -u origin main
```

### 场景 6：迁移到新机器

1. 备份配置文件：`~/.openclaw/openclaw.json`
2. 备份工作区：`~/.openclaw/workspace`
3. 备份凭证（如果需要）：`~/.openclaw/credentials/`
4. 在新机器上安装 OpenClaw
5. 恢复配置和工作区
6. 运行 `openclaw doctor` 检查配置

## 安全建议

1. **配置文件权限**：确保 `~/.openclaw/openclaw.json` 权限为 600
2. **API 密钥**：使用环境变量或安全的密钥管理工具
3. **DM 策略**：默认使用 `pairing` 策略，避免开放 DM
4. **Gateway 认证**：即使本地运行，也建议设置 Gateway token
5. **定期更新**：保持 OpenClaw 和依赖项更新

## 性能优化

1. **会话清理**：定期清理旧会话以释放空间
2. **模型选择**：根据任务复杂度选择合适的模型
3. **工作区大小**：保持工作区文件精简，避免过大的记忆文件
4. **日志管理**：定期清理日志文件
