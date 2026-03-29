# Deep Interview Spec: Custom ACP Agent Configuration

## Metadata

- Interview ID: di-1729-custom-acp
- Rounds: 6
- Final Ambiguity Score: 15%
- Type: brownfield
- Generated: 2026-03-27
- Threshold: 20%
- Status: PASSED
- GitHub Issue: https://github.com/iOfficeAI/AionUi/issues/1729

## Clarity Breakdown

| Dimension          | Score | Weight | Weighted  |
| ------------------ | ----- | ------ | --------- |
| Goal Clarity       | 0.90  | 0.35   | 0.315     |
| Constraint Clarity | 0.80  | 0.25   | 0.200     |
| Success Criteria   | 0.82  | 0.25   | 0.205     |
| Context Clarity    | 0.88  | 0.15   | 0.132     |
| **Total Clarity**  |       |        | **0.852** |
| **Ambiguity**      |       |        | **14.8%** |

## Goal

Allow users to add **any ACP-compatible agent CLI** to AionUi through a simple structured form in Settings, without modifying source code or requiring the agent to be on any built-in whitelist. The design follows Zed's declarative `agent_servers` philosophy (command + args + env) but with a JetBrains-style structured form UI instead of raw JSON editing. Added agents appear in the home page agent selector and support full ACP conversation.

## Constraints

