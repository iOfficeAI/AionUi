# Team Model Switching — Technical Plan

## Version History

| Version        | Date           | Author          | Description                                                                                                                                                                                                        |
| -------------- | -------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v1             | 2026-04-16     | Architect A     | Initial draft                                                                                                                                                                                                      |
| v1.1           | 2026-04-16     | Reviewer B      | Review notes: 4 must-fix (M1-M4), 5 suggestions (S1-S5), 6 omissions (O1-O6)                                                                                                                                       |
| **v2 (Final)** | **2026-04-16** | **Architect A** | **Addressed all B findings. M1/M3/M4/O1/O2/O3/O5: accepted and fixed. O4: scope clarified (V1 = create-time only). O6: accepted (drop teamGuidePrompt change). S1-S5: accepted as TODOs or minor inline changes.** |

### B's Findings Disposition

| ID  | Verdict          | Action                                                                                                                 |
| --- | ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| M1  | **B is correct** | Section 5.4 rewritten: target file changed from `TeamSession.ts` to `TeammateManager.ts`                               |
| M3  | **B is correct** | Both `SpawnAgentFn` definitions (TeamMcpServer.ts L23, TeamSession.ts L13) must be updated. Added to file change list. |
| M4  | **B is correct** | Section 4.4 rewritten with precise insertion points (L306-307 for ACP, L314 for Gemini/Aionrs)                         |
| O1  | **B is correct** | `buildRolePrompt.ts` `BuildRolePromptParams` added to file change list and Section 5.1                                 |
| O2  | **B is correct** | `TeammateManager.ts` added to file change list                                                                         |
| O3  | **B is correct** | `TeamSession.ts` SpawnAgentFn already in original list but description updated to include type change                  |
| O4  | **B is correct** | V1 scope explicitly limited to create-time model selection. Runtime switching deferred to V2. See Section 11.          |
| O5  | **B is correct** | Re-export chain documented in Section 3.1                                                                              |
| O6  | **B is correct** | Section 5.3 (teamGuidePrompt change) removed from V1 scope                                                             |
| S1  | Accepted as TODO | Gemini model display name mapping deferred to V2                                                                       |
| S2  | Accepted as TODO | Aionrs provider filtering deferred; current behavior matches `resolveDefaultAionrsModel`                               |
| S3  | Accepted         | Loading state added to TeamModelSelect spec (Section 6.3)                                                              |
| S4  | Accepted         | `undefined` model displays as "(default)" (Section 6.4)                                                                |
| S5  | Accepted         | Light validation + warning log in `handleSpawnAgent` (Section 4.2)                                                     |

---

## Overview

Add model selection capability to Team mode. Currently, team agents only support choosing an agent type (backend), but not a specific model within that backend. This plan extends the full stack — types, DB, IPC, MCP, prompts, UI — to support model selection for team agents.

**V1 Scope**: Model selection at **creation time** only (TeamCreateModal, AddAgentModal, `team_spawn_agent`). Runtime model switching for already-running agents is deferred to V2 (see Section 11).

---

## 1. Data Layer

### 1.1 TeamAgent Type Extension

**File**: `src/common/types/teamTypes.ts`

Add an optional `model` field to `TeamAgent`:

```typescript
export type TeamAgent = {
  slotId: string;
  conversationId: string;
  role: TeammateRole;
  agentType: string;
  agentName: string;
  conversationType: string;
  status: TeammateStatus;
  cliPath?: string;
  customAgentId?: string;
  model?: string; // NEW: model ID (e.g. 'claude-sonnet-4', 'gemini-2.5-pro')
};
```

**Rationale**: Optional field ensures backward compatibility. Existing `TeamAgent` objects without `model` continue to work; the system falls back to the backend's default model when `model` is `undefined`.

### 1.2 DB Schema — No Change Needed

**File**: `src/process/services/database/schema.ts`

