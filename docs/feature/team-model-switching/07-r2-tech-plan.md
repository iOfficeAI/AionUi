# Round 2 Supplemental Tech Plan — Team Model Switching Fixes

## Version History

| Version | Date       | Author           | Description                               |
| ------- | ---------- | ---------------- | ----------------------------------------- |
| v1      | 2026-04-16 | Architect A (R2) | Initial draft based on R2 research report |

---

## Overview

This plan addresses the three issues identified in the Round 2 research report (`06-r2-research.md`). All three are non-blocking for V1 but should be fixed as a patch before shipping.

| #     | Issue                                                                           | Priority                | File                                |
| ----- | ------------------------------------------------------------------------------- | ----------------------- | ----------------------------------- |
| FIX-1 | AddAgentModal model label renders with empty content when backend has no models | Low (cosmetic)          | `AddAgentModal.tsx`                 |
| FIX-2 | `buildRecoveredAgent` does not restore `model` field                            | Low (extreme edge case) | `TeamSessionService.ts`             |
| FIX-3 | TeamPage shows raw model ID instead of friendly label                           | Medium (UX)             | `TeamPage.tsx`, `teamModelUtils.ts` |

---

## FIX-1: AddAgentModal Model Label Empty Render

### Problem

When `selectedKey` is truthy but the resolved backend has no available models (e.g., `acp.cachedModels` is empty for that backend), the "Model" label renders but `TeamModelSelect` returns `null`, leaving a dangling label with no content below it.

### File & Location

**File**: `src/renderer/pages/team/components/AddAgentModal.tsx`, lines 129-140

Current code:

```tsx
{
  selectedKey && (
    <div className='flex flex-col gap-6px'>
      <label className='text-sm text-[var(--color-text-2)] font-medium'>
        {t('team.addAgent.model', { defaultValue: 'Model' })}
      </label>
      <TeamModelSelect
        backend={resolveTeamAgentType(agentFromKey(selectedKey, allAgents), 'acp')}
        value={selectedModel}
        onChange={setSelectedModel}
      />
    </div>
  );
}
```

### Proposed Change

Move the visibility decision into `TeamModelSelect` by having it render the entire label+select block when models exist, or return `null` when they don't.

However, that would violate component responsibility (the parent owns the label). A cleaner approach: let `TeamModelSelect` expose model availability, and wrap the whole block in a sub-component.

**Simplest approach**: Move the label inside `TeamModelSelect` so the component fully owns its own visibility. But that changes the component's API contract.

**Chosen approach**: Wrap the label+select pair in `TeamModelSelect` itself. When `models.length === 0`, the entire block (label included) returns `null`.

**File**: `src/renderer/pages/team/components/TeamModelSelect.tsx`

Change from (line 32):

```tsx
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
```

To:

```tsx
if (loading || models.length === 0) return null;

return (
  <div className='flex flex-col gap-6px'>
    {label && <label className='text-sm text-[var(--color-text-2)] font-medium'>{label}</label>}
    <Select placeholder='(default)' allowClear value={value} onChange={onChange}>
      {models.map((m) => (
        <Select.Option key={m.id} value={m.id}>
          {m.label}
        </Select.Option>
      ))}
    </Select>
  </div>
);
```

Add `label?: string` to `Props` (line 6-9):

```tsx
type Props = {
  backend: string;
  value: string | undefined;
  onChange: (model: string | undefined) => void;
  label?: string;
};
```

**File**: `src/renderer/pages/team/components/AddAgentModal.tsx`, lines 129-140

Change from:

```tsx
{
  selectedKey && (
    <div className='flex flex-col gap-6px'>
      <label className='text-sm text-[var(--color-text-2)] font-medium'>
        {t('team.addAgent.model', { defaultValue: 'Model' })}
      </label>
      <TeamModelSelect
        backend={resolveTeamAgentType(agentFromKey(selectedKey, allAgents), 'acp')}
        value={selectedModel}
        onChange={setSelectedModel}
      />
    </div>
  );
}
```

To:

```tsx
{
  selectedKey && (
    <TeamModelSelect
      backend={resolveTeamAgentType(agentFromKey(selectedKey, allAgents), 'acp')}
      value={selectedModel}
      onChange={setSelectedModel}
      label={t('team.addAgent.model', { defaultValue: 'Model' })}
    />
  );
}
```

**Also apply the same pattern in `TeamCreateModal.tsx`** wherever `TeamModelSelect` is used with an external label wrapper.

### Backward Compatibility

