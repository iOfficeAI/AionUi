# Round 2 Review Notes -- Reviewer B

## Review Scope

This review covers the 5 items identified in the R2 research report (`06-r2-research.md`) that need supplementary fixes after V1 landed. I've independently read all source code and formed my own assessment before receiving the architect's plan.

---

## Item 1: `buildRecoveredAgent` Missing `model` Field

**R2 Research Priority**: Low
**My Assessment**: Agree -- low priority, but the fix is trivial and should be included in this round.

### Source Analysis

`TeamSessionService.ts` L400-424: The `buildRecoveredAgent` method constructs a `TeamAgent` from `conversation.extra`, but the returned object at L413-423 lacks `model`. The field is simply not read from anywhere.

### The Real Question: Is `model` Available in `conversation.extra`?

I traced the write path:

1. `buildConversationParams` (L286-348) calls `buildAgentConversationParams` with `currentModelId: preferredModelId` (L338).
2. `buildAgentConversationParams` (in `buildAgentConversationParams.ts`) writes `currentModelId` into `extra`.
3. So for **ACP backends**, `conversation.extra.currentModelId` exists and can be read back.
4. For **Gemini/Aionrs**, the model is stored in `conversation.model.useModel` (the `TProviderWithModel` object), not in `extra`.

### Proposed Fix

```typescript
// In buildRecoveredAgent, after line 422:
private buildRecoveredAgent(team: TTeam, conversation: TChatConversation): TeamAgent | null {
  // ... existing code ...
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
    // Recover model: ACP stores in extra.currentModelId, Gemini/Aionrs in model.useModel
    model: (extra as { currentModelId?: string }).currentModelId
      || (conversation as { model?: { useModel?: string } }).model?.useModel,
  };
}
```

### Concern

The recovery of `model` from `conversation.model?.useModel` for Gemini/Aionrs needs type safety. `TChatConversation` is a discriminated union -- `conversation.model` exists for Gemini/Aionrs types but not for ACP. The cast above is safe because we're in a recovery codepath (best-effort), but a cleaner approach would be a small helper:

```typescript
private extractModelFromConversation(conversation: TChatConversation): string | undefined {
  const extra = conversation.extra as { currentModelId?: string } | undefined;
  if (extra?.currentModelId) return extra.currentModelId;
  if ('model' in conversation && conversation.model) {
    return (conversation.model as { useModel?: string }).useModel;
  }
  return undefined;
}
```

**Verdict**: Fix is straightforward. Include it in this round.

---

## Item 2: TeamPage Model ID Displayed Without Label Mapping

**R2 Research Priority**: Medium
**My Assessment**: Agree -- medium priority. This is visible to users on every team page.

### Source Analysis

`TeamPage.tsx` L116-118:

```tsx
<span className='shrink-0 text-11px text-[color:var(--color-text-4)] truncate max-w-100px'>
  {agent.model ?? '(default)'}
</span>
```

This renders raw model IDs like `claude-sonnet-4` instead of friendly labels like `Claude Sonnet 4`.

### The Challenge

The `TeamPage` component doesn't currently have access to model label data. To get labels, it would need to:

1. Load `acp.cachedModels` and `model.config` (both from `ConfigStorage`)
2. Use `getTeamAvailableModels` to build an `id -> label` map
3. Look up each agent's model ID to get the label

### Design Options

**Option A: Inline lookup in TeamPage**
Load cached models in a `useEffect` and build a Map. Simple but adds state + async loading to a component that's already large (567 lines).

**Option B: New utility function `getTeamModelLabel`**
Add to `teamModelUtils.ts`:

```typescript
export function getTeamModelLabel(
  modelId: string,
  backend: string,
  cachedModels: Record<string, AcpModelInfo> | null | undefined,
  providers: IProvider[] | null | undefined
): string {
  const models = getTeamAvailableModels(backend, cachedModels, providers);
  return models.find((m) => m.id === modelId)?.label || modelId;
}
```

Then use a custom hook in TeamPage to load the data and provide the lookup.

**Option C: Push label resolution into AgentChatSlot**
Since `AgentChatSlot` already has the agent, it could resolve the label. But it still needs the cached data.

### My Recommendation

Option B is cleanest. The utility is reusable and keeps TeamPage's complexity in check. But I'd argue this can wait -- the raw model ID is _correct_ information, just not _pretty_. For ACP backends, the label is already human-readable (e.g., `claude-sonnet-4` is understandable). For Gemini, labels are just IDs anyway (per S1 from round 1).

**Verdict**: Defer to V2 unless the architect has a low-effort approach. The R2 research itself acknowledges the tech plan already marked this as V2 TODO (S1).

---

## Item 3: AddAgentModal Cosmetic Label Rendering

**R2 Research Priority**: Low (cosmetic)
**My Assessment**: Agree -- low priority, trivial fix.

### Source Analysis

`AddAgentModal.tsx` L129-140:

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

When `TeamModelSelect` returns `null` (no models available), the label "Model" renders alone with nothing below it.