The `teams` table stores agents as a JSON-serialized `TeamAgent[]` in the `agents TEXT` column (schema.ts line 86). Adding `model` to the TypeScript type automatically includes it in the serialized JSON. No SQL migration needed.

### 1.3 Backward Compatibility for Existing Data

Existing teams in the DB have `agents` JSON without a `model` field. Since `model` is `Optional`, deserialization produces `model: undefined`. All code paths that read `model` must handle the undefined case by falling back to the backend's default/preferred model. This is enforced at the `TeamSessionService.buildConversationParams` level (see Section 4).

---

## 2. Model Enumeration

### 2.1 Model Resolution Strategy

Models are available from two sources:

| Source                         | Key                            | What it provides                                                                                                                                       |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `acp.cachedModels`             | `Record<string, AcpModelInfo>` | Per-backend model list from ACP session/new responses. `AcpModelInfo.availableModels` is `Array<{ id: string; label: string }>` (standardized format). |
| `model.config` (`IProvider[]`) | Provider list                  | Gemini / Aionrs models from user-configured providers.                                                                                                 |

**File**: `src/common/config/storage.ts` (`acp.cachedModels` at line 68, `model.config` at line 73)

### 2.2 New Utility: `getTeamAvailableModels`

**New file**: `src/common/utils/teamModelUtils.ts`

```typescript
import type { AcpModelInfo } from '@/common/types/acpTypes';
import type { IProvider } from '@/common/config/storage';

export type TeamAvailableModel = {
  id: string;
  label: string;
};

/**
 * Get available models for a given agent backend in team context.
 *
 * Resolution order:
 * 1. ACP backends (claude, codex, qwen, etc.) → read from acp.cachedModels[backend].availableModels
 *    (already standardized to { id: string; label: string }[])
 * 2. Gemini → read from model.config providers with platform='gemini' or 'gemini-with-google-auth'
 * 3. Aionrs → read from model.config providers (first enabled — matches resolveDefaultAionrsModel behavior)
 * 4. Others → empty list (no model switching)
 *
 * TODO(S2): Aionrs should filter by platform to avoid picking wrong provider when multiple are configured.
 */
export function getTeamAvailableModels(
  backend: string,
  cachedModels: Record<string, AcpModelInfo> | null | undefined,
  providers: IProvider[] | null | undefined
): TeamAvailableModel[] {
  // ACP backends: use cached model list from ACP protocol
  const acpModelInfo = cachedModels?.[backend];
  if (acpModelInfo?.availableModels && acpModelInfo.availableModels.length > 0) {
    return acpModelInfo.availableModels.map((m) => ({
      id: m.id,
      label: m.label || m.id,
    }));
  }

  // Gemini: use configured providers
  // TODO(S1): Add model display name mapping for friendlier labels
  if (backend === 'gemini') {
    const geminiProviders = (providers || []).filter(
      (p) => p.enabled !== false && (p.platform === 'gemini' || p.platform === 'gemini-with-google-auth')
    );
    return geminiProviders.flatMap((p) =>
      p.model.filter((m) => p.modelEnabled?.[m] !== false).map((m) => ({ id: m, label: m }))
    );
  }

  // Aionrs: use first enabled provider's models (matches resolveDefaultAionrsModel behavior)
  if (backend === 'aionrs') {
    const provider = (providers || []).find((p) => p.enabled !== false && p.model?.length);
    if (provider) {
      return provider.model.filter((m) => provider.modelEnabled?.[m] !== false).map((m) => ({ id: m, label: m }));
    }
  }

  return [];
}

/**
 * Resolve the default model ID for a backend.
 * Used when TeamAgent.model is undefined.
 */
export function getTeamDefaultModelId(
  backend: string,
  cachedModels: Record<string, AcpModelInfo> | null | undefined,
  acpConfig: Record<string, { preferredModelId?: string } | undefined> | null | undefined
): string | undefined {
  // 1. User's preferred model for this backend
  const preferred = acpConfig?.[backend]?.preferredModelId;
  if (preferred) return preferred;

  // 2. Cached current model from last ACP session
  const cached = cachedModels?.[backend]?.currentModelId;
  if (cached) return cached;

  return undefined;
}
```