- `label` prop is optional. Existing callers that don't pass `label` get the same behavior as before (no label, just the select).
- The outer wrapper `<div>` is moved inside `TeamModelSelect` only when `label` is provided. When `label` is omitted, the layout is unchanged.

---

## FIX-2: buildRecoveredAgent Does Not Restore `model`

### Problem

When `team.agents` is empty and the system reconstructs agents from conversations (`repairTeamAgentsIfMissing`), the `buildRecoveredAgent` method at line 413-423 builds a `TeamAgent` without the `model` field. The model information is available in `conversation.extra.currentModelId` (written by `buildAgentConversationParams` at line 118 of `buildAgentConversationParams.ts`).

### File & Location

**File**: `src/process/team/TeamSessionService.ts`, lines 400-424

Current code (the return object, lines 413-423):

```typescript
return {
  slotId,
  conversationId: conversation.id,
  role: isLead ? 'lead' : 'teammate',
  agentType,
  agentName: this.resolveRecoveredAgentName(team, conversation, isLead),
  conversationType: conversation.type,
  status: this.mapRecoveredStatus(conversation.status),
  cliPath: extra.cliPath || extra.gateway?.cliPath,
  customAgentId: extra.customAgentId || extra.presetAssistantId,
};
```

### Proposed Change

**Step 1**: Extend the `extra` type cast at line 401 to include `currentModelId`:

Change from (line 401-407):

```typescript
const extra = conversation.extra as {
  cliPath?: string;
  customAgentId?: string;
  presetAssistantId?: string;
  gateway?: { cliPath?: string };
  teamMcpStdioConfig?: { env?: Array<{ name?: string; value?: string }> };
};
```

To:

```typescript
const extra = conversation.extra as {
  cliPath?: string;
  customAgentId?: string;
  presetAssistantId?: string;
  gateway?: { cliPath?: string };
  teamMcpStdioConfig?: { env?: Array<{ name?: string; value?: string }> };
  currentModelId?: string;
};
```

**Step 2**: Add `model` to the returned object. After line 422 (`customAgentId`), add:

Change from (lines 413-423):

```typescript
return {
  slotId,
  conversationId: conversation.id,
  role: isLead ? 'lead' : 'teammate',
  agentType,
  agentName: this.resolveRecoveredAgentName(team, conversation, isLead),
  conversationType: conversation.type,
  status: this.mapRecoveredStatus(conversation.status),
  cliPath: extra.cliPath || extra.gateway?.cliPath,
  customAgentId: extra.customAgentId || extra.presetAssistantId,
};
```

To:

```typescript
return {
  slotId,
  conversationId: conversation.id,
  role: isLead ? 'lead' : 'teammate',
  agentType,
  agentName: this.resolveRecoveredAgentName(team, conversation, isLead),
  conversationType: conversation.type,
  status: this.mapRecoveredStatus(conversation.status),
  cliPath: extra.cliPath || extra.gateway?.cliPath,
  customAgentId: extra.customAgentId || extra.presetAssistantId,
  model: extra.currentModelId,
};
```

### Source of Truth

`currentModelId` is written into `conversation.extra` by `buildAgentConversationParams` (line 118: `if (currentModelId) extra.currentModelId = currentModelId`). This is the same value originally from `agent.model || resolvePreferredAcpModelId()`. For ACP backends this is reliable. For Gemini/Aionrs, `currentModelId` may be undefined (the model is stored in `conversation.model.useModel` instead).

To also handle Gemini/Aionrs, add a fallback:

```typescript
model: extra.currentModelId || (conversation as { model?: { useModel?: string } }).model?.useModel,
```

This covers both ACP (model in `extra.currentModelId`) and Gemini/Aionrs (model in `conversation.model.useModel`).

### Backward Compatibility

- For old conversations that don't have `currentModelId` in `extra`, `extra.currentModelId` is `undefined`.
- For old conversations that don't have `conversation.model.useModel`, the fallback is also `undefined`.
- Result: `model` field is `undefined`, which is the correct fallback behavior (system uses backend default). No regression.

---

## FIX-3: TeamPage Shows Raw Model ID Instead of Label

### Problem

`TeamPage.tsx` line 116-118 displays `agent.model ?? '(default)'` directly. For ACP backends, model IDs like `claude-sonnet-4` have friendly labels like `Claude Sonnet 4` available in `acp.cachedModels[backend].availableModels`. The raw ID is shown to users instead of the label.

### Proposed Change — Two Parts

#### Part A: New utility function in `teamModelUtils.ts`

**File**: `src/common/utils/teamModelUtils.ts`

Add after line 85 (after `getTeamDefaultModelId`):

