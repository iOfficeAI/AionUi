---
name: i18n
description: |
  Internationalization (i18n) workflow and standards for managing translations.
  Use when: (1) Adding new user-facing text, (2) Creating new components with text, (3) Reviewing code for i18n compliance.
  Features: Key naming conventions, sync checking, hardcoded string detection, translation workflow.
---

# i18n Skill

Standards and workflow for internationalization. All user-visible text must use i18n.

**Announce at start:** "I'm using i18n skill to ensure proper internationalization."

## File Structure

```
src/renderer/i18n/
├── index.ts              # i18next configuration
└── locales/
    ├── en-US.json        # English (primary)
    ├── zh-CN.json        # Simplified Chinese
    ├── zh-TW.json        # Traditional Chinese
    ├── ja-JP.json        # Japanese
    └── ko-KR.json        # Korean
```

## Key Naming Convention

**IMPORTANT**: New i18n keys MUST use flat dot-notation format.

Format: `<module>.<feature>.<detail>`

### Rules

| Level   | Description            | Examples                                 |
| ------- | ---------------------- | ---------------------------------------- |
| Module  | Page or major feature  | `cron`, `chat`, `settings`, `auth`       |
| Feature | Specific functionality | `form`, `list`, `modal`, `sidebar`       |
| Detail  | Specific text purpose  | `title`, `placeholder`, `label`, `empty` |

### Examples

```
✓ cron.form.title
✓ cron.form.namePlaceholder
✓ cron.list.emptyState
✓ settings.llm.apiKeyRequired

✗ cronFormTitle           (missing dots)
✗ CRON.FORM.TITLE         (wrong case)
```

### Flat vs Nested Structure

```json
// ✅ GOOD - flat structure (use for NEW keys)
{
  "cron.form.title": "Create Scheduled Task",
  "cron.form.nameLabel": "Task Name",
  "cron.list.empty": "No scheduled tasks"
}

// ❌ AVOID - nested structure (legacy only, do not add new)
{
  "cron": {
    "form": {
      "title": "..."
    }
  }
}
```

**Rationale:**

- Flat keys are searchable in codebase (see `t('cron.form.title')`, search directly)
- Easier to verify sync across locale files
- Avoids deep nesting confusion

### Common Suffixes

| Suffix              | Usage                |
| ------------------- | -------------------- |
| `title`             | Section/page titles  |
| `placeholder`       | Input placeholders   |
| `label`             | Form labels          |
| `button` / `action` | Button text          |
| `success` / `error` | Status messages      |
| `confirm`           | Confirmation dialogs |
| `empty`             | Empty state messages |
| `loading`           | Loading states       |
| `tooltip`           | Tooltip text         |

### Shared Keys

Use `common.*` for reusable text:

```json
{
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.delete": "Delete",
  "common.loading": "Loading..."
}
```

## Adding New Text Workflow

### Step 1: Check Existing Keys

Before adding new key, search for similar existing keys:

```bash
grep -r "keyword" src/renderer/i18n/locales/
```

### Step 2: Add to ALL Locale Files

**CRITICAL:** Must add to all 5 files simultaneously.

```bash
# Files to update:
src/renderer/i18n/locales/en-US.json   # English text
src/renderer/i18n/locales/zh-CN.json   # Simplified Chinese
src/renderer/i18n/locales/zh-TW.json   # Traditional Chinese
src/renderer/i18n/locales/ja-JP.json   # Japanese
src/renderer/i18n/locales/ko-KR.json   # Korean
```

### Step 3: Use in Component

```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();

  return <button>{t('module.feature.action')}</button>;
}
```

### Step 4: Verify Sync

After adding, verify all files have the new keys.

## Sync Checking

### Before Commit

Always verify key sync across all locale files:

```bash
# Quick check - compare line counts (rough indicator)
wc -l src/renderer/i18n/locales/*.json

# Check for flat keys diff between en-US and zh-CN
diff <(grep -oE '"[a-zA-Z0-9_.]+":' src/renderer/i18n/locales/en-US.json | sort -u) \
     <(grep -oE '"[a-zA-Z0-9_.]+":' src/renderer/i18n/locales/zh-CN.json | sort -u)
```

### Fix Sync Issues

If keys are out of sync:

1. Identify missing keys from diff output
2. Add missing keys to appropriate files
3. Re-run diff to verify

## Hardcoded String Detection

### Prohibited Patterns

Never use hardcoded Chinese/English text in JSX:

```tsx
// ❌ BAD
<span>重命名</span>
<span>Delete</span>
<button title="更多操作">...</button>
{name || '新对话'}

// ✅ GOOD
<span>{t('common.rename')}</span>
<span>{t('common.delete')}</span>
<button title={t('common.moreActions')}>...</button>
{name || t('chat.newConversation')}
```

### Exceptions

Comments and internal logs are allowed:

```tsx
// This is a comment, Chinese is OK
console.log('Debug info'); // OK for logs
```

## zh-TW Maintenance

### Auto-conversion Safe

Most terms can be auto-converted from zh-CN:

- 设置 → 設置
- 删除 → 刪除
- 确认 → 確認

### Manual Adjustment Required

Some terms need manual review:

| zh-CN | zh-TW | Notes          |
| ----- | ----- | -------------- |
| 视频  | 影片  | Different term |
| 软件  | 軟體  | Different term |
| 信息  | 訊息  | Different term |
| 默认  | 預設  | Different term |

## Interpolation

### Variables

```json
{
  "greeting": "Hello, {{name}}!",
  "itemCount": "{{count}} items"
}
```

```tsx
t('greeting', { name: 'User' });
t('itemCount', { count: 5 });
```

### HTML in Translations

Use Trans component for complex markup:

```tsx
import { Trans } from 'react-i18next';

<Trans i18nKey='cron.countdown'>
  Task <strong>{{ taskName }}</strong> in <span>{{ countdown }}</span>
</Trans>;
```

## Quick Checklist

Before submitting code with new text:

- [ ] All user-visible text uses `t()` function
- [ ] New keys use flat `module.feature.detail` format
- [ ] New keys added to ALL 5 locale files
- [ ] No hardcoded Chinese/English in JSX
- [ ] zh-TW reviewed for term differences
- [ ] ja-JP and ko-KR translations added (or marked TODO)

## Common Mistakes

| Mistake                        | Correct                          |
| ------------------------------ | -------------------------------- |
| Adding key to only one file    | Add to all 5 files               |
| Using nested structure for new | Use flat `module.feature.detail` |
| Using `t("New Chat")`          | Define key: `t("chat.new")`      |
| Inline Chinese in JSX          | Use `t()` with defined key       |
| Forgetting interpolation       | Use `{{variable}}` syntax        |
