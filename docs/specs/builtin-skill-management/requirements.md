# 内置 Skill 管理

## 1. 背景

AionUi 支持 skill 系统，agent 可以加载 skill（以 SKILL.md 文件存储的指令）来扩展能力。Skill 分为三类：

- **内置自动注入 skill**（`_builtin/` 目录）：每个会话自动加载（如 `cron`、`office-cli`）
- **捆绑 skill**：随应用发布，用户可在助手预设中选择启用
- **用户自定义 skill**：用户在 skills 目录中自行创建

此前，内置 skill 始终自动注入，用户无法控制。`AcpSkillManager` 单例缓存已发现的 skill，没有按会话排除特定内置 skill 的机制。这导致以下问题：

1. 用户希望禁用某些内置 skill（如禁用 `cron` 以防止嵌套定时任务创建）
2. 助手预设需要不同的内置 skill 配置
3. UI 无法展示当前会话实际加载了哪些 skill

## 2. 需求定义

### 2.1 用户侧功能

#### ConversationSkillsIndicator（会话 Skill 指示器）

- 在会话头部显示一个胶囊形徽章，展示已加载 skill 数量
- 点击徽章弹出 popover，列出所有已加载 skill 名称
- 列表中每个 skill 可点击，跳转至 `/settings/skills-hub?highlight=skillName`
- 目标 SkillsHubSettings 页面滚动到对应 skill 卡片并临时高亮（2 秒）

#### GuidActionRow Skill 开关

- 当存在内置自动注入 skill 时，在 "+" 下拉菜单中显示 `Menu.SubMenu`
- 每个内置 skill 显示一个复选框（选中 = 启用，取消 = 排除）
- 显示启用/总数计数：`settings.builtinSkills (activeCount/totalCount)`
- 用户的开关状态通过 `guidDisabledBuiltinSkills` state 持久化到会话创建流程

#### CronJobManager 可见性控制

- 接受 `hasCronSkill?: boolean` prop（默认 `true`）
- 当 `hasCronSkill=false` 且无定时任务且非加载中：返回 `null`（完全隐藏）
- 当存在定时任务时：无论 `hasCronSkill` 值如何，始终显示
- 父组件（`ChatConversation`）从 `conversation.extra.loadedSkills` 读取以判断 `hasCronSkill`

### 2.2 数据流

#### loadedSkills 持久化

创建会话时，实际发现的 skill（经排除过滤后）以 `Array<{ name: string; description: string }>` 的形式持久化到 `conversation.extra.loadedSkills`。该快照是 UI 组件的唯一数据源。

三条注入路径分别持久化 `loadedSkills`：

| 路径           | 文件                              | 机制                                                              |
| -------------- | --------------------------------- | ----------------------------------------------------------------- |
| IPC 会话创建   | `conversationBridge.ts`           | `conversationBridge.createConversation` 从 `AcpSkillManager` 读取 |
| 定时任务执行器 | `WorkerTaskManagerJobExecutor.ts` | 绕过 IPC，直接调用 `AcpSkillManager`                              |
| Prompt 注入    | `agentUtils.ts`                   | `prepareFirstMessageWithSkillsIndex` 注入 agent prompt            |

#### excludeBuiltinSkills 流转

```
GuidPage（用户切换复选框）
  → guidDisabledBuiltinSkills state
    → useGuidSend：解析 excludeBuiltinSkills
      → conversation.create IPC：extra.excludeBuiltinSkills
        → conversationBridge：过滤 AcpSkillManager.getSkillsIndex()
          → conversation.extra.loadedSkills（持久化快照）
```

优先级：当 `guidDisabledBuiltinSkills.length > 0` 时使用用户手动选择；否则回退到 `resolveDisabledBuiltinSkills(agentInfo)` 读取助手预设配置。

### 2.3 Bug 修复

#### AcpSkillManager 单例缓存问题

**问题**：`AcpSkillManager` 是以 `enabledSkills` 为 key 的单例。`discoverAutoSkills()` 方法在首次调用时设置 `autoInitialized=true`。后续使用不同 `excludeBuiltinSkills` 的调用被静默忽略——缓存的 `autoSkills` map 仍包含所有内置 skill。