### 2.3 IPC for Fetching Models (Renderer Access)

The renderer already has access to `ConfigStorage.get('acp.cachedModels')` and `ConfigStorage.get('model.config')`. No new IPC endpoint is needed for reading available models. The utility in 2.2 runs in the renderer process using data already available via `ConfigStorage`.

---

## 3. IPC Layer

### 3.1 ICreateTeamParams Extension

**File**: `src/common/adapter/ipcBridge.ts` (line 1276)

No change needed to `ICreateTeamParams` or `IAddTeamAgentParams` because `model` is already part of the `TeamAgent` type (via the agents array). The IPC bridge passes `TeamAgent[]` directly. The `model` field flows through as part of the `TeamAgent` object.

**Re-export chain**: `ipcBridge.ts` imports `TeamAgent` from `@process/team/types`, which re-exports from `@/common/types/teamTypes`. Modifying `TeamAgent` in `src/common/types/teamTypes.ts` propagates automatically to both the IPC bridge and all team code that imports from `@process/team/types`.

Verification: `ICreateTeamParams.agents` is typed as `import('@process/team/types').TeamAgent[]`, and `IAddTeamAgentParams.agent` is typed as `Omit<import('@process/team/types').TeamAgent, 'slotId'>`. Both automatically include the new optional `model` field.

---

## 4. MCP Layer

### 4.1 `team_spawn_agent` Tool — Add `model` Parameter

**File**: `src/process/team/mcp/team/teamMcpStdio.ts` (line 152-169)

Add `model` to the Zod schema:

```typescript
createTeamTool(
  server,
  'team_spawn_agent',
  TEAM_SPAWN_AGENT_DESCRIPTION,
  {
    name: z.string().describe('Name for the new teammate'),
    agent_type: z.string().optional().describe('Agent type/backend...'),
    model: z
      .string()
      .optional()
      .describe(
        'Model ID to use for this agent (e.g. "claude-sonnet-4", "gemini-2.5-pro"). ' +
          "Defaults to the backend's preferred model when omitted."
      ),
  },
  TEAM_MCP_PORT,
  TEAM_AGENT_SLOT_ID,
  TEAM_MCP_TOKEN
);
```

### 4.2 `TeamMcpServer.handleSpawnAgent` — Pass `model` Through

**File**: `src/process/team/mcp/team/TeamMcpServer.ts` (line 22-23, 329-364)

Changes:

1. Update `SpawnAgentFn` type signature (line 22)
2. Extract `model` from `args`
3. Pass it to `spawnAgent` callback
4. Add light model validation with warning log (per S5)

```typescript
// Type change (line 22)
type SpawnAgentFn = (agentName: string, agentType?: string, model?: string) => Promise<TeamAgent>;

// In handleSpawnAgent (line 329)
private async handleSpawnAgent(args: Record<string, unknown>, callerSlotId?: string): Promise<string> {
  const name = String(args.name ?? '');
  const agentType = args.agent_type ? String(args.agent_type) : undefined;
  const model = args.model ? String(args.model) : undefined;  // NEW
  // ... existing validation ...

  // Light model validation: warn if model looks suspicious but don't block
  // (the ACP backend will degrade to default if invalid)
  if (model && agentType) {
    const cachedModels = await ProcessConfig.get('acp.cachedModels');
    const available = cachedModels?.[agentType]?.availableModels;
    if (available && available.length > 0 && !available.some((m) => m.id === model)) {
      console.warn(
        `[TeamMcpServer] handleSpawnAgent: model "${model}" not in available models for backend "${agentType}". ` +
        `Backend will use default model as fallback.`
      );
    }
  }

  const newAgent = await spawnAgent(name, agentType, model);  // Pass model
  // ... rest unchanged ...
}
```