```typescript
/**
 * Resolve a model ID to its friendly display label.
 *
 * Lookup order:
 * 1. ACP cachedModels[backend].availableModels — match by id, return label
 * 2. Fall back to the raw model ID
 *
 * This function is synchronous and expects pre-fetched data.
 */
export function resolveTeamModelLabel(
  modelId: string | undefined,
  backend: string,
  cachedModels: Record<string, AcpModelInfo> | null | undefined
): string {
  if (!modelId) return '(default)';

  // Try ACP cached models first (they have { id, label } pairs)
  const acpModels = cachedModels?.[backend]?.availableModels;
  if (acpModels) {
    const match = acpModels.find((m) => m.id === modelId);
    if (match?.label) return match.label;
  }

  // Fallback: return the raw ID (Gemini/Aionrs don't have label mapping yet — see TODO S1)
  return modelId;
}
```

#### Part B: Use label resolver in TeamPage

**File**: `src/renderer/pages/team/TeamPage.tsx`

The model display is in `AgentChatSlot` (line 116-118). We need to load `acp.cachedModels` and use `resolveTeamModelLabel`.

**Option 1 (preferred)**: Load `cachedModels` once at the `TeamPageContent` level and pass it down through props. This avoids N async reads for N agents.

**Option 2**: Create a tiny hook `useTeamModelLabel(modelId, backend)` that reads `cachedModels` from `ConfigStorage`. Simpler but causes N reads.

**Chosen: Option 1** — load once, pass through.

**Step 1**: In `TeamPageContent` (or `TeamPage`), add a state + effect to load `cachedModels`:

At the top of `TeamPageContent` function body (after existing state declarations, around line 192):

```tsx
import { resolveTeamModelLabel } from '@/common/utils/teamModelUtils';
import { ConfigStorage } from '@/common/config/storage';
import type { AcpModelInfo } from '@/common/types/acpTypes';

// Inside TeamPageContent:
const [cachedModels, setCachedModels] = useState<Record<string, AcpModelInfo> | null>(null);

useEffect(() => {
  let active = true;
  ConfigStorage.get('acp.cachedModels').then((data) => {
    if (active) setCachedModels(data ?? null);
  });
  return () => {
    active = false;
  };
}, []);
```

**Step 2**: Pass `cachedModels` to `AgentChatSlot` as a prop:

Add to `AgentChatSlot` props type (line 56-63):

```tsx
const AgentChatSlot: React.FC<{
  agent: TeamAgent;
  teamId: string;
  isLead: boolean;
  isFullscreen?: boolean;
  runtimeStatus?: string;
  onToggleFullscreen?: () => void;
  onRemove?: () => void;
  cachedModels?: Record<string, AcpModelInfo> | null; // NEW
}>;
```

**Step 3**: Replace the model display (line 116-118):

Change from:

```tsx
<span className='shrink-0 text-11px text-[color:var(--color-text-4)] truncate max-w-100px'>
  {agent.model ?? '(default)'}
</span>
```

To:

```tsx
<span className='shrink-0 text-11px text-[color:var(--color-text-4)] truncate max-w-100px'>
  {resolveTeamModelLabel(agent.model, agent.agentType, cachedModels)}
</span>
```

**Step 4**: Thread `cachedModels` prop in all `<AgentChatSlot>` render sites (lines 401, 451):

```tsx
<AgentChatSlot
  agent={agent}
  teamId={team.id}
  isLead={isLeadSlot}
  cachedModels={cachedModels}  // NEW
  ...
/>
```

### Backward Compatibility

- `resolveTeamModelLabel` returns `'(default)'` when `modelId` is `undefined` — same visual behavior as before.
- When `cachedModels` is `null` (not yet loaded), the function falls through to the raw ID, which is acceptable as a transient state.
- No changes to data layer, IPC, or DB.

---

## Testing Strategy

### FIX-1 Tests

No unit test needed (pure UI cosmetic). Manual verification:

1. Open AddAgentModal, select an agent type whose backend has no cached models.
2. Verify: no "Model" label appears (entire section is hidden).
3. Select an agent type with cached models.
4. Verify: "Model" label and select both appear.

### FIX-2 Tests

Add to existing test suite or create a focused test:

**File**: `tests/unit/teamSessionService.test.ts` (or inline in existing file)

