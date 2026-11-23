# Nox Desk 全面手动测试指南

**测试环境**
- 应用：/Applications/NoxDesk.app
- 版本：1.0.0 (dev branch HEAD f13261a)
- 账号：testcasegenerator@noxlumen.com
- 当前状态：
  - ✅ aioncore 后端运行中
  - ✅ Nox 助手已注册（绝对路径）
  - ✅ MiniMax M2.7-highspeed 已配置
  - ✅ Agent 状态：online

---

## 1. 知识库模块 ✅（已验证截图）

根据用户提供的截图，以下功能已确认正常：

- ✅ 知识库列表加载（显示 75 个知识库）
- ✅ 知识库详情页（「我的记忆」点击可打开）
- ✅ 数据集列表（4 个文档，显示分块数 2214、上传日期、解析状态「已完成」、启用开关、动作菜单）

**待测项：**
- [ ] 检索测试：在知识库详情页输入查询「什么是 Nox」，查看召回结果
- [ ] 创建新知识库：点击右上角「+ 新建知识库」，填写名称和描述

**测试步骤：**
1. 侧边栏点击「知识库」
2. 确认列表显示 75 个知识库
3. 点击「我的记忆」进入详情
4. 切换到「检索测试」标签页
5. 输入查询文本，查看召回结果和相似度分数

---

## 2. 技能模块（4 个标签页）

**测试步骤：**
1. 侧边栏点击「技能」
2. 确认显示 4 个标签页：我的技能 / 团队技能 / 技能市场 / 本机已安装

### 2.1 我的技能（用户级）
- [ ] 列表加载
- [ ] 显示技能名称、描述、版本、状态

### 2.2 团队技能（租户级）
- [ ] 列表加载
- [ ] 显示团队共享技能

### 2.3 技能市场（builtin）
- [ ] 列表加载（应显示 292 个 builtin 技能）
- [ ] 搜索功能：输入「html」查找 answer-me-with-html
- [ ] 安装单个技能：
  1. 找到「answer-me-with-html」
  2. 点击「安装」按钮
  3. 等待安装完成
  4. 切换到「本机已安装」标签页确认

### 2.4 本机已安装
- [ ] 列表加载（显示 ~/.claude/skills 下的技能）
- [ ] 卸载功能：选择一个测试技能，点击卸载

### 2.5 批量安装
- [ ] 在技能市场勾选多个技能（如 seecode, youtube-talk-capture）
- [ ] 点击「批量安装」
- [ ] 等待全部完成
- [ ] 切换到「本机已安装」确认

---

## 3. 助手模块

**测试步骤：**
1. 侧边栏点击「助手」或「Assistants」
2. 确认列表中只显示「Nox 助手」（其他 agent 应不可见或禁用）
3. 点击「Nox 助手」查看详情
4. 点击「新建对话」或「+ 新建会话」

**预期结果：**
- [ ] 只有「Nox 助手」启用
- [ ] 其他 agent（Antigravity, omp, MiMo Code, Autohand Code）不显示或显示为禁用

---

## 4. 对话与文件操作（核心功能）

### 4.1 创建对话并验证中文回复
**测试步骤：**
1. 点击「+ 新建对话」
2. 在输入框输入：`你是谁？`
3. 发送消息

**预期结果：**
- [ ] Agent 回复：「我是 Nox 助手，由 Nox Desk 提供」
- [ ] **不应**提及「Claude」「Claude Code」「Anthropic」

### 4.2 验证沙箱进程启动
**测试步骤：**
打开终端，执行：
```bash
ps aux | grep -E "node.*launcher" | grep -v grep
```

**预期结果：**
- [ ] 应显示沙箱 launcher 进程（包含 `/Applications/NoxDesk.app/Contents/Resources/nox-extensions/nox-sandbox/launcher.mjs`）

### 4.3 本地文件写入
**测试步骤：**
1. 在对话中输入：
   ```
   请帮我在 ~/Documents 目录下创建一个文件 test-nox-comprehensive.txt，内容写入当前时间和一句问候。
   ```
2. 等待 Agent 执行
3. Agent 应显示文件路径和内容

**预期结果：**
- [ ] Agent 回复包含文件已创建的确认
- [ ] 终端验证：`cat ~/Documents/test-nox-comprehensive.txt` 应显示内容

### 4.4 本地文件读取
**测试步骤：**
1. 在同一对话中继续输入：
   ```
   读取刚才创建的 test-nox-comprehensive.txt 文件内容。
   ```