### Proposed Fix

Two approaches:

**Approach A (Preferred)**: Let `TeamModelSelect` handle this internally by wrapping itself with the label:

Not ideal -- breaks component responsibility. The parent should decide whether to show the section.

**Approach B (Simple)**: Have `TeamModelSelect` expose model count, or use a wrapper that checks availability first.

**Approach C (Simplest)**: Just move the condition inside `TeamModelSelect` to include the label, or have the parent render nothing when `TeamModelSelect` would return null.

The simplest correct fix is the same pattern already used in `TeamCreateModal.tsx` L249-255, where `TeamModelSelect` is rendered without a wrapping label:

```tsx
{
  dispatchAgentKey && (
    <TeamModelSelect
      backend={resolveTeamAgentType(agentFromKey(dispatchAgentKey, allAgents), 'acp')}
      value={selectedModel}
      onChange={setSelectedModel}
    />
  );
}
```

In `TeamCreateModal`, there's no separate "Model" label -- the select just appears inline. For `AddAgentModal`, the cleanest fix is to **wrap the entire div (label + select) in a component that conditionally renders based on model availability**.

However, the real fix should be: **make `TeamModelSelect` accept `children` or a `label` prop so it can render both the label and selector, or return `null` for the whole thing**.

**Verdict**: Include in this round. A 1-line fix: have `TeamModelSelect` accept an optional `label` prop and render it above the `<Select>` when models are available, or return null for everything. This keeps the parent clean.

---

## Item 4: Config Loading Redundancy

**R2 Research Priority**: Minor
**My Assessment**: Agree -- minor. Not worth a dedicated fix unless bundled with other changes.

### Source Analysis

`TeamModelSelect.tsx` loads `acp.cachedModels` and `model.config` on every `backend` change. In `AddAgentModal` and `TeamCreateModal`, `acp.cachedInitializeResult` is also loaded separately. This means when a modal opens:

1. Parent loads `acp.cachedInitializeResult` (for filtering team-capable agents)
2. `TeamModelSelect` loads `acp.cachedModels` + `model.config` (for model list)

These are independent ConfigStorage reads -- not redundant reads of the same key. The only potential optimization would be lifting all three reads into the parent and passing data down as props. But this adds prop drilling complexity for negligible performance gain (ConfigStorage reads are typically < 1ms).

**Verdict**: Skip for this round. Document as potential future optimization. The current pattern is correct and maintainable.

---

## Item 5: TeamModelSelect Backend-Change Reload

**R2 Research Priority**: Minor
**My Assessment**: Agree -- minor. The effect cleanup with `active` flag already prevents stale updates. No debounce needed because users don't rapidly switch between 10+ agent types.

**Verdict**: Skip for this round.

---

## Cross-Cutting Concerns

### C1: Test Coverage for `buildRecoveredAgent` Fix

If Item 1 is fixed, it needs a unit test. The `buildRecoveredAgent` method is private, but the public `getTeam` -> `repairTeamAgentsIfMissing` path exercises it. A test should verify:

1. When recovering an ACP agent, `model` is populated from `conversation.extra.currentModelId`
2. When recovering a Gemini agent, `model` is populated from `conversation.model.useModel`
3. When neither source has a model, `model` is `undefined` (not crashing)

### C2: Consistency Between `handleTeamMembers` and TeamPage Display

Currently `handleTeamMembers` (MCP tool) shows `model: <id>` while TeamPage shows `<id>` or `(default)`. These are consistent enough. But if Item 2 adds label mapping to TeamPage, `handleTeamMembers` should stay as-is (showing raw IDs for LLM consumption is better than friendly labels).

### C3: Scope Clarity

The R2 research report correctly confirms that the following are **not** bugs but intentional V1 scope limitations:

- Only ACP models in lead prompt (not Gemini/Aionrs)
- No runtime model switching
- Gemini model IDs as labels

The supplementary plan should NOT try to address these. They are properly deferred.

---

## Summary

| Item                                  | Priority | My Verdict                 | Action                                       |
| ------------------------------------- | -------- | -------------------------- | -------------------------------------------- |
| 1. buildRecoveredAgent model recovery | Low      | Fix this round             | Trivial, add helper + test                   |
| 2. TeamPage model label mapping       | Medium   | Defer to V2                | Not worth the complexity for V1              |
| 3. AddAgentModal label cosmetic       | Low      | Fix this round             | 1-line fix via label prop on TeamModelSelect |
| 4. Config loading redundancy          | Minor    | Skip                       | Not a real problem                           |
| 5. Backend-change reload              | Minor    | Skip                       | Not a real problem                           |
| C1. Test for Item 1                   | --       | Required if Item 1 is done | Unit test for recovery path                  |

**Bottom line**: This round should fix Items 1 and 3 only. Item 2 is the most user-visible but has the worst effort/impact ratio for V1 -- raw model IDs are acceptable. Items 4 and 5 are non-issues.