- **MVP scope — conversation only**: Custom agents use `spawnGenericBackend()`. No model selector, no mode switcher, no `configOptions` UI for custom agents in v1.
- **No backend masquerading in v1**: Custom agents always use backend type `'custom'` with generic spawn logic. Future iterations may allow selecting a known backend type to reuse its spawn/mode/model logic.
- **Architecture must leave extension points**: The data model and UI should not prevent future additions of: auto-detected models/configOptions from `session/new` response, backend type selection, and per-agent mode settings.
- **Existing code reuse**: The `CustomAcpAgent.tsx` and `CustomAcpAgentModal.tsx` components exist but are not mounted. They should be redesigned (not patched) to match the new structured form approach, then integrated into `AgentModalContent.tsx`.
- **Zed reference**: Configuration is declarative — user provides `command`, `args`, `env`. No CLI card selector from detected agents (that's the old design). Users type/paste the command directly.

## Non-Goals

- Model switching UI for custom agents (v1)
- Work mode (YOLO/bypassPermissions) configuration for custom agents (v1)
- Config options display for custom agents (v1)
- Backend type masquerading (selecting a known backend for spawn logic) (v1)
- Import/export of agent configurations
- Agent marketplace or registry browsing
- Auto-discovery of installed ACP CLIs for the custom agent form (the existing `AcpDetector` auto-discovery for built-in agents is unaffected)

## Acceptance Criteria

- [ ] **Settings integration**: Custom ACP Agent section is visible in Settings → Agent tab, below the existing AssistantManagement section, as a `Collapse.Item`
- [ ] **Structured form**: "Add Custom Agent" modal contains separate input fields for: Display Name (required), Command (required, e.g. `my-agent` or `/usr/local/bin/my-agent`), Arguments (optional, e.g. `--acp`), Environment Variables (optional, key-value pairs)
- [ ] **Collapsible advanced JSON**: Below the form fields, a collapsible "Advanced Configuration" section shows a JSON editor (CodeMirror) that stays in sync with the form fields, for power users who prefer JSON
- [ ] **CRUD operations**: Users can add, edit, and delete custom agents. Changes persist to `ConfigStorage('acp.customAgents')`
- [ ] **Connection test**: A "Test Connection" button in the modal performs two-step validation: (1) verify command exists/is executable, (2) spawn the CLI and send ACP `initialize` request, confirm valid response. Show success/failure with specific error messages for each step
- [ ] **Agent list appearance**: After saving, the custom agent appears in the home page agent pill bar / selector (via `AcpDetector` refresh + `useGuidAgentSelection`)
- [ ] **Conversation flow**: Selecting the custom agent and starting a new conversation successfully spawns the CLI, establishes an ACP session, and allows sending/receiving messages
- [ ] **Error handling**: If CLI path doesn't exist, agent fails to start, or ACP handshake fails during conversation start, show a clear error message to the user (not a silent failure)
- [ ] **i18n**: All user-facing strings use i18n keys following project conventions

## Assumptions Exposed & Resolved

| Assumption                                        | Challenge                                                                         | Resolution                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Custom agent feature already works                | Investigated: `CustomAcpAgent` component exists but is not mounted in settings UI | Confirmed orphaned — needs redesign and integration                        |
| Need CLI card selector for UX                     | Contrarian: Zed uses pure declarative config, no detection-based selector         | User chose Zed's approach: declarative command input, no card selector     |
| Custom agents need model/mode UI                  | Challenged with MVP scope question                                                | Deferred: v1 only needs conversation, auto-follow agent CLI's own settings |
| Custom agents should masquerade as known backends | Contrarian mode: some third-party agents are forks of known backends              | Deferred to future iteration; v1 uses generic spawn always                 |
| Connection test should be full handshake          | Scope question on validation depth                                                | Two-step: CLI existence check + ACP initialize, not full session/new       |

## Technical Context

### Existing Codebase (Brownfield)

**Data layer (ready to use):**

- `ConfigStorage.get/set('acp.customAgents')` — persists array of `AcpBackendConfig`
- `AcpDetector.initialize()` — already appends custom agents from storage at startup
- `acpConversation.refreshCustomAgents.invoke()` — IPC call to refresh detector after config changes
- `spawnGenericBackend()` in `acpConnectors.ts` — handles arbitrary CLI paths with proper env sanitization

**UI components (exist but need redesign):**

- `CustomAcpAgent.tsx` — list view with add/edit/delete, works but not mounted
- `CustomAcpAgentModal.tsx` — has CLI card selector + advanced JSON, needs redesign to structured form
- `AgentModalContent.tsx` — currently only renders `AssistantManagement`, needs to also render custom agent section

**Agent selection (works for custom agents):**

- `useGuidAgentSelection.ts` — already handles `custom:<uuid>` agent keys
- `AgentPillBar.tsx` — renders available agents including custom ones
- `createConversationParams.ts` — maps custom backend to `type: 'acp'` conversation

**ACP connection (works for custom agents):**

- `AcpConnection.connect()` → `spawnGenericBackend()` for `backend !== claude|codex|codebuddy`
- `AcpAgent.start()` → `initialize` → `session/new` → ready for messages
- `AcpAgentManager` — handles IPC bridging, streaming, message persistence

### Key Files to Modify

| File                                                                            | Change                                                                                                |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/renderer/pages/settings/AgentSettings/CustomAcpAgentModal.tsx`             | Redesign: replace CLI card selector with structured form (name, command, args, env fields)            |
| `src/renderer/pages/settings/AgentSettings/CustomAcpAgent.tsx`                  | Minor updates: ensure compatibility with redesigned modal                                             |
| `src/renderer/components/settings/SettingsModal/contents/AgentModalContent.tsx` | Add `CustomAcpAgent` to the Collapse alongside `AssistantManagement`                                  |
| `src/common/types/acpTypes.ts`                                                  | May need to extend `AcpBackendConfig` with `command` and `args` fields separate from `defaultCliPath` |
| `src/process/bridge/acpConversationBridge.ts`                                   | Add IPC handler for connection test (CLI check + ACP initialize)                                      |
| i18n JSON files                                                                 | Add keys for new form labels, test button, error messages                                             |

### Reference: Zed's agent_servers Config

```json
{
  "agent_servers": {
    "My Custom Agent": {
      "type": "custom",
      "command": "node",
      "args": ["~/projects/agent/index.js", "--acp"],
      "env": {}
    }
  }
}
```

AionUi equivalent (stored in ConfigStorage):

```json
[
  {
    "id": "uuid-here",
    "name": "My Custom Agent",
    "defaultCliPath": "node",
    "acpArgs": ["~/projects/agent/index.js", "--acp"],
    "env": {},
    "enabled": true
  }
]
```

## Ontology (Key Entities)

| Entity                         | Fields                                          | Relationships                                                              |
| ------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------- |
| CustomAgent (AcpBackendConfig) | id, name, defaultCliPath, acpArgs, env, enabled | Stored in ConfigStorage, detected by AcpDetector, spawned by AcpConnection |
| AcpDetector                    | detectedAgents[]                                | Aggregates built-in + extension + custom agents                            |
| AgentPillBar                   | availableAgents[]                               | Renders agents from AcpDetector results for selection                      |
| AcpConnection                  | subprocess, jsonRpc                             | Spawns CLI, manages JSON-RPC communication                                 |
| ConnectionTest                 | cliExists, acpInitializeOk                      | Validates agent before saving                                              |

## Interview Transcript

<details>
<summary>Full Q&A (6 rounds)</summary>

### Round 1

**Q:** The current custom agent system already lets users add agents with a display name, CLI path, env vars, and ACP args via Settings > Custom ACP Agent. What specific pain points or limitations in the CURRENT system does this issue aim to solve?
**A:** User asked where the AionUi configuration entry is. Investigation revealed that `CustomAcpAgent` component exists but is NOT mounted in the settings UI — it's orphaned code.
**Ambiguity:** 60% (Goal: 0.50, Constraints: 0.30, Criteria: 0.20, Context: 0.70)

### Round 2

**Q:** 现有的 CustomAcpAgent 组件已有基础代码但未集成到设置页面。Issue #1729 的核心目标是什么：是将现有组件接入并完善，还是需要重新设计整个自定义 agent 的添加体验？
**A:** 参考 Zed 的声明式配置 — Zed-style declarative approach with command + args + env.
**Ambiguity:** 54% (Goal: 0.75, Constraints: 0.30, Criteria: 0.20, Context: 0.80)

### Round 3

**Q:** Zed 的 agent_servers 配置很简洁：command + args + env 就够了。但现有 AionUi 的 ACP 系统还支持模型切换、工作模式设置、config options 等高级功能。对于自定义 agent，这些高级功能的边界是什么？
**A:** 最小可用 + 未来迭代 — MVP first, architecture leaves extension points.
**Ambiguity:** 43% (Goal: 0.80, Constraints: 0.55, Criteria: 0.20, Context: 0.80)

### Round 4 (Contrarian Mode)

**Q:** Issue 中提到「不需要关心是否有在白名单中支持」。但现有架构中自定义 agent 的 backend 类型是 'custom'。你是否考虑过自定义 agent 应该能「假装」成某个已知后端？
**A:** 可以考虑，但不是 MVP — defer to future iteration.
**Ambiguity:** 30% (Goal: 0.82, Constraints: 0.72, Criteria: 0.60, Context: 0.85)

### Round 5

**Q:** 关于「添加自定义 Agent」的表单 UI，Zed 用纯 JSON 编辑器，JetBrains 用结构化表单。你希望 AionUi 采用哪种形式？
**A:** 结构化表单为主 — structured form as primary, JetBrains-style.
**Ambiguity:** 20% (Goal: 0.88, Constraints: 0.75, Criteria: 0.70, Context: 0.85)

### Round 6

**Q:** 关于「测试连接」功能的具体行为：当用户点击「测试」按钮时，应该验证到什么程度才算成功？另外，自定义 agent 配置应该放在设置页面的哪个位置？
**A:** 验证 CLI 可执行 + ACP initialize — two-step validation. Placed in Agent settings tab below AssistantManagement.
**Ambiguity:** 15% (Goal: 0.90, Constraints: 0.80, Criteria: 0.82, Context: 0.88)

</details>