### 4.3 `TeamSession.ts` — Update `SpawnAgentFn` Type

**File**: `src/process/team/TeamSession.ts` (line 13)

`TeamSession.ts` has an **independent** `SpawnAgentFn` type definition that must be updated in sync with `TeamMcpServer.ts`:

```typescript
// line 13
type SpawnAgentFn = (agentName: string, agentType?: string, model?: string) => Promise<TeamAgent>;
```

The constructor (line 32) passes `spawnAgent` to `TeamMcpServer`. No other changes needed in `TeamSession.ts` since it just threads the function through.

### 4.4 `TeamSessionService.getOrStartSession` — Thread `model` to `addAgent`

**File**: `src/process/team/TeamSessionService.ts` (line 740-762)

Update the `spawnAgent` closure to accept and pass `model`:

```typescript
const spawnAgent = async (agentName: string, agentType?: string, model?: string) => {
  const leadAgent = team.agents.find((a) => a.role === 'lead');
  const resolvedType = agentType || leadAgent?.agentType || 'claude';
  const newAgent = await this.addAgent(teamId, {
    conversationId: '',
    role: 'teammate',
    agentType: resolvedType,
    agentName,
    status: 'pending',
    conversationType: this.resolveConversationType(resolvedType) as 'acp',
    model, // NEW: pass model through
  });
  // ... rest unchanged (inject team MCP stdio config) ...
};
```

### 4.5 `TeamSessionService.buildConversationParams` — Use `agent.model`

**File**: `src/process/team/TeamSessionService.ts` (line 286-339)

The model override has **two distinct paths** depending on backend type:

**Path 1: ACP backends** — override via `currentModelId` (injected into `session/new` request)

At line 306-307, change:

```typescript
// BEFORE:
const preferredModelId =
  getConversationTypeForBackend(backend) === 'acp' ? await this.resolvePreferredAcpModelId(backend) : undefined;

// AFTER:
const preferredModelId =
  agent.model || // NEW: explicit model from TeamAgent takes priority
  (getConversationTypeForBackend(backend) === 'acp' ? await this.resolvePreferredAcpModelId(backend) : undefined);
```

This works because `preferredModelId` flows to `buildAgentConversationParams({ currentModelId: preferredModelId })` at line 329, which writes `extra.currentModelId`. For ACP backends, this is the correct injection point.

**Path 2: Gemini / Aionrs backends** — override via `model.useModel`

Insert between line 314 (after `resolveConversationModel` returns) and line 316 (before `buildAgentConversationParams` call):

```typescript
const model = await this.resolveConversationModel({
  backend,
  isPreset,
  presetAgentType: isPreset ? backend : undefined,
});

// NEW: Override useModel for Gemini/Aionrs when agent has an explicit model
if (agent.model) {
  const type = getConversationTypeForBackend(backend);
  if (type === 'gemini' || type === 'aionrs') {
    model = { ...model, useModel: agent.model };
  }
}

return buildAgentConversationParams({
  // ... (model variable is now potentially overridden)
});
```

Note: The `model` variable is typed `TProviderWithModel` (from `storage.ts` line 542: `Omit<IProvider, 'model'> & { useModel: string }`). Spreading with a new `useModel` is type-safe.

### 4.6 `team_members` Tool — Show Model Info

**File**: `src/process/team/mcp/team/TeamMcpServer.ts` (line 410-417)

Update `handleTeamMembers` to include model info:

