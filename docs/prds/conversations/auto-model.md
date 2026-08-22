# Auto planner/worker model routing（aionrs）

> Issue: [#4143](https://github.com/iOfficeAI/AionUi/issues/4143)
> 范围：aionrs 会话模型选择、模型设置页槽位绑定、会话 `extra.auto_model`
> 非目标：ACP 平台、助手 `mode: auto`（「记住上次」）、把 Auto 设成默认模型

---

## 背景与目标

长时间运行（如 7×24）的 aionrs agent 若全程使用高价模型，会在低价值回合上浪费成本。业界常见做法是 **Planner / Worker** 分槽：规划用强模型，执行磨信用便宜模型。

本 PRD 分两阶段：

| 阶段                 | 能力                                                                                                        | 用户可感知收益                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Phase 1（本 PR）** | UI + 配置 + sticky Auto；选 Auto 时用 **worker** 槽解析出具体 `conversation.model`，并写 `extra.auto_model` | 可配置槽位；会话标记为 Auto；为 Phase 2 打基础 |
| **Phase 2**          | Core 支持不重建 agent 切换模型；按 phase 在 planner/worker/utility 间切换                                   | 真正降低长跑成本                               |

**名词**：

- **Auto**：产品级「自动路由」入口，与助手权限模式 `mode: auto`（Remember last used）无关。
- **槽位**：`planner` / `worker` / `utility`，可固定绑定某模型，或设为 Automatic（按偏好打分）。
- **Sentinel**：选择器内部 id `__aionui_auto__::auto`，**永不**作为后端 model 上报。

---

## (F-AUTO-01) 选择器出现 Auto 入口 [新增]

**用户故事**：作为 aionrs 用户，我希望在模型列表顶部看到 Auto，而不是只能手选单个模型。

**正常流程**：

1. 打开 aionrs 对话或 Guid 新建页的模型选择器。
2. 列表顶部有 **Auto** 分组 / 选项。
3. 选中后 pill 显示 `Auto · {具体模型名}`。

**验收**：

- [ ] 桌面下拉与移动 action sheet 均有 Auto。
- [ ] 选中后 `conversation.model` 为具体 provider+model，不是 sentinel。
- [ ] `extra.auto_model.enabled === true`，且含 `last_resolved`。

---

## (F-AUTO-02) 设置页绑定槽位与偏好 [新增]

**用户故事**：作为用户，我希望在模型设置里为 planner/worker/utility 指定模型或 Automatic，并选择成本/质量偏好。

**验收**：

- [ ] 设置写入 `configService` 键 `autoModel`。
- [ ] Automatic 时按 preference 对可用模型打分选槽；固定绑定时校验模型仍存在，否则回落 Automatic。
- [ ] 文案说明 Phase 1 实际使用 worker 槽。

---

## (F-AUTO-03) 手动选模型退出 Auto [不变语义]

**验收**：

- [ ] 用户再选具体模型后 `auto_model.enabled` 为 false；pill 不再显示 Auto 前缀。

---

## (F-AUTO-04) 无可用模型时失败提示 [新增]

**验收**：

- [ ] resolve 失败时 Message 提示，不写入无效 model。

---

## Phase 2（后续，不在本 PR）

- Core：同一 agent 实例上切换 model，不 stop/rebuild。
- 按任务 phase 在 planner ↔ worker（及 utility）间切换，并更新 `extra.auto_model.phase` / `last_resolved`。
- 可选：turn 级启发式路由（更接近 Cursor / OpenSquilla）。

---

## 实现备注

- 解析逻辑：`packages/desktop/src/renderer/utils/autoModel/`
- 会话标记：`conversation.extra.auto_model`
- 勿把 Auto 做成全局默认模型；用户显式选择才启用。