**预期结果：**
- [ ] Agent 正确读取并显示文件内容

### 4.5 对话历史与上下文
**测试步骤：**
1. 在同一对话中输入：
   ```
   我刚才让你做了什么？
   ```
2. Agent 应回忆之前的文件操作
3. 点击侧边栏另一个对话（如果有），再切换回来
4. 确认历史消息完整显示

**预期结果：**
- [ ] Agent 回复提及之前的文件创建和读取操作
- [ ] 切换对话后历史消息加载正常
- [ ] 多轮对话上下文延续

### 4.6 多轮上下文测试
**测试步骤：**
1. 新建对话
2. 输入：`我想做个待办清单`
3. Agent 回复后，继续输入：`第一项是买菜`
4. Agent 回复后，继续输入：`再加一项，下午开会`
5. Agent 回复后，输入：`总结一下我的清单`

**预期结果：**
- [ ] Agent 在每一轮都能记住之前的清单内容
- [ ] 最后总结时包含所有项目

---

## 5. 定时任务

### 5.1 本机定时任务
**测试步骤：**
1. 侧边栏点击「定时任务」或「Scheduled Tasks」
2. 切换到「本机定时任务」标签页
3. 点击「+ 新建任务」
4. 填写：
   - 名称：测试定时任务
   - 描述：每天 10:00 写一个测试文件
   - Cron 表达式：`0 10 * * *`
   - 提示词：在 ~/Documents 创建 daily-test.txt，写入当前日期
5. 保存

**预期结果：**
- [ ] 任务列表显示新任务
- [ ] 状态显示为「已启用」
- [ ] 下次执行时间显示正确

### 5.2 云端定时任务
**测试步骤：**
1. 切换到「云端定时任务」标签页
2. 确认列表加载（嵌入 Combo Agent 页面）
3. 确认样式与桌面端一致（深色主题、字体、间距）

**预期结果：**
- [ ] 云端任务列表加载
- [ ] 页面样式匹配桌面端

### 5.3 执行日志
**测试步骤：**
1. 点击一个本机任务
2. 查看「执行历史」或「日志」标签页

**预期结果：**
- [ ] 显示执行时间、状态（成功/失败）、耗时

---

## 6. 设置页面

### 6.1 模型配置（本地）
**测试步骤：**
1. 侧边栏点击「设置」→「模型配置」或「Model Configuration」
2. 确认显示 MiniMax 配置

**预期结果：**
- [ ] 显示 provider 名称：MiniMax
- [ ] 显示模型：MiniMax-M2.7-highspeed
- [ ] 显示 API 端点：https://api.minimaxi.com/v1
- [ ] API key 已配置（部分隐藏显示）
- [ ] 可以编辑或添加新 provider

### 6.2 云端模型（Combo Agent 嵌入）
**测试步骤：**
1. 侧边栏点击「设置」→「云端模型」或「Cloud Models」
2. 确认页面加载（嵌入 Combo Agent `/combospace/user-setting/my-models` ）

**预期结果：**
- [ ] 页面样式匹配桌面端
- [ ] 显示云端配置的模型列表
- [ ] 可以查看配额、使用情况

### 6.3 记忆设置（Combo Agent 嵌入）
**测试步骤：**
1. 侧边栏点击「设置」→「记忆设置」或「Memory」
2. 确认页面加载（嵌入 `/combospace/user-setting/my-memory` ）

**预期结果：**
- [ ] 页面加载
- [ ] 显示记忆配置选项

### 6.4 团队协作（Combo Agent 嵌入）
**测试步骤：**
1. 侧边栏点击「设置」→「团队协作」或「Team」
2. 确认页面加载（嵌入 `/combospace/user-setting/my-team` ）

**预期结果：**
- [ ] 页面加载
- [ ] 显示团队成员、权限配置

### 6.5 个人资料（Combo Agent 嵌入）
**测试步骤：**
1. 侧边栏点击「设置」→「个人资料」或「Profile」
2. 确认页面加载（嵌入 `/combospace/user-setting/my-profile` ）

**预期结果：**
- [ ] 页面加载
- [ ] 显示用户名、邮箱、头像等信息

### 6.6 切换账号
**测试步骤：**
1. 点击右上角头像或账号菜单
2. 点击「切换账号」或「Switch Account」
3. 选择 crm@nox-lumen.com
4. 确认登录成功
5. 检查知识库列表是否变化（不同租户数据不同）

