# Package OfficeCLI Skill as AionUi Assistant

Convert an OfficeCLI skill into a fully wired AionUi assistant preset, or update an existing one.

## Usage

```
/package-assistant <skill-name> [assistant-id] [avatar]
```

- `<skill-name>` — Name of the skill directory under `/Users/veryliu/Documents/GitHub/officecli/skills/` (e.g. `officecli-docx`, `officecli-pptx`, `officecli-xlsx`, `officecli-data-dashboard`)
- `[assistant-id]` — Optional. ID for the new assistant (defaults to `<skill-name>-creator`)
- `[avatar]` — Optional. Emoji avatar (defaults to auto-selected based on skill type)

Arguments: $ARGUMENTS

---

## Before You Start — Detect Mode

Before doing anything, check whether this skill has already been packaged:

1. Check if `aionui/src/process/resources/skills/<skill-name>/` exists
2. Check if the assistant-id already appears in `assistantPresets.ts`

- **Both exist** → **Update mode**: Only re-copy skill files (Step 1). Skip Steps 2–4.
- **Neither exists** → **New mode**: Run all steps (1–5).
- **Skill exists but assistant doesn't** (or vice versa) → Run whichever steps are missing.

---

## Step 1 — Copy Skill Files

1. Read all files from `officecli/skills/<skill-name>/` (SKILL.md, creating.md, editing.md, reference/, etc.)
2. Create target directory at `aionui/src/process/resources/skills/<skill-name>/` — **directory name must be identical** to the officecli source directory name (both repos use the same `officecli-xxx` naming convention)
3. Copy all files, but apply these transformations to SKILL.md:
   - **Remove version comments**: Delete any `# officecli: vX.X.X` line from inside the frontmatter. AionUi's frontmatter parser (`/^---\s*\n([\s\S]*?)\n---/`) requires clean YAML — version tracking comments break parsing and skills won't appear in the Skills Center.
   - **Verify `name` field matches directory name**: The `name` field in SKILL.md frontmatter **MUST match the skill directory name exactly**. Both officecli and aionui use the same directory name (e.g. `officecli-docx`), so the `name` field should already be correct. If not, fix it. Mismatches cause: `params/name must be equal to one of the allowed values`.
   - **Keep frontmatter fields**: `name` and `description` must stay intact
   - **Keep BEFORE YOU START section**: The officecli install/update check section must be preserved — it's critical for users who don't have officecli installed
4. Copy creating.md, editing.md, and any other files (reference/ directories, etc.) as-is

## Step 2 — Research the Skill (New Mode Only)

Before writing descriptions and prompts, **study the skill thoroughly**:

1. **Read the full skill content**: SKILL.md, creating.md, editing.md — understand what it uniquely does
2. **Identify differentiators**: What makes this skill different from other similar assistants already in aionui? The `descriptionI18n` must clearly communicate this so users can tell assistants apart at a glance
3. **Mine iteration test results**: Check `/Users/veryliu/Documents/GitHub/officecli/iterations/` for test reports related to this skill:
   - Look for subdirectories matching the skill name (e.g. `data-dashboard/`, `xlsx/`, etc.) or related keywords
   - Find documents/prompts that scored highest or produced the best results
   - High-scoring test documents = prompts that are proven to produce good output → use these as `promptsI18n`
   - If no exact match, check parent directories or README files for pointers
4. **Understand the output**: What does the skill produce? What does a "great" result look like?

## Step 3 — Create Assistant Rule Files (New Mode Only)

Create two rule files in `aionui/src/process/resources/assistant/<assistant-id>/`:

**`<assistant-id>.md`** (English):

```markdown
# <Assistant Display Name>

You are **<Display Name>** — an AI assistant that <one-line capability summary>.

## When the user greets you or asks what you can do

Introduce yourself briefly:

> <2-3 sentence self-introduction. Mention key capabilities, invite collaboration, acknowledge limitations honestly.>

Then wait for the user's request.

## When the user wants to <primary action>

Follow the `officecli-<skill-name>` skill exactly. It contains the complete workflow. Do not deviate from or simplify the skill's instructions.

Before work starts, proactively remind the user once:

> After the file appears in the workspace, you can preview it directly in AionUi. However, please do not click "Open with system app" while I'm still working, as this may lock the file and cause the operation to fail.

After work completes, explicitly tell the user:

> Your <output type> is ready. Please open it now to review.
```

