# ACP Settings Sidebar Entry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated "ACP" sidebar entry in Settings so users can access custom ACP agent configuration without navigating through Assistants.

**Architecture:** Add `'acp'` to the builtin settings tab IDs in both `SettingsSider.tsx` and `SettingsPageWrapper.tsx`, create a new route `/settings/acp` → `AcpSettings` page, and remove the `CustomAcpAgent` from `AgentModalContent` (it gets its own page now).

**Tech Stack:** React, React Router, i18n (6 locales), Icon Park

---

## File Structure

| File                                                                            | Responsibility             | Action             |
| ------------------------------------------------------------------------------- | -------------------------- | ------------------ |
| `src/renderer/pages/settings/AcpSettings/index.tsx`                             | ACP settings page          | **Create**         |
| `src/renderer/pages/settings/components/SettingsSider.tsx`                      | Settings sidebar (desktop) | **Edit**           |
| `src/renderer/pages/settings/components/SettingsPageWrapper.tsx`                | Settings sidebar (mobile)  | **Edit**           |
| `src/renderer/components/layout/Router.tsx`                                     | Route definitions          | **Edit**           |
| `src/renderer/components/settings/SettingsModal/contents/AgentModalContent.tsx` | Remove duplicate           | **Edit**           |
| `src/renderer/services/i18n/locales/*/settings.json`                            | i18n label                 | **Edit** (6 files) |

---

### Task 1: Add route, page, sidebar entry, and i18n

**Files:**

- Create: `src/renderer/pages/settings/AcpSettings/index.tsx`
- Modify: `src/renderer/components/layout/Router.tsx:8,56`
- Modify: `src/renderer/pages/settings/components/SettingsSider.tsx:27,119`
- Modify: `src/renderer/pages/settings/components/SettingsPageWrapper.tsx:52`
- Modify: `src/renderer/components/settings/SettingsModal/contents/AgentModalContent.tsx`
- Modify: `src/renderer/services/i18n/locales/*/settings.json` (6 locales)

- [ ] **Step 1: Create AcpSettings page**

```tsx
// src/renderer/pages/settings/AcpSettings/index.tsx
import React from 'react';
import CustomAcpAgent from '@/renderer/pages/settings/AgentSettings/CustomAcpAgent';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import { Collapse, Message } from '@arco-design/web-react';
import { SettingsViewModeProvider } from '@/renderer/components/settings/SettingsModal/settingsViewContext';

const AcpSettings: React.FC = () => {
  const [message, messageContext] = Message.useMessage({ maxCount: 10 });

  return (
    <SettingsPageWrapper>
      {messageContext}
      <Collapse defaultActiveKey={['custom-acp-agent']}>
        <CustomAcpAgent message={message} />
      </Collapse>
    </SettingsPageWrapper>
  );
};

export default AcpSettings;
```

- [ ] **Step 2: Add lazy route in Router.tsx**

In `src/renderer/components/layout/Router.tsx`, add after the `SkillsHubSettings` lazy import (around line 8):

```tsx
const AcpSettings = React.lazy(() => import('@renderer/pages/settings/AcpSettings'));
```

And add the route after the `skills-hub` route (around line 56):

```tsx
<Route path='/settings/acp' element={withRouteFallback(AcpSettings)} />
```

- [ ] **Step 3: Add sidebar entry in SettingsSider.tsx**

In `src/renderer/pages/settings/components/SettingsSider.tsx`:

Add `'acp'` to `BUILTIN_TAB_IDS` after `'skills-hub'` (line 27):

```typescript
const BUILTIN_TAB_IDS = [
  'gemini',
  'model',
  'agent',
  'skills-hub',
  'acp',
  'tools',
  'display',
  'webui',
  'system',
  'about',
] as const;
```

Add the `acp` entry to `builtinMap` after the `skills-hub` entry (after line 130):

```typescript
      acp: {
        id: 'acp',
        label: t('settings.acp', { defaultValue: 'ACP' }),
        icon: <Toolkit />,
        path: 'acp',
      },
```

Note: Import `Toolkit` is already imported. Using it for ACP — or pick a more fitting icon if available.

- [ ] **Step 4: Add sidebar entry in SettingsPageWrapper.tsx (mobile)**

In `src/renderer/pages/settings/components/SettingsPageWrapper.tsx`, add after the `tools` entry in the `builtins` array (around line 61):

```typescript
      {
        id: 'acp',
        label: t('settings.acp', { defaultValue: 'ACP' }),
        icon: <Toolkit theme='outline' size='16' />,
        path: 'acp',
      },
```

- [ ] **Step 5: Remove CustomAcpAgent from AgentModalContent**

In `src/renderer/components/settings/SettingsModal/contents/AgentModalContent.tsx`, revert to only showing `AssistantManagement`:

Remove the `CustomAcpAgent` import and usage:

```tsx
// Remove: import CustomAcpAgent from '@/renderer/pages/settings/AgentSettings/CustomAcpAgent';

// Change defaultActiveKey back to just ['smart-assistants']
<Collapse defaultActiveKey={['smart-assistants']}>
  <AssistantManagement message={agentMessage} />
</Collapse>
```

- [ ] **Step 6: Add i18n keys**

Add `"acp": "ACP"` to all 6 locale settings.json files. Find the existing `"assistants"` key and add `"acp"` nearby:

- `en-US/settings.json`: `"acp": "ACP"`
- `zh-CN/settings.json`: `"acp": "ACP"`
- `ja-JP/settings.json`: `"acp": "ACP"`
- `zh-TW/settings.json`: `"acp": "ACP"`
- `ko-KR/settings.json`: `"acp": "ACP"`
- `tr-TR/settings.json`: `"acp": "ACP"`

(ACP is a protocol name, keep it as-is across all locales)

- [ ] **Step 7: Lint and format**

Run: `bun run lint:fix && bun run format`

- [ ] **Step 8: Type check**

Run: `bunx tsc --noEmit`

- [ ] **Step 9: Commit**

```bash
git add src/renderer/pages/settings/AcpSettings/ src/renderer/components/layout/Router.tsx src/renderer/pages/settings/components/SettingsSider.tsx src/renderer/pages/settings/components/SettingsPageWrapper.tsx src/renderer/components/settings/SettingsModal/contents/AgentModalContent.tsx src/renderer/services/i18n/locales/*/settings.json
git commit -m "feat(settings): add dedicated ACP sidebar entry in Settings"
```
