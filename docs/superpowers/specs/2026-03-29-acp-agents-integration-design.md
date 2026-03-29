# ACP Settings → Agents Integration Design

## Summary

Merge the standalone ACP custom agent settings page (`/settings/acp`) into the Agent Settings page (`/settings/agent`) under the "Local Agents" tab. Create a unified `AgentCard` component for both detected and custom agents, and replace the modal-based editing with inline expansion.

## Current State

- **Agent Settings** (`/settings/agent`): Two tabs — Local Agents (auto-detected CLI agents) + Remote Agents (WebSocket-based)
- **ACP Settings** (`/settings/acp`): Separate page for managing user-defined custom ACP agents (add/edit/delete via modal)
- Custom agent management was originally inside AgentSettings, then extracted to its own page

## Design Decisions

| Decision | Choice |
|----------|--------|
| How detected + custom agents coexist | Unified card style with section dividers ("Detected" / "Custom") |
| What happens to `/settings/acp` | Completely removed (route, sidebar entry, component directory) |
| Add/Edit interaction | Inline expansion below card (replaces modal) |
| "Add Custom Agent" button placement | Top of Local Agents tab |

## Component Structure

### New Files

```
AgentSettings/
├── AgentCard.tsx           # Unified card for detected + custom agents
└── InlineAgentEditor.tsx   # Inline expandable edit form (replaces modal)
```

### Modified Files

```
AgentSettings/
├── index.tsx               # No change
├── LocalAgents.tsx         # Refactored: integrates both agent types
└── RemoteAgentManagement.tsx  # No change
```

### Deleted Files

```
AgentSettings/
├── CustomAcpAgent.tsx      # Logic migrated to LocalAgents
└── CustomAcpAgentModal.tsx # Logic migrated to InlineAgentEditor

AcpSettings/                # Entire directory deleted
└── index.tsx
```

### External Reference Cleanup

- `Router.tsx`: Remove `/settings/acp` route and `AcpSettings` lazy import
- `SettingsSider.tsx`: Remove `'acp'` from `BUILTIN_TAB_IDS`, remove `acp` from `builtinMap`
- `SettingsPageWrapper.tsx`: Remove `acp` from `getBuiltinSettingsNavItems` builtinMap
- 6 locale files (`en-US`, `ja-JP`, `ko-KR`, `tr-TR`, `zh-CN`, `zh-TW`): Remove `"acp"` key

## AgentCard Component

Unified card rendering for both agent types via discriminated union props:

```typescript
type AgentCardProps =
  | { type: 'detected'; agent: DetectedAgent; onSettings?: () => void }
  | {
      type: 'custom';
      agent: CustomAcpAgent;
      editing: boolean;
      onEdit: () => void;
      onDelete: () => void;
      onToggle: (enabled: boolean) => void;
    }
```

### Card Layout

- **Left**: Logo/icon (detected → agent logo, custom → Robot icon)
- **Center**: Name + subtitle (detected → CLI path, custom → command + args)
- **Right actions**:
  - Detected → Settings button (clickable for Gemini, disabled + tooltip for others)
  - Custom → Enable switch + Edit button + Delete button

### Visual Consistency

- Same card dimensions, padding, border-radius, hover effect for both types
- Differentiation comes naturally from the right-side action area

## InlineAgentEditor Component

Replaces `CustomAcpAgentModal`. Renders as an expandable section below the triggering card (or at the top of the Custom section for new agents).

### Form Fields (carried over from existing modal)

- **Agent Name** (required)
- **Command** (required, CLI executable path)
- **Arguments** (optional, ACP startup args)
- **Environment Variables** (optional, key-value pairs)
- **Test Connection** button (calls `testCustomAgent` IPC)

### Interaction

- Expand/collapse with slide animation
- Bottom actions: Save / Cancel
- Save → collapse, call `refreshCustomAgents()` to refresh list
- Cancel → collapse, discard changes
- Only one editor open at a time

### State

`LocalAgents.tsx` manages: `editingAgentId: string | 'new' | null`

- `null` → no editing
- `'new'` → adding new agent, editor at top of Custom section
- `string` → editing specific agent, editor below that card

## LocalAgents Page Layout

Top to bottom:

1. **Top action bar** — "Add Custom Agent" button (right-aligned)
2. **Detected Agents section** — Section title "Detected" + `AgentCard` list (read-only)
3. **Custom Agents section** — Section title "Custom" + `AgentCard` list with inline editors; empty state text when no custom agents exist

## Data Flow

- **Detected agents**: No change — `acpConversationBridge.getAvailableAgents()`
- **Custom agents**: `ConfigStorage.get('acp.customAgents')` for read, mutations trigger `refreshCustomAgents()` to sync detection cache

## i18n Changes

### New Keys

- `settings.agentManagement.detected` — "Detected" section title
- `settings.agentManagement.custom` — "Custom" section title
- `settings.agentManagement.addCustomAgent` — "Add Custom Agent" button label

### Removed Keys

- `settings.acp` — removed from all 6 locale files

### Reused Keys

- All `settings.customAcpAgent.*` keys (form field labels, validation messages, etc.) — kept as-is
