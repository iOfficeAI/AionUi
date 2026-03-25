---
name: i18n
description: |
  Internationalization (i18n) workflow and standards for managing translations.
  Use when: (1) Adding new user-facing text, (2) Creating new components with user-facing text,
  (3) Reviewing code for i18n compliance, (4) Adding a new translation module.
---

# i18n Skill

Standards and workflow for internationalization. All user-visible text must use i18n.

**Announce at start:** "I'm using i18n skill to ensure proper internationalization."

## IMPORTANT: Read Config First

Before doing any i18n work, **always read `src/common/config/i18n-config.json`** to get the current list of supported languages and modules. Never assume a fixed number — languages and modules may have been added or removed since this skill was written.

```bash
cat src/common/config/i18n-config.json
```

This file is the **single source of truth**. All scripts, runtime code, and this workflow depend on it.

## File Structure

```
src/common/config/i18n-config.json              # Single source of truth: languages, modules
src/renderer/i18n/
├── index.ts                             # i18next configuration
├── i18n-keys.d.ts                       # AUTO-GENERATED — do not edit manually
└── locales/
    ├── <lang>/                          # One directory per language in i18n-config.json
    │   ├── index.ts                     # Barrel import for all modules
    │   ├── common.json                  # One JSON per module in i18n-config.json
    │   ├── conversation.json
    │   └── ...
    └── ...
```

### Key Facts

- **Reference language**: defined by `referenceLanguage` in `i18n-config.json` (currently `en-US`)
- **Supported languages**: defined by `supportedLanguages` array — read the file to get the current list
- **Modules**: defined by `modules` array — read the file to get the current list

## Key Structure

Keys use **namespaced dot notation** in code: `t('module.key')` or `t('module.nested.key')`.

Inside each module JSON file, keys can be **flat or nested**:

```json
// common.json — flat keys
{
  "send": "Send",
  "cancel": "Cancel",
  "copySuccess": "Copied"
}

// cron.json — nested keys
{
  "scheduledTasks": "Scheduled Tasks",
  "status": {
    "active": "Active",
    "paused": "Paused"
  }
}
```

In code:

```typescript
t('common.send'); // flat key in common.json
t('cron.status.active'); // nested key in cron.json
```

### Key Naming Rules

- Use **camelCase** for key names: `copySuccess`, `scheduledTasks`
- Group related keys with nesting: `status.active`, `actions.pause`
- Reusable text goes in `common.json`: save, cancel, delete, confirm, etc.
- Feature-specific text goes in the corresponding module

### Common Suffixes

| Suffix              | Usage                |
| ------------------- | -------------------- |
| `title`             | Section/page titles  |
| `placeholder`       | Input placeholders   |
| `label`             | Form labels          |
| `success` / `error` | Status messages      |
| `confirm`           | Confirmation dialogs |
| `empty`             | Empty state messages |
| `tooltip`           | Tooltip text         |

## Adding New Text — Workflow

### Step 1: Read `src/common/config/i18n-config.json`

Get the current language list and module list. Do not skip this step.

### Step 2: Check Existing Keys

Before adding a new key, search for similar existing keys:

```bash
grep -r "keyword" src/renderer/i18n/locales/en-US/
```

Reuse `common.*` keys when possible.

### Step 3: Choose the Right Module

Match the module to the feature area. If no module fits, consider whether a new module is needed (see "Adding a New Module" below).

### Step 4: Add to ALL Locale Directories

**CRITICAL:** Every new key must be added to **every** locale directory listed in `supportedLanguages`. Write the reference language first, then all others.

### Step 5: Use in Component

```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  return <button>{t('common.save')}</button>;
}
```

### Step 6: Regenerate Types and Validate

```bash
bun run i18n:types          # Regenerate i18n-keys.d.ts
node scripts/check-i18n.js  # Validate completeness
```

**Both commands must pass before committing.**

## Adding a New Module

1. Add module name to `src/common/config/i18n-config.json` → `modules` array
2. Create `<module>.json` in **every** locale directory (read `supportedLanguages` to know which)
3. Add import + export in each locale's `index.ts`
4. Run `bun run i18n:types` to regenerate type definitions
5. Run `node scripts/check-i18n.js` to validate

## Hardcoded String Detection

### Prohibited Patterns

Never use hardcoded Chinese/English text in JSX:

```tsx
// Bad
<span>重命名</span>
<span>Delete</span>
{name || '新对话'}

// Good
<span>{t('common.rename')}</span>
<span>{t('common.delete')}</span>
{name || t('conversation.newConversation')}
```

### Exceptions

- Code comments (any language OK)
- `console.log()` / debug output
- Internal string constants not shown to users

## Interpolation

### Variables

```json
{
  "taskCount": "{{count}} task(s)",
  "greeting": "Hello, {{name}}!"
}
```

```tsx
t('cron.taskCount', { count: 5 });
```

### HTML in Translations

Use Trans component for complex markup:

```tsx
import { Trans } from 'react-i18next';

<Trans i18nKey='cron.countdown'>
  Task <strong>{{ taskName }}</strong> in <span>{{ countdown }}</span>
</Trans>;
```

## zh-TW Maintenance

Most terms can be auto-converted from zh-CN, but some need manual review:

| zh-CN | zh-TW | Notes          |
| ----- | ----- | -------------- |
| 视频  | 影片  | Different term |
| 软件  | 軟體  | Different term |
| 信息  | 訊息  | Different term |
| 默认  | 預設  | Different term |

## Quick Checklist

Before submitting code with new text:

- [ ] Read `src/common/config/i18n-config.json` to get current languages and modules
- [ ] All user-visible text uses `t()` function
- [ ] New keys added to **every** locale directory in `supportedLanguages`
- [ ] No hardcoded Chinese/English in JSX
- [ ] zh-TW reviewed for term differences
- [ ] `bun run i18n:types` ran (regenerate type definitions)
- [ ] `node scripts/check-i18n.js` passed (no errors)

## Common Mistakes

| Mistake                                        | Correct                                              |
| ---------------------------------------------- | ---------------------------------------------------- |
| Assuming a fixed number of languages           | Always read `i18n-config.json` first                 |
| Adding key to only some locales                | Add to **every** locale in `supportedLanguages`      |
| Editing `i18n-keys.d.ts` manually              | Run `bun run i18n:types` to generate                 |
| Using `t("New Chat")`                          | Define key: `t("conversation.newChat")`              |
| Not updating `i18n-config.json` for new module | Update config first, then create files               |
| Adding module JSON but not updating `index.ts` | Must add import + export in each locale's `index.ts` |