```typescript
describe('buildRecoveredAgent model recovery', () => {
  it('recovers model from conversation.extra.currentModelId (ACP)', () => {
    // Mock conversation with extra.currentModelId = 'claude-sonnet-4'
    // Assert recovered agent has model: 'claude-sonnet-4'
  });

  it('recovers model from conversation.model.useModel (Gemini/Aionrs fallback)', () => {
    // Mock conversation without currentModelId but with model.useModel = 'gemini-2.5-pro'
    // Assert recovered agent has model: 'gemini-2.5-pro'
  });

  it('recovers model as undefined when neither source exists', () => {
    // Mock conversation without currentModelId and without model.useModel
    // Assert recovered agent has model: undefined
  });
});
```

### FIX-3 Tests

Add unit tests for the new `resolveTeamModelLabel` function:

**File**: `tests/unit/teamModelUtils.test.ts` (append to existing)

```typescript
describe('resolveTeamModelLabel', () => {
  it('returns label from ACP cached models when match found', () => {
    const cachedModels = {
      claude: {
        currentModelId: 'claude-sonnet-4',
        currentModelLabel: 'Claude Sonnet 4',
        availableModels: [
          { id: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
          { id: 'claude-opus-4', label: 'Claude Opus 4' },
        ],
        canSwitch: true,
        source: 'configOption' as const,
      },
    };
    expect(resolveTeamModelLabel('claude-sonnet-4', 'claude', cachedModels)).toBe('Claude Sonnet 4');
  });

  it('returns raw model ID when no ACP match (Gemini fallback)', () => {
    expect(resolveTeamModelLabel('gemini-2.5-pro', 'gemini', null)).toBe('gemini-2.5-pro');
  });

  it('returns "(default)" when modelId is undefined', () => {
    expect(resolveTeamModelLabel(undefined, 'claude', null)).toBe('(default)');
  });

  it('returns raw ID when cachedModels has no entry for the backend', () => {
    expect(resolveTeamModelLabel('claude-sonnet-4', 'claude', {})).toBe('claude-sonnet-4');
  });

  it('returns raw ID when backend has models but none match', () => {
    const cachedModels = {
      claude: {
        currentModelId: null,
        currentModelLabel: null,
        availableModels: [{ id: 'claude-opus-4', label: 'Claude Opus 4' }],
        canSwitch: true,
        source: 'models' as const,
      },
    };
    expect(resolveTeamModelLabel('claude-sonnet-4', 'claude', cachedModels)).toBe('claude-sonnet-4');
  });
});
```

---

## File Change Summary

| File                                                     | Change Type | Fix # | Description                                                                                |
| -------------------------------------------------------- | ----------- | ----- | ------------------------------------------------------------------------------------------ |
| `src/renderer/pages/team/components/TeamModelSelect.tsx` | Modify      | FIX-1 | Add optional `label` prop; render label inside component when models exist                 |
| `src/renderer/pages/team/components/AddAgentModal.tsx`   | Modify      | FIX-1 | Remove external label wrapper; pass `label` prop to `TeamModelSelect`                      |
| `src/renderer/pages/team/components/TeamCreateModal.tsx` | Modify      | FIX-1 | Same pattern as AddAgentModal if applicable                                                |
| `src/process/team/TeamSessionService.ts`                 | Modify      | FIX-2 | Add `currentModelId` to extra type cast (L401); add `model` to returned object (L413-423)  |
| `src/common/utils/teamModelUtils.ts`                     | Modify      | FIX-3 | Add `resolveTeamModelLabel` function                                                       |
| `src/renderer/pages/team/TeamPage.tsx`                   | Modify      | FIX-3 | Load `cachedModels` once; pass to `AgentChatSlot`; use `resolveTeamModelLabel` for display |
| `tests/unit/teamModelUtils.test.ts`                      | Modify      | FIX-3 | Add tests for `resolveTeamModelLabel`                                                      |
| `tests/unit/teamSessionService.test.ts`                  | Modify      | FIX-2 | Add tests for model recovery in `buildRecoveredAgent`                                      |

---

## Rejected Alternatives

### FIX-1: Expose `hasModels` boolean from TeamModelSelect

Considered having `TeamModelSelect` expose a `hasModels` ref/callback to the parent, so the parent can conditionally render the label. Rejected because it introduces unnecessary coupling and complexity. Moving the label inside the component is simpler and self-contained.

### FIX-3: Use a hook (`useTeamModelLabel`) per agent slot

Considered a hook that each `AgentChatSlot` calls independently. Rejected because it causes N parallel `ConfigStorage.get('acp.cachedModels')` reads for N agents. Loading once at the page level and passing down is more efficient.

### FIX-3: Store label alongside model ID in TeamAgent

Considered adding `modelLabel?: string` to `TeamAgent` type and persisting it. Rejected because labels can change (e.g., backend updates display name), so deriving label at render time from cached data is more correct. Also avoids a type expansion that would need migration consideration.