**方案**：在三个消费方站点应用查询后过滤，而非修改单例：

```typescript
const excludeSet = new Set(excludeBuiltinSkills ?? []);
const loadedSkills = skillManager.getSkillsIndex().filter((s) => !excludeSet.has(s.name));
```

选择此方案而非修改单例的原因：

- 单例缓存在多个会话间共享
- 修改 `autoSkills` map 会影响其他并发会话
- 查询后过滤是无状态的，对所有调用方都安全

#### 定时任务执行器缺失 loadedSkills

**问题**：`WorkerTaskManagerJobExecutor.buildConversationForJob()` 通过 `conversationService.createConversation()` 直接创建会话，绕过了 `conversationBridge` IPC 路径。这导致定时任务创建的会话 `extra` 字段中没有 `loadedSkills`。

**方案**：在执行器方法中直接添加 `AcpSkillManager` 发现 + `loadedSkills` 持久化逻辑，使用相同的 `excludeSet` 过滤模式。

## 3. 修改文件

### 渲染进程（UI）

| 文件                                                                         | 变更                                                                    |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/renderer/pages/conversation/components/ConversationSkillsIndicator.tsx` | 新组件：skill 徽章 + popover + 导航                                     |
| `src/renderer/pages/conversation/components/ChatConversation.tsx`            | 新增 `hasLoadedSkill()` 辅助函数，传递 `hasCronSkill` 给 CronJobManager |
| `src/renderer/pages/settings/SkillsHubSettings.tsx`                          | 新增 `?highlight=` 搜索参数处理，滚动 + 高亮                            |
| `src/renderer/pages/cron/components/CronJobManager.tsx`                      | 新增 `hasCronSkill` prop，条件性返回 null                               |
| `src/renderer/pages/guid/components/GuidActionRow.tsx`                       | 新增 skill 开关 SubMenu + 复选框                                        |

### 主进程（Backend）

| 文件                                                        | 变更                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/process/bridge/conversationBridge.ts`                  | 新增 `excludeSet` 过滤 `loadedSkills` 快照                       |
| `src/process/task/agentUtils.ts`                            | 在 `prepareFirstMessageWithSkillsIndex` 中新增 `excludeSet` 过滤 |
| `src/process/services/cron/WorkerTaskManagerJobExecutor.ts` | 为定时任务创建的会话新增 `loadedSkills` 持久化                   |

### 测试

| 文件                                                           | 测试数 | 覆盖范围                        |
| -------------------------------------------------------------- | ------ | ------------------------------- |
| `tests/unit/renderer/ConversationSkillsIndicator.dom.test.tsx` | 7      | null 返回、计数、导航、URL 编码 |
| `tests/unit/renderer/CronJobManager.dom.test.tsx`              | 7      | hasCronSkill 可见性控制         |
| `tests/unit/renderer/GuidActionRow.dom.test.tsx`               | +2     | skill 数量显示、开关回调        |
| `tests/unit/useGuidSend.dom.test.ts`                           | +2     | excludeBuiltinSkills 优先级逻辑 |

## 4. 设计决策

### 为什么用查询后过滤而不是修复单例？

`AcpSkillManager` 单例在主进程中被所有会话共享。修改 `autoSkills` 来反映某个会话的 `excludeBuiltinSkills` 会破坏其他会话的缓存。查询后过滤是无状态的，对所有调用方都正确。

### 为什么 `hasAnySkills()` 不需要修改

`hasAnySkills()` 是一个快速判断——检查是否存在任何 skill（内置 + 可选 + 扩展）。即使部分内置 skill 被排除，只要还有其他 skill，它返回 `true` 是正确的。后续的 `getSkillsIndex().filter()` 负责精确排除。所有 skill 都被排除的边界情况由下游的 `skillsIndex.length > 0` 检查拦截。

### 为什么定时任务要排除自身

定时任务的 `excludeBuiltinSkills: ['cron']` 防止定时任务执行器将 cron skill 注入到定时任务创建的会话中。否则，定时任务触发的会话可能自身创建嵌套定时任务，导致无限循环。