```typescript
private async handleTeamMembers(): Promise<string> {
  const agents = this.params.getAgents();
  if (agents.length === 0) return 'No team members yet.';
  const lines = agents.map((a) => {
    const modelSuffix = a.model ? `, model: ${a.model}` : '';
    return `- ${a.agentName} (type: ${a.agentType}, role: ${a.role}, status: ${a.status}${modelSuffix})`;
  });
  return `## Team Members\n${lines.join('\n')}`;
}
```

### 4.7 Guide MCP — `aion_create_team` (No Change)

**File**: `src/process/team/mcp/guide/TeamGuideMcpServer.ts`

The guide's `aion_create_team` tool creates a team with a leader only. The leader's model is determined by the calling agent's own configuration. No model parameter is needed here — model selection is relevant when the lead uses `team_spawn_agent` to add teammates.

---

## 5. Prompt Layer

### 5.1 Lead Prompt — Add Model Recommendation

**File**: `src/process/team/prompts/leadPrompt.ts`

**Change 1**: Extend `LeadPromptParams` to include available model info:

```typescript
export type LeadPromptParams = {
  teammates: TeamAgent[];
  availableAgentTypes?: Array<{ type: string; name: string; models?: string[] }>; // ADD: models
  renamedAgents?: Map<string, string>;
  teamWorkspace?: string;
};
```

**Change 2**: Add model info to the Available Agent Types section (line 32-35):

```typescript
const availableTypesSection =
  availableAgentTypes && availableAgentTypes.length > 0
    ? `\n\n## Available Agent Types for Spawning\n${availableAgentTypes
        .map((a) => {
          const modelList = a.models?.length ? ` (models: ${a.models.join(', ')})` : '';
          return `- \`${a.type}\` — ${a.name}${modelList}`;
        })
        .join('\n')}`
    : '';
```

**Change 3**: Update workflow instructions (line 71) to include model in the proposal table:

```
5. Present the proposed lineup as a table with: teammate name, responsibility, recommended agent type/backend, and recommended model
```

**Change 4**: Add model recommendation guidance:

```
## Model Selection Guidelines
- When spawning teammates, consider recommending a specific model for each agent
- For complex reasoning tasks: prefer stronger models (e.g. claude-sonnet-4, gemini-2.5-pro)
- For routine tasks: prefer faster/cheaper models (e.g. gemini-2.0-flash)
- If unsure, omit the model parameter to use the backend's default
- Pass the model parameter to team_spawn_agent when a specific model is recommended
```

### 5.2 `buildRolePrompt.ts` — Sync Type Definition

**File**: `src/process/team/prompts/buildRolePrompt.ts` (line 4-11)

Update `BuildRolePromptParams` to match the extended `LeadPromptParams`:

```typescript
type BuildRolePromptParams = {
  agent: TeamAgent;
  teammates: TeamAgent[];
  /** Only needed for lead prompts */
  availableAgentTypes?: Array<{ type: string; name: string; models?: string[] }>; // ADD: models
  renamedAgents?: Map<string, string>;
  teamWorkspace?: string;
};
```

This type is the **intermediate** between `TeammateManager` (caller) and `buildLeadPrompt` (callee). It must allow `models` to pass through.

### 5.3 Tool Description Update

**File**: `src/process/team/prompts/toolDescriptions.ts`

Update `TEAM_SPAWN_AGENT_DESCRIPTION` to mention model:

```typescript
export const TEAM_SPAWN_AGENT_DESCRIPTION = `Create a new teammate agent to join the team.
...
- Present the proposal as a table with: name, responsibility, recommended agent type/backend, and recommended model
- Include each teammate's responsibility, recommended agent type/backend, and model
...
When calling this tool, provide the model parameter if a specific model was recommended and approved.`;
```

### 5.4 Feed Available Models to Lead Prompt

**File**: `src/process/team/TeammateManager.ts` (line 164-171)

This is where `availableAgentTypes` is actually constructed for the lead agent's first prompt. The call chain is:

```
TeammateManager.ts:174 → buildRolePrompt() → leadPrompt.ts:18 buildLeadPrompt()
```

Update the `availableAgentTypes` construction to include model lists:

