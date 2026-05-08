# WebUI 脱 Electron Playbook 复审补充

- **日期**: 2026-05-07
- **审查对象**:
  - [`docs/backend-migration/plans/2026-05-07-webui-decouple-team-playbook.md`](../plans/2026-05-07-webui-decouple-team-playbook.md)
- **目的**: 记录 playbook 最新修订后仍建议继续收紧的 2 个点

## 结论

这版 playbook 已经明显补强了此前的几个主要阻碍点:

- 权威来源优先级已明确
- 非 team-mode 执行映射已补齐
- 外部 `aionui-backend` release 预检已加入
- M7 / M8 / M9 的依赖关系已写清
- 本地门禁 / CI 门禁 / Release 门禁开始分层

目前剩下的 2 个问题已经不是方向性问题，而是**执行时序和失败诊断颗粒度**还可以再锁死。

## 问题 1: M8 / M9 的 Release 门禁与 executor 的实际职责时序仍有冲突

### 现状

playbook 前面写的是:

- 每个里程碑由 executor 自己跑完整 checkpoint
- handoff 由 team-lead 读完后决定是否接受

但在 checkpoint 章节里:

- M8 写成了“Release 强制门禁(本里程碑最终放行门禁, M9 消费)”
- M9 也写了“Release 强制门禁(真实 release 时,本里程碑最终放行门禁)”

与此同时，M9 的真实 release 验证又明确写成“由人类在真实 release 后触发，agent 不跑”。

### 风险

这会导致时序上的不一致:

1. 如果 release 只有在整条链结束、甚至人类合回之后才真正发生
2. 那么 executor 在 feature 分支阶段其实不可能完成这类 release 门禁
3. 但 playbook 文字上又把它写成“最终放行门禁”

这样会让协调者和 executor 对“什么时候算本里程碑完成”出现不同理解。

### 涉及位置

- [`2026-05-07-webui-decouple-team-playbook.md`](../plans/2026-05-07-webui-decouple-team-playbook.md) 第 705-711 行
- [`2026-05-07-webui-decouple-team-playbook.md`](../plans/2026-05-07-webui-decouple-team-playbook.md) 第 750-764 行
- [`2026-05-07-webui-decouple-team-playbook.md`](../plans/2026-05-07-webui-decouple-team-playbook.md) 第 765-783 行

### 建议改法

建议把门禁语义拆成两层，避免把 feature 分支 gate 和真实发布 gate 混在一起:

1. **里程碑放行门禁**
   - 仅要求 executor 在 feature 分支阶段可完成的本地 + CI 验证
   - 这决定 handoff 是否可以被接受

2. **发布后验证门禁**
   - 在真实 release / tag 之后执行
   - 由人类或专门的发布流程负责
   - 这决定“发布链路是否最终闭环”，但不应阻塞 executor 的 feature 分支完成

更具体地说:

- M8 可以把“Release 强制门禁”改名为“**发布前闭环要求**”或“**发布链最终验证**”
- M9 同理，避免继续写成 executor 当前阶段的“最终放行门禁”

## 问题 2: M6 的失败诊断仍主要依赖 plan-writer 自行补齐，playbook 本身还缺少固定抓手

### 现状

playbook 已经明确要求:

- 所有验证尽量机械化
- plan-writer 必须为每个验证命令写 FAIL 时的诊断路径

这已经比之前强很多。

但对于 M6 这种全链路最高风险节点，playbook 里仍然主要停留在原则层:

- 要写失败诊断路径
- 要有 e2e
- 要验证端口透传

还没有在 playbook 层直接规定最低限度的固定抓手。

### 风险

M6 一旦失败，最容易出现的问题不是“没有思路”，而是:

- 每个执行者去不同地方找日志
- backend port / host port 的来源不统一
- Playwright 失败后先看哪里也不一致

这会降低故障定位效率，也让 handoff 里的失败证据不够标准化。

### 涉及位置

- [`2026-05-07-webui-decouple-team-playbook.md`](../plans/2026-05-07-webui-decouple-team-playbook.md) 第 364-371 行
- [`2026-05-07-webui-decouple-team-playbook.md`](../plans/2026-05-07-webui-decouple-team-playbook.md) 第 722-730 行
- [`2026-05-07-webui-decouple-team-playbook.md`](../plans/2026-05-07-webui-decouple-team-playbook.md) 第 750-751 行

### 建议改法

建议在 playbook 里单独补一个非常短的“M6 固定诊断抓手”小节，哪怕只锁下面几项:

1. **日志优先级**
   - 先看 Playwright trace / screenshot / video
   - 再看 Electron 主进程日志
   - 再看 backend 日志

2. **端口来源**
   - backend port 从哪条日志或哪个对象字段读取
   - host port 从哪条日志或哪个返回值读取

3. **最小失败证据**
   - 失败 case 必须在 handoff 里附:
     - 失败命令
     - 失败截图或 trace 路径
     - backend / host 端口值
     - 第一条异常日志

这不需要取代 plan-writer 的详细诊断设计，只是给 M6 先提供一个跨会话一致的最低标准。

## 建议优先级

### P1

- 问题 1: 把 M8 / M9 的 release gate 与 executor 当前阶段 gate 明确分层
- 问题 2: 给 M6 补一个 playbook 级别的固定诊断抓手

## 建议的最小修法

如果只想最小成本继续收口:

1. 把 M8 / M9 checkpoint 里的“最终放行门禁”措辞改成不与 executor 时序冲突的说法
2. 在 playbook 里新增一个简短的 `M6 固定诊断抓手` 小节

做完这两步后，playbook 在执行层面的口径会更稳。