**`<assistant-id>.zh-CN.md`** (Chinese):
Same structure translated to natural Chinese. Keep the tone friendly and professional, not overly formal.

## Step 4 — Add Preset Entry (New Mode Only)

Add a new entry to `ASSISTANT_PRESETS` array in `aionui/src/common/config/presets/assistantPresets.ts`.

**Placement**: New officecli-based assistants go at the **top** of the array (after morph-ppt).

**Entry structure**:

```typescript
{
  id: '<assistant-id>',
  avatar: '<emoji>',
  presetAgentType: 'gemini',
  resourceDir: 'src/process/resources/assistant/<assistant-id>',
  ruleFiles: {
    'en-US': '<assistant-id>.md',
    'zh-CN': '<assistant-id>.zh-CN.md',
  },
  defaultEnabledSkills: ['<skill-name>'],
  nameI18n: {
    'en-US': '<English Name>',
    'zh-CN': '<Chinese Name>',
  },
  descriptionI18n: {
    'en-US': '<English description — MUST clearly differentiate from other assistants>',
    'zh-CN': '<Chinese description — same differentiation requirement>',
  },
  promptsI18n: {
    'en-US': [
      '<3 example prompts — prefer high-scoring prompts from iteration tests>',
    ],
    'zh-CN': [
      '<3 Chinese example prompts — translated from the same high-scoring sources>',
    ],
  },
},
```

**Description writing rules**:

- Users see multiple assistants side by side and decide which to use based on descriptions
- Each description must answer: "Why would I use THIS assistant instead of another?"
- Mention the specific output type, use case, and unique strength
- Avoid generic phrases like "professional documents" — be specific about what kind

**Prompt selection rules**:

- First priority: High-scoring prompts from `/Users/veryliu/Documents/GitHub/officecli/iterations/`
- These are battle-tested prompts that are proven to produce good results with the skill
- If no iteration data exists, write prompts that showcase the skill's unique strengths
- Prompts should be diverse (different use cases) and practical (things real users would ask)
- **CRITICAL: Prompts must be self-contained** — the user should be able to click the prompt and get a complete result without needing to provide any data, files, or attachments. Bad: "I have a CSV file, build a dashboard from it". Good: "Create a SaaS MRR dashboard with 12 months of sample data showing growth trends and churn breakdown". The assistant should generate sample data or pick a topic on its own.

## Step 5 — Verify

1. Confirm SKILL.md frontmatter starts with `---` on line 1 (no content before it)
2. Confirm frontmatter contains `name:` and `description:` fields
3. Confirm no `# officecli:` version comment remains in the frontmatter
4. Confirm assistant rule files exist in both en-US and zh-CN (new mode only)
5. Confirm preset entry is added to assistantPresets.ts with correct paths (new mode only)

---

## Important Notes

- The `_builtin/office-cli` skill already handles officecli discovery, but each skill's "BEFORE YOU START" section provides skill-specific install guidance — keep both.
- Avatar selection guide: 📝 for docx/word, 📊 for pptx/slides, 📈 for xlsx/excel, 📉 for dashboards/data, ✨ for morph/animation
- All assistants use `presetAgentType: 'gemini'` as default
- Both officecli and aionui use the same `officecli-xxx` directory naming convention. The skill directory name, SKILL.md `name` field, and `defaultEnabledSkills` entry must all be identical (e.g. `officecli-docx`). Exception: `morph-ppt` does not use the prefix.

## Existing Assistants Reference

When packaging a new assistant, review existing officecli-based assistants to avoid description overlap:

| ID                | Skill                    | Focus                                                 |
| ----------------- | ------------------------ | ----------------------------------------------------- |
| morph-ppt         | morph-ppt                | Morph-animated presentations with visual styles       |
| word-creator      | officecli-docx           | Word documents — reports, proposals, letters          |
| academic-paper    | officecli-academic-paper | Formal academic papers — TOC, equations, bibliography |
| ppt-creator       | officecli-pptx           | General PPT creation, editing, analysis               |
| excel-creator     | officecli-xlsx           | Excel — financial models, trackers, formulas          |
| dashboard-creator | officecli-data-dashboard | CSV → Excel dashboards with KPI, charts, auto-scaling |

Update this table when adding new assistants.