```typescript
// Compute availableAgentTypes only for lead's first prompt
let availableAgentTypes: Array<{ type: string; name: string; models?: string[] }> | undefined;
if (agent.role === 'lead') {
  const cachedInitResults = await ProcessConfig.get('acp.cachedInitializeResult');
  const cachedModels = await ProcessConfig.get('acp.cachedModels'); // NEW: read cached models
  availableAgentTypes = acpDetector
    .getDetectedAgents()
    .filter((a) => isTeamCapableBackend(a.backend, cachedInitResults))
    .map((a) => ({
      type: a.backend,
      name: a.name,
      models: cachedModels?.[a.backend]?.availableModels?.map((m) => m.id) || [], // NEW
    }));
}
```

**Note**: This only covers ACP backends' models from `cachedModels`. For Gemini/Aionrs models from `model.config`, we would need to read `ProcessConfig.get('model.config')` and use the same logic as `getTeamAvailableModels`. For V1, ACP cached models are sufficient since they are the primary use case. Gemini/Aionrs model lists in the prompt can be added in V2 if needed.

### 5.5 TeamGuidePrompt — No Change (V1)

**File**: `src/process/team/prompts/teamGuidePrompt.ts`

Per reviewer B's O6: The guide's `aion_create_team` only creates a team with a leader. Adding a Model column to the guide's example table would mislead users into thinking they specify per-member models at team creation time. Model selection happens later via `team_spawn_agent` in the lead prompt. **No change for V1.**

---

## 6. UI Layer

### 6.1 TeamCreateModal — Add Model Selector for Leader

**File**: `src/renderer/pages/team/components/TeamCreateModal.tsx`

After the leader agent card selection, add an optional model dropdown that shows available models for the selected backend.

**Changes**:

1. Add state: `const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);`
2. Add state for cached models: read `ConfigStorage.get('acp.cachedModels')` and `ConfigStorage.get('model.config')` (already reads `acp.cachedInitializeResult`)
3. Compute available models using `getTeamAvailableModels(resolvedBackend, cachedModels, providers)`
4. When `dispatchAgentKey` changes, reset `selectedModel` to undefined
5. Render a `<Select>` below the agent grid when available models exist (via `TeamModelSelect`)
6. Pass `model: selectedModel` in the `TeamAgent` object at line 101

```tsx
// Inside handleCreate:
agents.push({
  slotId: '',
  conversationId: '',
  role: 'lead',
  status: 'pending',
  agentType: dispatchAgentType,
  agentName: 'Leader',
  conversationType: resolveConversationType(dispatchAgentType),
  cliPath: dispatchAgent?.cliPath,
  customAgentId: dispatchAgent?.customAgentId,
  model: selectedModel, // NEW
});
```

### 6.2 AddAgentModal — Add Model Selector

**File**: `src/renderer/pages/team/components/AddAgentModal.tsx`

**Changes**:

1. Add state: `const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);`
2. Load cached models (same pattern as TeamCreateModal)
3. When `selectedKey` (agent type) changes, reset `selectedModel`
4. Add a model `<Select>` below the agent type selector (via `TeamModelSelect`)
5. Pass `model` in the `onConfirm` callback data

Update the `Props.onConfirm` type:

```typescript
onConfirm: (data: { agentName: string; agentKey: string; model?: string }) => void;
```

### 6.3 Model Selector Component

**New file**: `src/renderer/pages/team/components/TeamModelSelect.tsx`

A reusable model selector component used by both TeamCreateModal and AddAgentModal:

```tsx
type Props = {
  backend: string;
  value: string | undefined;
  onChange: (model: string | undefined) => void;
};

const TeamModelSelect: React.FC<Props> = ({ backend, value, onChange }) => {
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<TeamAvailableModel[]>([]);

  useEffect(() => {
    setLoading(true);
    // Load acp.cachedModels and model.config
    Promise.all([ConfigStorage.get('acp.cachedModels'), ConfigStorage.get('model.config')]).then(
      ([cachedModels, providers]) => {
        setModels(getTeamAvailableModels(backend, cachedModels, providers));
        setLoading(false);
      }
    );
  }, [backend]);

  // Don't render if no models available or still loading
  if (loading || models.length === 0) return null;

  return (
    <Select placeholder='(default)' allowClear value={value} onChange={onChange}>
      {models.map((m) => (
        <Select.Option key={m.id} value={m.id}>
          {m.label}
        </Select.Option>
      ))}
    </Select>
  );
};
```