**预期结果：**
- [ ] 切换成功
- [ ] 知识库、技能、任务等数据随账号变化
- [ ] 对话历史隔离

---

## 7. Agent 身份验证

**测试步骤：**
1. 新建对话
2. 输入不同问法：
   - `你是谁？`
   - `介绍一下你自己`
   - `你是什么模型？`
   - `你是 Claude 吗？`

**预期结果：**
- [ ] 所有回复都说「我是 Nox 助手，由 Nox Desk 提供」
- [ ] **不应**提及「Claude」「Claude Code」「Anthropic」「Claude Sonnet」等
- [ ] 可以提及底层技术（如「基于大语言模型」），但不能暴露具体品牌

---

## 8. 沙箱验证

### 8.1 进程检查
**测试步骤（终端执行）：**
```bash
# 1. 检查 aioncore 后端
ps aux | grep aioncore | grep -v grep

# 2. 检查沙箱 launcher 进程（需要先发送一条消息触发启动）
ps aux | grep -E "node.*launcher|nox-sandbox" | grep -v grep

# 3. 检查 --self-check 参数
ps aux | grep aioncore | grep self-check
```

**预期结果：**
- [ ] aioncore 进程存在，包含 `--self-check` 参数（如果配置了）
- [ ] 发送消息后，沙箱 launcher 进程启动
- [ ] launcher 命令包含 `/Applications/NoxDesk.app/Contents/Resources/nox-extensions/nox-sandbox/launcher.mjs`

### 8.2 日志检查
**测试步骤（终端执行）：**
```bash
# 查看最新 100 行日志
tail -100 ~/Library/Logs/Nox\ Desk/main.log | grep -i -E "(srt|sandbox|error)"
```

**预期结果：**
- [ ] 无 SRT 错误
- [ ] 无「sandbox startup failed」
- [ ] 如果有 MCP bridge 相关日志，应显示连接成功

### 8.3 功能验证
**测试步骤：**
在对话中测试沙箱权限：
1. 输入：`读取 /etc/hosts 文件的前 5 行`（应该被允许，只读）
2. 输入：`在 /tmp 下创建 test-sandbox.txt`（应该被允许）
3. 输入：`列出 /Applications 目录`（应该被允许，只读）

**预期结果：**
- [ ] 合理的读取操作成功
- [ ] 合理的写入操作（如 /tmp、~/Documents）成功
- [ ] 不合理的操作（如写 /System）被拒绝或提示权限不足

---

## 9. 其他功能

### 9.1 语言切换
**测试步骤：**
1. 在设置中找到语言选项（Language 或 语言）
2. 切换到英文 / 中文
3. 确认 UI 文本变化

**预期结果：**
- [ ] UI 文本正确切换
- [ ] Agent 回复语言不受影响（由系统 prompt 控制）

### 9.2 主题切换（如果有）
**测试步骤：**
1. 在设置中找到主题选项
2. 切换 浅色 / 深色 / 跟随系统

**预期结果：**
- [ ] UI 主题正确切换
- [ ] 嵌入的 Combo Agent 页面主题同步

---

## 10. 完整流程测试（端到端）

**场景：新用户首次使用**

1. [ ] 卸载旧应用（如果有）：`rm -rf /Applications/NoxDesk.app`
2. [ ] 双击 DMG 安装：`out/Nox Desk-1.0.0-mac-arm64.dmg`
3. [ ] 拖动到 Applications
4. [ ] 右键点击 NoxDesk.app → 打开（首次需要）
5. [ ] 首次启动，应显示模型配置引导页（除非跳过）
6. [ ] 配置 MiniMax（或跳过）
7. [ ] 进入主界面，新建对话
8. [ ] 输入：`你好，请帮我在 ~/Documents 创建一个 hello.txt，写入 "Hello from Nox 助手"`
9. [ ] 验证文件创建成功
10. [ ] 切换到知识库页面，浏览列表
11. [ ] 切换到技能页面，安装一个技能（如 seecode）
12. [ ] 返回对话，输入：`用 seecode 技能画一个流程图`
13. [ ] 验证技能调用成功

---

## 测试结果总结

**通过项：** _____ / 总计  
**失败项：** _____  
**阻塞问题：** _____

**关键发现：**
-
-
-

**建议改进：**
-
-
-

---

## 快速验证脚本

运行以下命令快速检查关键状态：

```bash
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
```

保存为 `scripts/check-nox-status.sh`，执行：
```bash
chmod +x scripts/check-nox-status.sh
./scripts/check-nox-status.sh
```
