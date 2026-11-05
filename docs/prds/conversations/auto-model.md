# Auto planner/worker model routing（aionrs）

> Issue: [#4143](https://github.com/iOfficeAI/AionUi/issues/4143)
> 范围：aionrs 会话模型选择、模型设置页槽位绑定、会话 `extra.auto_model`、发前 phase 路由
> 非目标：ACP 平台、助手 `mode: auto`（「记住上次」）、把 Auto 设成默认模型

---

## 背景与目标

长时间运行（如 7×24）的 aionrs agent 若全程使用高价模型，会在低价值回合上浪费成本。业界常见做法是 **Planner / Worker** 分槽：规划用强模型，执行磨信用便宜模型。

| 阶段                  | 能力                                                                                  | 用户可感知收益                   |
| --------------------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| **Phase 1**           | UI + 配置 + sticky Auto；选 Auto 时解析具体 `conversation.model` + `extra.auto_model` | 可配置槽位；会话标记为 Auto      |
| **Phase 2（本变更）** | 同 provider 热切换；发前按 phase 在 planner↔worker 间路由                             | 长跑可真正换模省成本（同供应商） |

**名词**：

- **Auto**：产品级「自动路由」入口，与助手权限模式 `mode: auto`（Remember last used）无关。
- **槽位**：`planner` / `worker` / `utility`，可固定绑定某模型，或设为 Automatic。
- **Sentinel**：选择器内部 id `__aionui_auto__::auto`，**永不**作为后端 model 上报。

---

## Phase 1（已落地）

见 F-AUTO-01 … F-AUTO-04：选择器 Auto、设置槽位、退出 Auto、失败提示。

---

## Phase 2

### (F-AUTO-05) 同 provider 热切换 [新增 · 依赖 AionCore]

**Core**：

- `PUT .../config-options/model` 对 aionrs 生效：调用 `AgentEngine::apply_config_update`，不 kill。
- 回合中切换 → `pending_next_turn`，下一 turn 发送前应用。
- `PATCH conversation.model` 在 **同一 `provider_id`** 时改为热切换；跨 provider 仍 kill+rebuild。

**验收**：

- [ ] 同 provider 换模后会话 MCP/上下文保留，无需重建 agent。
- [ ] 跨 provider 仍走重建路径。

### (F-AUTO-06) 发前 phase 路由 [新增 · AionUi]

**流程**（`AionrsSendBox.executeCommand`，Auto 开启时）：

1. `decideAutoModelPhase`：首 turn / replan 话术 / worker 连续失败 ≥2 → `planner`，否则 `worker`。
2. `resolveAutoModel(phase)` → 具体模型。
3. 同 provider → `setConfigOption('model')` + `conversation.update`（merge `extra.auto_model`）。
4. Pill：`Auto · {phase}/{model}`。

**验收**：

- [ ] 首条用户消息使用 planner 槽。
- [ ] 常规续写使用 worker 槽。
- [ ] 输入含 replan / 重新规划 等 → 回到 planner。
- [ ] Core 尚无热切换时：setConfigOption 失败可降级为仅 persist（可能 rebuild）。

### (F-AUTO-07) Utility / 细粒度分类器 [后续]

- Utility 槽与子代理默认路由。
- OpenSquilla 式 turn classifier。

---

## 实现备注

- UI：`packages/desktop/src/renderer/utils/autoModel/`
- Core：`AionrsAgentManager` config-option `model` + `ConversationService::update` same-provider 分支
- 勿把 Auto 做成全局默认模型；用户显式选择才启用。
- Phase 2 UI 需配对含热切换的 AionCore 版本才能完全免重建。