### 6.4 Team Members List — Show Model

Where team members are displayed (in `TeamPage.tsx` or related components), show the model alongside the agent type if present.

- When `agent.model` is defined: show the model ID
- When `agent.model` is `undefined`: show `(default)`

This is purely cosmetic — the model info is already in `TeamAgent.model`.

---

## 7. Backward Compatibility

| Concern                                    | Handling                                                                                                                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing `TeamAgent` in DB without `model` | `model` is `Optional<string>`. Deserializing old JSON produces `undefined`. All model resolution code has a fallback chain: `agent.model ?? preferredModelId ?? backend default`.                                |
| Existing teams with running sessions       | Sessions already in memory have `TeamAgent` objects without `model`. The `model` field is only read when building new conversation params (`buildConversationParams`). Existing conversations are unaffected.    |
| `team_spawn_agent` MCP tool                | The `model` parameter is `z.string().optional()`. Old lead prompts that don't pass `model` will get the default. New prompts will recommend and pass models.                                                     |
| DB migration                               | Not needed. `agents` is a JSON text column. New fields are automatically included/excluded.                                                                                                                      |
| IPC parameter types                        | `ICreateTeamParams.agents` and `IAddTeamAgentParams.agent` use the `TeamAgent` type (via `@process/team/types` re-export from `@/common/types/teamTypes`). The optional `model` field is automatically included. |

---

## 8. Edge Cases & Degradation

### 8.1 Model Not Available

When a requested model is not available (e.g., the user's API key doesn't support it, or the backend CLI version is outdated):

- **Detection**: The ACP backend's `session/new` response may return an error or fall back to a default model.
- **Strategy**: Do NOT validate model availability at spawn time (beyond the warning log in `handleSpawnAgent`). The model is passed as `currentModelId` / `preferredModelId` to the conversation params, and the ACP backend handles the actual model resolution. If the model is invalid, the backend degrades to its default model — same behavior as solo chat.
- **UI Feedback**: The model shown in team_members output (via `handleTeamMembers`) reflects what was requested, not necessarily what's running. For V2, we could read back the actual model from the conversation's ACP session.

### 8.2 Cached Models Empty

If `acp.cachedModels` is empty for a backend (no prior ACP session has been started for that backend):

- The UI model selector shows nothing — no model dropdown appears.
- The lead prompt does not include model lists for that backend.
- `team_spawn_agent` without a model parameter uses the backend default.
- This is acceptable for V1 — models populate after the first solo conversation with each backend.

### 8.3 Gemini Models

Gemini models come from `model.config` (IProvider), not from ACP cachedModels. The `getTeamAvailableModels` function handles this separately by reading from providers with `platform === 'gemini'` or `'gemini-with-google-auth'`.

### 8.4 Custom Agents

Custom agents (`backend === 'custom'`) may or may not have model selection. The `getTeamAvailableModels` function returns an empty list for unrecognized backends, so no model selector is shown. The user can still set a model manually if the custom agent supports it.

### 8.5 LLM Hallucinated Model IDs (S5)

When `cachedModels` is empty for a backend, the lead prompt has no model list, but the LLM may still pass a hallucinated model ID to `team_spawn_agent`. The light validation in `handleSpawnAgent` (Section 4.2) logs a warning but does not block. The ACP backend degrades to its default model.

---

## 9. File Change Summary

| File                                                     | Change Type | Description                                                                                                                                |
| -------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/common/types/teamTypes.ts`                          | Modify      | Add optional `model` to `TeamAgent`                                                                                                        |
| `src/common/utils/teamModelUtils.ts`                     | **New**     | `getTeamAvailableModels`, `getTeamDefaultModelId`                                                                                          |
| `src/process/team/mcp/team/TeamMcpServer.ts`             | Modify      | `SpawnAgentFn` type (L22) + `handleSpawnAgent` passes model + model validation warning + `handleTeamMembers` shows model                   |
| `src/process/team/mcp/team/teamMcpStdio.ts`              | Modify      | Add `model` to `team_spawn_agent` Zod schema                                                                                               |
| `src/process/team/TeamSession.ts`                        | Modify      | `SpawnAgentFn` type (L13) — must stay in sync with `TeamMcpServer.ts`                                                                      |
| `src/process/team/TeamSessionService.ts`                 | Modify      | `spawnAgent` closure accepts model (L740), `buildConversationParams` uses `agent.model` for both ACP (L306) and Gemini/Aionrs (L314) paths |
| `src/process/team/TeammateManager.ts`                    | Modify      | Read `acp.cachedModels` and attach `models[]` to `availableAgentTypes` entries (L164-171)                                                  |
| `src/process/team/prompts/buildRolePrompt.ts`            | Modify      | Extend `BuildRolePromptParams.availableAgentTypes` type to include `models?: string[]`                                                     |
| `src/process/team/prompts/leadPrompt.ts`                 | Modify      | Extend `LeadPromptParams.availableAgentTypes` type, model recommendation in prompt, models in available types section                      |
| `src/process/team/prompts/toolDescriptions.ts`           | Modify      | Mention model in spawn description                                                                                                         |
| `src/renderer/pages/team/components/TeamCreateModal.tsx` | Modify      | Add model selector for leader                                                                                                              |
| `src/renderer/pages/team/components/AddAgentModal.tsx`   | Modify      | Add model selector + update onConfirm type                                                                                                 |
| `src/renderer/pages/team/components/TeamModelSelect.tsx` | **New**     | Reusable model selector component with loading state                                                                                       |

---

## 10. Testing Strategy

1. **Unit tests for `getTeamAvailableModels`** — verify model resolution for each backend type (ACP, Gemini, Aionrs, unknown)
2. **Unit tests for `getTeamDefaultModelId`** — verify fallback chain (preferred > cached > undefined)
3. **Unit tests for `TeamAgent` serialization** — verify model field round-trips through JSON
4. **Integration test for `team_spawn_agent`** — verify model parameter flows from MCP tool schema through to conversation params
5. **Manual E2E**: Create team with leader model selection, spawn agent with model via lead prompt, verify model appears in team_members output

---

## 11. V1 Scope Boundary & V2 Backlog

### V1 Scope (this plan)

- Model selection at **creation time**: TeamCreateModal (leader), AddAgentModal (manual add), `team_spawn_agent` (lead-initiated)
- Model display in team_members tool output and UI member list
- Model recommendation in lead prompt

### V2 Backlog (deferred)

| Item                                    | Description                                                                                                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Runtime model switching**             | Change model for an already-running team member. Requires: new IPC `team.setAgentModel`, DB update of agents JSON, conversation param rebuild on next wake. This addresses the full scope of goal doc requirement 3 ("users can switch team member models"). |
| **Gemini/Aionrs models in lead prompt** | Read `model.config` providers in `TeammateManager.ts` to also list Gemini/Aionrs model options in the prompt.                                                                                                                                                |
| **Model display name mapping** (S1)     | Map raw model IDs to friendly display names for Gemini models.                                                                                                                                                                                               |
| **Aionrs provider filtering** (S2)      | Filter Aionrs providers by platform to avoid picking wrong provider.                                                                                                                                                                                         |
| **Actual model readback**               | After ACP session starts, read back actual model from response and update `TeamAgent.model` / UI.                                                                                                                                                            |
