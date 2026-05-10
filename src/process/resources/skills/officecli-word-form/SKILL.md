---
name: officecli-word-form
description: "Use this skill to create fillable Word forms (.docx) with real Content Controls (SDT) + legacy FormField checkboxes + MERGEFIELD mail-merge placeholders + document protection. Trigger on: 'fillable form', 'form fields', 'content controls', 'SDT', 'word form', 'fill in', 'only editable fields', 'protect document', 'onboarding form', 'HR intake', 'survey template', 'contract / SOW template', 'mail-merge template', 'compliance checklist', 'medical intake questionnaire'. Output is a single .docx where specific fields are editable and the rest is locked. This skill is INDEPENDENT, not a scene layer on docx — payload is `<w:sdt>` + `<w:ffData>` + `<w:fldChar>` + `documentProtection`, none of which docx base skill covers. Do NOT trigger for regular reports, letters, memos, academic papers, pitch decks, or any document with no user-fillable fields — route those to officecli-docx or its scene layers."
---

# OfficeCLI Word-Form Skill

**This skill is INDEPENDENT, not a scene layer on docx.** A form's payload — `<w:sdt>` controls, `<w:ffData>` legacy fields, `<w:fldChar>` mail-merge, `documentProtection` — is a distinct element class from docx's paragraph/heading/style primitives. Its QA is different too: docx's Delivery Gate cares about visual layout and live PAGE fields, this skill's cares about data plumbing (protection enforced / alias+tag / items injected / name ≤ 20 / no underscore anti-pattern). **Reverse handoff:** if the user's document has no fillable fields (report, letter, memo, thesis, proposal), route to `officecli-docx` or a docx scene skill — don't use this one.

## BEFORE YOU START (CRITICAL)

**If `officecli` is not installed:**

`macOS / Linux`

```bash
if ! command -v officecli >/dev/null 2>&1; then
    curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash
fi
```

`Windows (PowerShell)`

```powershell
if (-not (Get-Command officecli -ErrorAction SilentlyContinue)) {
    irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 | iex
}
```

Verify: `officecli --version`

If `officecli` is still not found after first install, open a new terminal and run the verify command again.

If the install command above fails (e.g. blocked by security policy, no network access, or insufficient permissions), install manually — download the binary for your platform from https://github.com/iOfficeAI/OfficeCLI/releases — then re-run the verify command.

## Help-First Rule

This skill teaches what a real form needs, not every CLI flag. When a prop / alias / enum is uncertain, consult help BEFORE guessing: `officecli help docx [element] [--json]` (e.g. `sdt`, `formfield`, `field`). Help is pinned to installed version — when this skill and help disagree, **help wins**. Every `--prop X=` below was verified against `officecli help docx <element>` on v1.0.63.

## Mental Model & Inheritance

A Word form is a `.docx` plus four OpenXML payload layers plain-docx skills do not touch: **`<w:sdt>`** content controls (5 types: text / richtext / dropdown / combobox / date), **`<w:ffData>`** legacy FormField (ONLY way to get a real checkbox on v1.0.63), **`<w:fldChar>`** complex fields (MERGEFIELD, REF, PAGEREF, SEQ, IF — template-time, not user-fill), and **`documentProtection`** (the lock that makes non-field text read-only in Word).

**No inheritance from docx v2.** docx's Delivery Gate (cover-fill %, live-PAGE check) does NOT apply — form QA is `view forms` + `query sdt alias+tag` + `protectionEnforced`.

**Reverse handoff to docx.** Route back to `officecli-docx` for reports / letters / memos / thesis / pitch decks / any document with no editable fields. Use **this** skill when the document's purpose is data capture or template merge.

## Shell & Execution Discipline

**One command at a time. Read output before the next.** OfficeCLI is incremental — every `add` / `set` / `remove` immediately mutates the file. All recipes below use `FILE=form.docx` as a shell variable.

**Three shell-escape layers:**

1. **Quote every path with `[N]`** — zsh/bash glob-expand brackets. `officecli get "$FILE" /body/sdt[1]` fails with `no matches found`. Correct: `officecli get "$FILE" '/body/sdt[1]'`.
2. **Single-quote any prop containing `$`** — `"Total: $50,000"` becomes `"Total: ,000"` after `$50` variable expansion. Correct: `'Total: $50,000'`.
3. **`--after find:<text>` uses outer single quotes, never inner double quotes** — `--after find:"Client Signature:"` makes the quotes part of the search string; match fails. Correct: `--after 'find:Client Signature:'`.

**`WARNING: UNSUPPORTED` (exit 2) is a silently-wrong element.** The CLI created the element _without_ the rejected prop — dropdown with no items, date with default format, SDT with no lock. Any UNSUPPORTED in your build log means your command was wrong: stop, rewrite to Path B (raw-set) or a separate `set`. Do not ship on top.

**`protection=forms` is the LAST command.** Not CLI-enforced — `add` / `set` / `raw-set` still run under any protection mode — but finishing with protection gives Word users a consistent locked experience on first open.

### `--after find:` micro-playbook

`--after find:<text>` matches the **first** occurrence. Bad anchor = wrong insertion location, expensive to debug. Three rules:

1. **Anchor must be globally unique.** In bilingual contracts "甲方签字" matches both parties — use a unique phrase like "甲方签字（Service Provider）" or full English title.
2. **After insert, `/body/p[last()]` is unreliable** — the find insertion changes `<w:body>` child order. To continue operating on the new paragraph, read its real paraId: `officecli query "$FILE" paragraph --json | jq -r '.data.results[-1].format.paraId'`.
3. **Chinese + full-width parens `（）`** match literally in `find`, but when unsure, `officecli view "$FILE" text | grep -n "锚点"` first to confirm the exact bytes in the file.

```bash
# Trap: first-match hits 甲方 only, 乙方 missed
officecli add "$FILE" /body --type sdt --after 'find:签字'

# Fix: two signatories, two unique anchors
officecli add "$FILE" /body --type sdt --prop alias=Party_A_Name --prop tag=party_a \
  --after 'find:甲方签字（Service Provider）'
PID_A=$(officecli query "$FILE" paragraph --json | jq -r '.data.results[-1].format.paraId')
officecli add "$FILE" "/body/p[@paraId='$PID_A']" --type sdt --prop alias=Party_A_Title --prop tag=party_a_title
```

Inline SDT via `--after find:` is added as a child of the matched paragraph, not as a new paragraph — use this when label + SDT must share a line.

## What makes a real form (identity)

A real fillable form requires **structured fields** + **document protection**.

| Approach                                | Word user sees                               | CLI-readable                     | Real form?              |
| --------------------------------------- | -------------------------------------------- | -------------------------------- | ----------------------- |
| SDT controls + `protection=forms`       | Gray-bordered fields; rest locked            | `query sdt` / `view forms`       | **YES**                 |
| FormField checkbox + `protection=forms` | Real clickable checkbox; rest locked         | `query formfield` / `view forms` | **YES** (checkbox only) |
| MERGEFIELD placeholders                 | `«CustomerName»` merged by downstream engine | `query field`                    | **YES** (template-time) |
| Underscores `___` / blank lines         | Visual-only; whole doc editable              | No — no structured fields        | **NO**                  |

**Do not simulate fields with underscores.** `姓名：_______________` produces zero structured data and leaks past every verification. Always use `--type sdt` or `--type formfield`.

**Checkbox is formfield, NOT SDT.** `--type sdt --prop type=checkbox` exits 1 (`SDT type 'checkbox' is not implemented`). Every checkbox in every recipe uses `--type formfield --prop type=checkbox`.

**MERGEFIELD is a separate track.** `view forms` lists SDT + formfield only; `query field` lists complex fields only. Two disjoint inventories; both valid in one file.

## Requirements for Outputs (hard floor)

Every form must satisfy these — Delivery Gate enforces each as an executable check.

1. `protection=forms` enforced (`get $FILE /` → `protectionEnforced=True`).
2. Every SDT has both `alias` + `tag`.
3. Every dropdown/combobox has non-empty `items=...` in `view forms`.
4. Every date SDT shows the intended `format=...`.
5. Every locked SDT shows `lock=sdtLocked` / `contentLocked` / `sdtContentLocked` as intended.
6. Zero `WARNING: UNSUPPORTED` in build log.
7. Zero `type=checkbox` on any SDT.
8. Every formfield `name` ≤ 20 characters.
9. Zero underscore-line / blank-line placeholders.
10. Field types match user intent (short text / paragraph / fixed list / list+custom / date / boolean).

## Three Paths (core decision)

CLI v1.0.63 exposes exactly **four canonical props** on SDT: `{type, tag, alias, text}`. Everything else — `items`, `format`, `lock`, `placeholder`, `name`, `maxlength` — is UNSUPPORTED at add-time and silently discarded. The skill therefore splits every SDT need into three paths. **Pick the path before writing a single command.**

### Path A — Pure CLI (simple forms)

**Use when**: the field only needs a label, an initial text, and a type. Acceptable if dropdown/combobox items can be empty at first and dates can default to `yyyy-MM-dd`.

```bash
officecli add "$FILE" /body --type sdt \
  --prop type=text \
  --prop alias="Full Name" --prop tag=full_name \
  --prop text="Enter full name"
# Canonical follow-ups (not on add):
# officecli set "$FILE" '/body/sdt[N]' --prop lock=sdtlocked
# officecli set "$FILE" / --prop protection=forms
```

### Path B — CLI + `raw-set` bridge (complex attrs)

**Use when**: dropdown/combobox needs options, or date needs a non-default format. `raw-set` is OfficeCLI's universal OpenXML fallback — `officecli --help` lists it as a top-level command.

```bash
# Step 1 — Path A skeleton (generates <w:dropDownList/> automatically)
officecli add "$FILE" /body --type sdt \
  --prop type=dropdown --prop alias="Department" --prop tag=dept

# Step 2 — raw-set injects <w:listItem>s
officecli raw-set "$FILE" /document \
  --xpath "//w:sdt[w:sdtPr/w:tag/@w:val='dept']/w:sdtPr/w:dropDownList" \
  --action append \
  --xml '<w:listItem xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:displayText="Engineering" w:value="Engineering"/><w:listItem xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:displayText="Finance" w:value="Finance"/>'
```

### Path C — Word template (beyond raw-set)

**Use when**: `picture` SDT (signature image), real SDT checkbox (`type=checkbox` exits 1), `placeholderDocPart` prompt text, grouped SDTs wrapping multiple paragraphs, or custom richtext appearance. These involve cross-part relationships or nesting beyond `--prop` reach.

```bash
# One-time in Word: Developer tab → Insert Content Control → Save as template.docx
cp templates/onboarding_with_signature.docx "$FILE"
officecli open "$FILE"
officecli view "$FILE" forms                 # inspect embedded controls + paths
officecli set "$FILE" '/body/sdt[@sdtId=3]' --prop text="Jane Smith"
officecli set "$FILE" / --prop protection=forms
```

### Decision table

| Need                                             | Path             | Note                                                            |
| ------------------------------------------------ | ---------------- | --------------------------------------------------------------- |
| text / richtext SDT with default string          | **A**            | four canonical props cover it                                   |
| text SDT that must be locked                     | **A + set lock** | `lock` only takes effect via `set`, not `add`                   |
| dropdown / combobox **with options**             | **B**            | raw-set append `<w:listItem>`                                   |
| date SDT with non-default format                 | **B**            | raw-set setattr `w:dateFormat/@w:val`                           |
| real checkbox                                    | **FormField**    | `--type formfield --prop type=checkbox` (see §Legacy FormField) |
| mail-merge placeholder                           | **MERGEFIELD**   | `--type field --prop fieldType=mergefield` (see §MERGEFIELD)    |
| signature picture, grouped SDT, placeholder part | **C**            | build skeleton in Word, fill via CLI                            |

## Quick Start — Path A + FormField (minimal intake form)

Two SDT text fields, one checkbox, protection. Paste and adapt; this is the smallest form worth shipping.

```bash
FILE=intake.docx
officecli close "$FILE" 2>/dev/null; rm -f "$FILE"   # preflight: clear stale resident / prior file (cold-start after CLI upgrade commonly leaks a resident)
officecli create "$FILE"
officecli open "$FILE"

officecli set "$FILE" / --prop title="Employee Onboarding Intake" \
  --prop docDefaults.font="Calibri" --prop docDefaults.fontSize="12pt"

officecli add "$FILE" /body --type paragraph \
  --prop text="Employee Onboarding Intake" --prop style=Heading1 \
  --prop size=20 --prop bold=true --prop spaceAfter=18pt

officecli add "$FILE" /body --type paragraph \
  --prop text="Full Name:" --prop size=11 --prop bold=true --prop spaceAfter=4pt
officecli add "$FILE" /body --type sdt --prop type=text \
  --prop alias="Full Name" --prop tag=full_name --prop text="Enter full name"

officecli add "$FILE" /body --type paragraph \
  --prop text="Start Date:" --prop size=11 --prop bold=true --prop spaceAfter=4pt
officecli add "$FILE" /body --type sdt --prop type=date \
  --prop alias="Start Date" --prop tag=start_date

officecli add "$FILE" /body --type paragraph \
  --prop text="Read and agree to employee handbook" --prop size=11 --prop spaceAfter=4pt
officecli add "$FILE" /body --type formfield \
  --prop type=checkbox --prop name=agree_handbook --prop checked=false

officecli set "$FILE" '/body/sdt[1]' --prop lock=sdtlocked
officecli set "$FILE" '/body/sdt[2]' --prop lock=sdtlocked
officecli set "$FILE" / --prop protection=forms
officecli close "$FILE"
officecli view "$FILE" forms
```

## Path B — raw-set recipes

Three recipes cover almost every complex-attr need on SDT forms.

### B1 — Dropdown items (append)

```bash
# Skeleton (Path A)
officecli add "$FILE" /body --type sdt --prop type=dropdown \
  --prop alias="Department" --prop tag=dept

# Inject items
officecli raw-set "$FILE" /document \
  --xpath "//w:sdt[w:sdtPr/w:tag/@w:val='dept']/w:sdtPr/w:dropDownList" \
  --action append \
  --xml '<w:listItem xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:displayText="Engineering" w:value="Engineering"/><w:listItem xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:displayText="Finance" w:value="Finance"/><w:listItem xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:displayText="HR" w:value="HR"/>'

# Verify
officecli get "$FILE" '/body/sdt[1]'   # expect: type=dropdown items=Engineering,Finance,HR
```

**Template.** Swap `<TAG>` / `<LABEL>` / `<VALUE>` only. `xmlns:w=...` is required on every root `<w:listItem>` — raw-set does not inherit namespace prefixes. Chain multiple `<w:listItem>`s in one call; option order is preserved.

### B2 — Combobox items (same as B1, different xpath tail)

```bash
officecli add "$FILE" /body --type sdt --prop type=combobox \
  --prop alias="Current Medication" --prop tag=current_med

officecli raw-set "$FILE" /document \
  --xpath "//w:sdt[w:sdtPr/w:tag/@w:val='current_med']/w:sdtPr/w:comboBox" \
  --action append \
  --xml '<w:listItem xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:displayText="Antihypertensives" w:value="Antihypertensives"/><w:listItem xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:displayText="Insulin" w:value="Insulin"/><w:listItem xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:displayText="Other (specify)" w:value="Other"/>'
```

Only difference from B1: `w:comboBox` vs `w:dropDownList` in the xpath tail. Combobox lets the user type custom input; dropdown does not.

### B3 — Date format (setattr)

```bash
officecli add "$FILE" /body --type sdt --prop type=date \
  --prop alias="Contract Start Date" --prop tag=contract_start

# Chinese: yyyy年MM月dd日
officecli raw-set "$FILE" /document \
  --xpath "//w:sdt[w:sdtPr/w:tag/@w:val='contract_start']/w:sdtPr/w:date/w:dateFormat" \
  --action setattr \
  --xml "w:val=yyyy年MM月dd日"

# US:    w:val=MM/dd/yyyy
# ISO:   w:val=yyyy-MM-dd  (already the default)
# Long:  w:val="MMMM d, yyyy"

officecli get "$FILE" '/body/sdt[N]'   # expect: type=date format=yyyy年MM月dd日
```

`setattr` replaces one attribute — do not quote the value inside `--xml`. Only `w:val` is touched; the `<w:dateFormat>` wrapper is preserved.

### raw-set actions & errors

| `--action` | Form use                                                         |
| ---------- | ---------------------------------------------------------------- |
| `append`   | Insert new child at end of target (B1, B2 — listItem)            |
| `setattr`  | Change one attribute; `--xml "key=value"` (B3 — dateFormat/@val) |
| `replace`  | Replace entire target (rare — reset a full `<w:date>` wrapper)   |
| `remove`   | Delete the target (clear options before re-populate)             |

| Symptom                                                         | Fix                                                                                                                                                   |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `raw-set: 0 element(s) affected`                                | XPath did not match. Check the `tag` value and whether the SDT is block or inline. Fall back to `officecli raw $FILE /document` to read the real XML. |
| `Error: prefix 'w' is not defined`                              | Missing `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"` on the fragment — every root element in `--xml` needs it.            |
| Items readback empty after append                               | `<w:dropDownList/>` must already exist (Path A `type=dropdown` ensures this). If absent, append has nowhere to insert.                                |
| `VALIDATION: N new error(s) introduced` on same line as success | Your append introduced a schema-invalid child. Treat as stop-and-fix even though `raw-set` exits 0.                                                   |

## Path C — Word template workflow

For fields CLI cannot express (signature `picture` SDT, real SDT checkbox, `placeholderDocPart` prompt text, grouped SDTs, custom richtext styling), build the skeleton once in Word, then fill via CLI.

**One-time in Word:** File → Options → Customise Ribbon → Developer. Developer tab → Insert Picture / Check Box / Grouping Content Control → right-click → Properties → set Title (`alias`) + Tag. Save as `template.docx`.

**Fill via CLI:**

```bash
cp templates/onboarding_with_signature.docx "$FILE"
officecli open "$FILE"
officecli view "$FILE" forms                                    # see /body/... paths + sdtId values
officecli set "$FILE" '/body/sdt[@sdtId=3]' --prop text="Jane Smith"
officecli set "$FILE" / --prop protection=forms
officecli close "$FILE"
```

## MERGEFIELD (data-driven track)

`help docx field` on v1.0.63 declares a `fieldType` enum of ~30 values including `mergefield`, `ref`, `pageref`, `seq`, `if` — all CLI-expressible with their typed props. MERGEFIELD coexists with SDT in the same file but is reported by `query field` only; `view forms` does NOT list MERGEFIELDs (they are not user-fillable).

**Canonical MERGEFIELD:**

```bash
officecli add "$FILE" /body --type paragraph --prop text="Dear "
officecli add "$FILE" '/body/p[1]' --type field --prop fieldType=mergefield --prop name=CustomerName
officecli add "$FILE" '/body/p[1]' --type run --prop text=", "
officecli add "$FILE" '/body/p[1]' --type field --prop fieldType=mergefield --prop name=CompanyName
# Readback: "Dear «CustomerName», «CompanyName»"
```

**Element-type shortcut** (equivalent): `officecli add "$FILE" '/body/p[1]' --type mergefield --prop name=CustomerName`.

### Common field patterns

| Pattern                                          | Call shape                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mail-merge placeholder                           | `--type field --prop fieldType=mergefield --prop name=<FieldName>`                                                                                                                                                                                                                                                                                                                 |
| Mail-merge with numeric picture (money, percent) | `--type field --prop fieldType=mergefield --prop name=Amount --prop instr='MERGEFIELD Amount \# "#,##0.00"'`. On v1.0.63 the typed `format` prop is ignored for mergefield (prints a warning) — use `instr` (alias `instruction`) to embed the full field code. Verify: `query "$FILE" field --json \| jq '.data.results[].format.instruction'` must contain `\#` and the picture. |
| Mail-merge with date picture                     | `--type field --prop fieldType=mergefield --prop name=StartDate --prop instr='MERGEFIELD StartDate \@ "yyyy-MM-dd"'`                                                                                                                                                                                                                                                               |
| Cross-reference to bookmark text                 | `--type field --prop fieldType=ref --prop name=<BookmarkName>`                                                                                                                                                                                                                                                                                                                     |
| Cross-reference to bookmark's page number        | `--type field --prop fieldType=pageref --prop name=<BookmarkName>`                                                                                                                                                                                                                                                                                                                 |
| Auto-numbering (Figure 1 / 2 / 3)                | `--type field --prop fieldType=seq --prop identifier=Figure`                                                                                                                                                                                                                                                                                                                       |
| Page number in footer                            | `--type field --prop fieldType=page`                                                                                                                                                                                                                                                                                                                                               |
| "Page X of Y"                                    | two fields: `fieldType=page` + `fieldType=numpages`                                                                                                                                                                                                                                                                                                                                |
| Conditional text                                 | `--type field --prop fieldType=if --prop expression='{ MERGEFIELD Gender } = "Male"' --prop trueText="Mr." --prop falseText="Ms."`                                                                                                                                                                                                                                                 |

### IF conditional (CLI-expressible on v1.0.63)

```bash
officecli add "$FILE" /body --type paragraph --prop text=""
officecli add "$FILE" '/body/p[last()]' --type field --prop fieldType=if \
  --prop expression='{ MERGEFIELD Gender } = "Male"' \
  --prop trueText="Mr." --prop falseText="Ms."
officecli add "$FILE" '/body/p[last()]' --type run --prop text=" "
officecli add "$FILE" '/body/p[last()]' --type field --prop fieldType=mergefield --prop name=LastName
# Merge-time result: "Mr. «LastName»" or "Ms. «LastName»"
```

Nested wrappers like `{ IF { MERGEFIELD X } = "Y" { REF bm } "fallback" }` are not expressible via `--prop` chaining — drop to raw-set a hand-crafted `<w:fldChar>` / `<w:instrText>` fragment, or build once in a Word template (Path C).

**Readback.** `query $FILE field` lists `/field[N]` + instruction + `fieldType`. `view $FILE forms` does NOT list MERGEFIELDs (only SDT + formfield) — they are template-time, not end-user fillable. `get $FILE '/body/p[1]'` renders the guillemet-wrapped field name.

## Legacy FormField

Use FormField **when you need a real checkbox**. For text/dropdown, prefer SDT.

`help docx formfield`: `type` (text/checkbox/check/dropdown), `name` (required, **≤ 20 chars** — OpenXML schema MaxLength; add passes longer but `validate` rejects), `text` (text only, alias `value`), `checked` (checkbox only).

```bash
# CHECKBOX — the only real checkbox available in v1.0.63
officecli add "$FILE" /body --type formfield --prop type=checkbox \
  --prop name=agree_terms --prop checked=false

# TEXT formfield
officecli add "$FILE" /body --type formfield --prop type=text \
  --prop name=emp_name --prop text="Enter name"

# DROPDOWN formfield — items NOT settable via CLI; use Word template or SDT Path B
officecli add "$FILE" /body --type formfield --prop type=dropdown --prop name=dept_select

# Read / modify by name (stable) or 1-based index
officecli get "$FILE" '/formfield[agree_terms]'
officecli set "$FILE" '/formfield[agree_terms]' --prop checked=true
officecli set "$FILE" '/formfield[emp_name]' --prop text="Jane Smith"
officecli set "$FILE" '/formfield[dept_select]' --prop text="Engineering"
```

FormField paths (`/formfield[N]` or `/formfield[<name>]`) are separate from SDT paths (`/body/sdt[N]`). Both coexist; `protection=forms` covers both.

**Scale.** Tested with 50+ checkboxes in a single document — no practical cap on formfield count; build and `validate` remain clean. `name` ≤ 20 chars (K13) is the only hard constraint.

**Renderer note — formfield checkbox `[RENDERER-BUG]`.** LibreOffice's PDF export occasionally renders the formfield checkbox as `☐☐` (doubled box). Word and WPS render a single clickable box (toggles ☑). This is a LibreOffice renderer quirk, **not a skill or document quality issue** — see K19. Do not attempt workarounds in the form; if an evaluator screenshots a LibreOffice-generated PDF and sees `☐☐`, attribute to `[RENDERER-BUG]`.

## Document protection & lock

### Enabling form protection

```bash
officecli set "$FILE" / --prop protection=forms
officecli get "$FILE" /                                  # look for: protectionEnforced=True
```

### Protection modes

| Mode             | Word user can                  | CLI behavior                      |
| ---------------- | ------------------------------ | --------------------------------- |
| `forms`          | Fill SDT + formfield only      | All ops work; no `--force` needed |
| `readOnly`       | Read only                      | All ops work                      |
| `comments`       | Add comments only              | All ops work                      |
| `trackedChanges` | Edit with tracked changes only | All ops work                      |
| `none`           | Full editing                   | All ops work                      |

**KEY:** Document protection restricts **Word users**, not the CLI. You can fill / modify / lock a protected form via CLI freely. The CLI does NOT require `--force` on v1.0.63.

### Lock values (applied via `set`, never `add`)

```bash
officecli set "$FILE" '/body/sdt[1]' --prop lock=sdtlocked           # content editable; control cannot be deleted
officecli set "$FILE" '/body/sdt[1]' --prop lock=contentlocked       # content read-only; control can be deleted
officecli set "$FILE" '/body/sdt[1]' --prop lock=sdtcontentlocked    # both locked
# Omit lock entirely → unlocked (default)
```

`--prop lock=...` on `add` is UNSUPPORTED (silently discarded). Apply lock via a separate `set`. Readback normalises to camelCase (`sdtLocked`) regardless of input case — both accepted.

### lock × `protection=forms` interaction

| lock value                           | `protection=forms` active | Word user can edit?                                       | Word user can delete control? |
| ------------------------------------ | ------------------------- | --------------------------------------------------------- | ----------------------------- |
| (none)                               | yes                       | **Yes**                                                   | **Yes**                       |
| `sdtlocked`                          | yes                       | Yes                                                       | No                            |
| `contentlocked`                      | yes                       | No                                                        | Yes                           |
| `sdtcontentlocked`                   | yes                       | No                                                        | No                            |
| block-level SDT wrap `contentlocked` | any                       | No (wrapped paragraph read-only regardless of protection) | No                            |
| any                                  | `readOnly` mode           | No                                                        | No                            |

### Block-level lock (paragraph-wrapping SDT)

`protection=forms` is document-level — once an admin unprotects, every static paragraph (disclaimer, legal attestation, contract clause) becomes editable again. Master templates need defense-in-depth: wrap the critical paragraph in a block-level `<w:sdt>` with `lock=contentLocked`, so the content stays read-only even after protection is stripped.

```bash
officecli add "$FILE" /body --type paragraph \
  --prop text="I authorize the above and acknowledge all clauses." --prop size=11 --prop spaceAfter=12pt
PID=$(officecli query "$FILE" paragraph --json | jq -r '.data.results[-1].format.paraId')

# v1.0.63 raw-set actions: append | prepend | insertbefore | insertafter | replace | remove | setattr
# No `wrap` action — two-step instead: (1) insertbefore an empty <w:sdt><w:sdtContent/></w:sdt>,
# (2) move the original <w:p> inside by `replace` on the sdtContent with a copy of the paragraph XML.
# Simpler alternative: read the paragraph XML via `officecli raw`, then `replace` the whole <w:p> with <w:sdt>...<w:sdtContent>[original w:p]</w:sdtContent></w:sdt>:
PARA_XML=$(officecli raw "$FILE" /document | awk "/w14:paraId=\"$PID\"/,/<\\/w:p>/" | tr -d '\n')
officecli raw-set "$FILE" /document \
  --xpath "//w:p[@w14:paraId='$PID']" \
  --action replace \
  --xml "<w:sdt xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" xmlns:w14=\"http://schemas.microsoft.com/office/word/2010/wordml\"><w:sdtPr><w:alias w:val=\"Authorization\"/><w:tag w:val=\"auth_para\"/><w:lock w:val=\"contentLocked\"/></w:sdtPr><w:sdtContent>${PARA_XML}</w:sdtContent></w:sdt>"
```

Verify with `query sdt --json | jq '.data.results[] | select(.format.lock == "contentLocked" and .format.type == "block")'`. Use only for legal attestations, compliance disclaimers, confidentiality clauses — regular intake fields do not need this.

### Role-gated fields (multi-role forms)

When one form is filled by two roles (patient vs physician; Party A vs Party B), use `lock=contentLocked` on the fields the other role must not touch. Under `protection=forms`, `contentLocked` SDTs display as read-only in Word; the intended role unprotects (or the admin swaps role-specific copies) to fill the other half.

```bash
# Patient section — editable (no lock, or sdtlocked to prevent accidental deletion only)
officecli set "$FILE" '/body/sdt[1]' --prop lock=sdtlocked      # patient_name
officecli set "$FILE" '/body/sdt[2]' --prop lock=sdtlocked      # patient_dob

# Physician section — locked against patient edits
officecli set "$FILE" '/body/sdt[14]' --prop lock=contentLocked # physician_diagnosis
officecli set "$FILE" '/body/sdt[15]' --prop lock=contentLocked # physician_signature
```

This is the core pattern for medical intake, two-party contracts, sequential-approval forms.

## Recipe — Contract / SOW template with MERGEFIELD + signature

Row-map across the three sub-recipes: SDT[1]=project_name, SDT[2]=contract_start, SDT[3]=payment_schedule, SDT[4]=signatory_name (inline). Run (sow-a) → (sow-b) → (sow-c) in order on the same `$FILE`; each sub-recipe stays under 20 lines so a shell-escape slip never cascades past one block.

### Recipe (sow-a) Boilerplate + cover + parties

Creates the file, sets docDefaults, writes the title / intro, and drops the two MERGEFIELD placeholders (`CustomerName`, `ContractNo`) that downstream mail-merge will fill.

```bash
FILE=sow.docx
officecli create "$FILE"
officecli open "$FILE"
officecli set "$FILE" / --prop title="Statement of Work" \
  --prop docDefaults.font="Calibri" --prop docDefaults.fontSize="12pt"

officecli add "$FILE" /body --type paragraph --prop text="Statement of Work" \
  --prop style=Heading1 --prop size=20 --prop bold=true --prop spaceAfter=12pt
officecli add "$FILE" /body --type paragraph \
  --prop text="This Statement of Work ('SOW') is entered into between the parties identified below and governs the delivery of professional services." \
  --prop size=11 --prop spaceAfter=12pt

officecli add "$FILE" /body --type paragraph --prop text="Customer: "
officecli add "$FILE" '/body/p[last()]' --type field \
  --prop fieldType=mergefield --prop name=CustomerName
officecli add "$FILE" /body --type paragraph --prop text="Contract #: "
officecli add "$FILE" '/body/p[last()]' --type field \
  --prop fieldType=mergefield --prop name=ContractNo
```

### Recipe (sow-b) SDT fields + Path B raw-set specials

Adds the three block-level SDTs (project / date / dropdown), the inline signature SDT anchored via `--after 'find:Client Signature:'`, then Path B raw-set to inject the date format and dropdown items (both are UNSUPPORTED via `add --prop`).

```bash
officecli add "$FILE" /body --type sdt --prop type=text \
  --prop alias="Project Name" --prop tag=project_name --prop text="Enter project name"
officecli add "$FILE" /body --type sdt --prop type=date \
  --prop alias="Contract Start Date" --prop tag=contract_start
officecli add "$FILE" /body --type sdt --prop type=dropdown \
  --prop alias="Payment Schedule" --prop tag=payment_schedule
officecli add "$FILE" /body --type paragraph --prop text="Client Signature:" \
  --prop bold=true --prop spaceBefore=18pt --prop spaceAfter=4pt
officecli add "$FILE" /body --type sdt --prop type=text \
  --prop alias="Signatory Name" --prop tag=signatory_name --prop text="Authorized Signatory" \
  --after 'find:Client Signature:'
officecli raw-set "$FILE" /document \
  --xpath "//w:sdt[w:sdtPr/w:tag/@w:val='contract_start']/w:sdtPr/w:date/w:dateFormat" \
  --action setattr --xml "w:val=MM/dd/yyyy"
officecli raw-set "$FILE" /document \
  --xpath "//w:sdt[w:sdtPr/w:tag/@w:val='payment_schedule']/w:sdtPr/w:dropDownList" \
  --action append \
  --xml '<w:listItem xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:displayText="Full Prepayment" w:value="Full Prepayment"/><w:listItem xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:displayText="Net 30 Upon Delivery" w:value="Net 30 Upon Delivery"/>'
```

### Recipe (sow-c) Watermark + locks + document protection

Drops the CONFIDENTIAL watermark (parent is `/`, never `/body`), locks the three block-level SDTs, instructs how to lock the inline signatory_name SDT (path only known after `view forms`), then seals the document with `protection=forms` as the last command.

```bash
officecli add "$FILE" / --type watermark \
  --prop text="CONFIDENTIAL" --prop color=FF0000 --prop rotation=315

officecli set "$FILE" '/body/sdt[1]' --prop lock=sdtlocked
officecli set "$FILE" '/body/sdt[2]' --prop lock=sdtlocked
officecli set "$FILE" '/body/sdt[3]' --prop lock=sdtlocked
officecli view "$FILE" forms   # copy signatory_name path, then: set '/body/p[@paraId=...]/sdt[1]' --prop lock=sdtlocked

officecli set "$FILE" / --prop protection=forms
officecli close "$FILE"
officecli query "$FILE" field     # expect 2 MERGEFIELDs: CustomerName, ContractNo
```

## Design principles (forms)

**Control-type decision tree:**

```
Date → type=date | Fixed list → type=dropdown | List + custom → type=combobox
Short text → type=text | Long text → type=richtext | Boolean → formfield checkbox
```

**Typography scale.** Spacing unit trap: `spaceBefore` / `spaceAfter` / `spaceLine` default to **twips** (1/20 pt) — always write `spaceBefore=18pt`.

| Element              | Size | Style                 | Spacing                              |
| -------------------- | ---- | --------------------- | ------------------------------------ |
| Form title (H1)      | 20pt | Bold                  | `spaceBefore=0pt`, `spaceAfter=12pt` |
| Section heading (H2) | 14pt | Bold                  | `spaceBefore=18pt`, `spaceAfter=8pt` |
| Field label          | 11pt | Bold                  | `spaceAfter=4pt`                     |
| Instructions / notes | 11pt | Italic `color=666666` | `spaceAfter=18pt`                    |

**Accessibility bump.** For medical / geriatric / accessibility-focused forms, raise field label + instruction to **12pt** (11pt default is tight for older users); keep section headings at 14pt.

**CJK forms:** set `docDefaults.font="Microsoft YaHei"` — Calibri lacks Chinese glyphs.

**Field ordering.** (1) Personal / ID, (2) role / classification, (3) dates, (4) supplemental free-text, (5) confirmation / signature.

**Yes/No + conditional follow-up** (common in compliance / medical intake): formfield checkbox followed by a richtext SDT whose `alias` carries the cue — e.g. `--type formfield --prop type=checkbox --prop name=has_cond` then `--type sdt --prop type=richtext --prop alias="If yes, explain" --prop tag=cond_detail --prop text="If yes, explain here"`.

**Signature block order.** Label on its own paragraph, SDT on the next paragraph (with `spaceBefore=18pt` on the label, `spaceAfter=4pt` on the SDT). Never `Label: SDT` inline — Word renders the runs as touching, visually stuck together.

**Build order.** create+open → metadata → structure (headings, label paragraphs) → SDT/formfield skeletons (Path A 4 props) → Path B injections → per-field lock → `protection=forms` LAST → close.

**Header / footer note.** Headers/footers are **predefined** when the section is created (default/first/even, 3 each). The first mutation must be `set` against the existing part, not `add` — `add $FILE /header ...` returns `already exists` or silently no-ops. Inspect first with `officecli query "$FILE" header --json` to read the `type` values, then `officecli set "$FILE" '/header[@type=default]' --prop text=...`. Only use `add` when creating an additional section with its own header/footer.

## Batch mode (brief)

For forms with many controls, batch reduces overhead. Path A + Path B coexist in one batch.

```bash
cat <<'EOF' | officecli batch "$FILE"
[
  {"command":"add","parent":"/body","type":"sdt","props":{"type":"text","alias":"Full Name","tag":"full_name","text":"Enter name"}},
  {"command":"add","parent":"/body","type":"sdt","props":{"type":"dropdown","alias":"Department","tag":"dept"}},
  {"command":"raw-set","part":"/document","xpath":"//w:sdt[w:sdtPr/w:tag/@w:val='dept']/w:sdtPr/w:dropDownList","action":"append","xml":"<w:listItem xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" w:displayText=\"Engineering\" w:value=\"Engineering\"/><w:listItem xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" w:displayText=\"Finance\" w:value=\"Finance\"/>"},
  {"command":"set","path":"/body/sdt[1]","props":{"lock":"sdtlocked"}},
  {"command":"set","path":"/body/sdt[2]","props":{"lock":"sdtlocked"}}
]
EOF
officecli set "$FILE" / --prop protection=forms
```

- Escape inner `"` in `xml` with `\"`. Use single-quoted heredoc `<<'EOF'` so `$var` does not expand.
- **P0 batch trap:** unsupported props in batch are silently dropped, **no WARNING** (interactive `add` would print WARNING: UNSUPPORTED, exit 2). Defence: send only `{type, tag, alias, text}` in SDT entries; put items/format into `raw-set` entries in the same batch.
- `batch` supports `add`, `set`, `get`, `query`, `remove`, `validate`, `raw-set` on v1.0.63.

## Delivery Gate (executable)

Run every gate below after every form. Each gate must print its `OK` line. Any `REJECT` = do not deliver.

```bash
# Assumes FILE=<your-form.docx>, document has been closed with officecli close "$FILE"

# Gate 1 — Validate (documentProtection waiver: K8 allows this ONE schema error under protection=forms)
VAL_OUT=$(officecli validate "$FILE" 2>&1)
VAL_ERRS=$(echo "$VAL_OUT" | grep -c '\[Schema\]')
VAL_PROT=$(echo "$VAL_OUT" | grep -c 'documentProtection')
if   [ "$VAL_ERRS" -eq 0 ]; then echo "Gate 1 OK (validate clean)"
elif [ "$VAL_ERRS" -eq 1 ] && [ "$VAL_PROT" -eq 1 ]; then echo "Gate 1 OK (1 documentProtection waiver — K8)"
else echo "REJECT Gate 1: $VAL_ERRS schema errors beyond the K8 waiver"; echo "$VAL_OUT"; exit 1
fi

# Gate 2 — Token / placeholder leak (labels used as visual underscore substitutes)
LEAK=$(officecli view "$FILE" text | grep -niE '_{3,}|TBD|\(fill in\)|\{\{|xxxx|lorem|placeholder')
[ -z "$LEAK" ] && echo "Gate 2 OK (no underscore / placeholder leak)" || { echo "REJECT Gate 2:"; echo "$LEAK"; exit 1; }

# Gate 3 — At least one structured field exists
SDT_N=$(officecli query "$FILE" sdt --json | jq '.data.results | length')
FF_N=$(officecli query "$FILE" formfield --json | jq '.data.results | length')
FLD_N=$(officecli query "$FILE" field --json | jq '.data.results | length')
TOTAL=$((SDT_N + FF_N + FLD_N))
[ "$TOTAL" -gt 0 ] && echo "Gate 3 OK ($SDT_N sdt + $FF_N formfield + $FLD_N field)" || { echo "REJECT Gate 3: 0 structured fields — this is not a form"; exit 1; }

# Gate 4 — Every SDT has alias + tag (skill-imposed H2)
# NOTE: v1.0.63 `query --json` wraps prop fields under `.format.{prop}` — jq paths below use `.format.alias` / `.format.tag` (not bare `.alias`).
SDT_MISSING=$(officecli query "$FILE" sdt --json | jq '[.data.results[] | select(.format.alias == null or .format.alias == "" or .format.tag == null or .format.tag == "")] | length')
[ "$SDT_MISSING" -eq 0 ] && echo "Gate 4 OK (every SDT has alias+tag)" || { echo "REJECT Gate 4: $SDT_MISSING SDT(s) missing alias or tag"; exit 1; }

# Gate 5 — Protection enforced + per-field lock inventory
PROT=$(officecli get "$FILE" / --json | jq -r '.data.format.protection // "none"')
[ "$PROT" = "forms" ] && echo "Gate 5 OK (protection=forms enforced)" || { echo "REJECT Gate 5: protection is '$PROT', expected 'forms'"; exit 1; }
officecli view "$FILE" forms | head -40   # visual spot-check: every dropdown shows items=; every date shows format=; every locked SDT shows lock=

# Gate 6 — No type=checkbox leaked onto any SDT
BAD_CB=$(officecli query "$FILE" sdt --json | jq '[.data.results[] | select(.format.type == "checkbox")] | length')
[ "$BAD_CB" -eq 0 ] && echo "Gate 6 OK (no SDT checkbox — formfield only)" || { echo "REJECT Gate 6: $BAD_CB SDT with type=checkbox"; exit 1; }
```

**Why `view issues` is not a gate.** It runs only prose-style checks (first-line-indent, heading size) and flags every form label as `Body paragraph missing first-line indent` — a false-positive avalanche on forms. Ignore for this skill. Use `validate` (schema integrity) and `view forms` (field inventory).

## Known Issues

| #   | Issue                                                                           | Behavior                                                                                                                                 | Workaround                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | SDT `type=checkbox` not implemented on v1.0.63                                  | `add ... --type sdt --prop type=checkbox` → `Error: SDT type 'checkbox' is not implemented`, exit 1                                      | Use `--type formfield --prop type=checkbox`, or Path C template                                                                                                                                                        |
| K2  | SDT `items` / `format` / `lock` UNSUPPORTED on `add`                            | `WARNING: UNSUPPORTED props`, exit 2; element created without them                                                                       | Path B `raw-set` for items/format; separate `set` for lock                                                                                                                                                             |
| K3  | SDT `placeholder` / `name` / `maxlength` UNSUPPORTED                            | `WARNING: UNSUPPORTED`, exit 2; element still created                                                                                    | Use `text` for initial content; use `alias`+`tag` instead of `name`; prompt text requires Path C                                                                                                                       |
| K4  | SDT `items` / `format` / `type` not settable after creation                     | `set --prop items=...` → `UNSUPPORTED props (use raw-set instead)`                                                                       | Path B `raw-set`, or `remove` + re-add                                                                                                                                                                                 |
| K5  | FormField `maxlength` UNSUPPORTED                                               | `WARNING: UNSUPPORTED: maxlength`; formfield created                                                                                     | Enforce length in downstream validation                                                                                                                                                                                |
| K6  | FormField dropdown `items` UNSUPPORTED                                          | Dropdown formfield is created with empty option list                                                                                     | Use SDT dropdown + Path B, or build in Word (Path C)                                                                                                                                                                   |
| K7  | Watermark `opacity` / `width` / `height` / `size` UNSUPPORTED                   | Watermark created without them; `get /watermark` still prints hardcoded `opacity=0.5`                                                    | Do not set them. For size, open Word + adjust shape (Phase 2)                                                                                                                                                          |
| K8  | `validate` reports a `documentProtection` Schema error under `protection=forms` | Prints the error line, exits **0**. Gate 1 waives this one specific error                                                                | Confirm protection with `get $FILE /` → `protectionEnforced=True`. Known validator bug, not a document bug                                                                                                             |
| K9  | Batch mode silently drops UNSUPPORTED props                                     | No `WARNING` line; batch reports "N succeeded" even when props were dropped                                                              | Pass only `{type, tag, alias, text}` in batch SDT entries; put items/format into `raw-set` entries in the same batch                                                                                                   |
| K13 | FormField `name` > 20 characters                                                | `add` returns exit 0 with no warning; `validate` later reports `[Schema] ... MaxLength=20` on `/w:ffData/w:name`                         | Keep `name` ≤ 20 characters (OpenXML schema limit). SDT `alias` / `tag` have no such limit                                                                                                                             |
| K14 | `shd.fill` on a paragraph emits schema-invalid `<w:pPr>/<w:shd>`                | `validate` reports 2 schema errors per instance (`unexpected child element`, `required attribute 'val' missing`); Word renders it anyway | Apply highlight on the run instead (`shading=HEX`, flat canonical), or raw-set `<w:shd w:val="clear" w:fill="HEX"/>` into the run's `<w:rPr>`                                                                          |
| K15 | `view forms` does NOT list MERGEFIELDs                                          | Only SDT + formfield in output; MERGEFIELDs are template-time, not end-user fillable                                                     | Treat `query field` and `view forms` as two disjoint inventories. Every recipe verifies both                                                                                                                           |
| K16 | Header / footer are predefined at section creation (default/first/even, 3 each) | `add $FILE /header ...` returns `already exists` or silently no-ops on the first call                                                    | First mutation uses `set` against the existing part: `officecli query $FILE header --json` to read `type`, then `set '/header[@type=default]' --prop text=...`. Only use `add` for a brand-new section's header/footer |
| K17 | Watermark injected into header emits `<w:noProof>` child that is schema-invalid | `validate` adds an extra `[Schema]` error at `/header[N]/w:sdt/.../w:noProof` — NOT covered by K8's documentProtection waiver            | After `add $FILE / --type watermark`, run once per header part: `officecli raw-set $FILE /word/header1.xml --xpath "//w:noProof" --action remove` (repeat for `header2.xml`, `header3.xml` if present)                 |
| K18 | `query --json` wraps prop fields under `.format.{prop}`                         | Writing jq against bare `.alias` / `.tag` / `.protection` returns 0 matches, Gate 4/5 falsely report "missing=N"                         | Always prefix jq with `.format.`: `.data.results[].format.alias`, `.data.results[].format.tag`, `.data.format.protection` (for `get /`). Same for `.format.type` and `.format.paraId`                                  |
| K19 | LibreOffice renders formfield checkbox as `☐☐` (double box) in PDF export       | Cosmetic only — Word / WPS render a single box, clickable to toggle ☑. A LibreOffice renderer quirk, flagged as [RENDERER-BUG]           | Do not try to "fix" in the skill. If an evaluator screenshots from LibreOffice-generated PDF and sees `☐☐`, attribute to [RENDERER-BUG], not a form-quality defect                                                     |

## Phase 2 — enhance in Word

Some polish is out of CLI scope. Hand the file to a human for these; none are required for a valid form.

| Need                                       | Why open Word                                                      |
| ------------------------------------------ | ------------------------------------------------------------------ |
| Signature image field (`picture` SDT)      | Cross-part relationship + media file                               |
| Real SDT checkbox with specific locking    | `type=checkbox` exits 1; use Developer → Check Box Content Control |
| Prompt text ("Click here to enter a date") | Needs `placeholderDocPart` in `/word/glossary/document.xml`        |
| Grouped SDT wrapping multiple paragraphs   | Block-level `<w:sdt>` nesting beyond `add`                         |
| Custom richtext default appearance         | Adjust the referenced style in Word's style pane                   |
| Watermark resize                           | `width` / `height` not in schema; drag shape handles               |

For the first four, build the skeleton once (Path C) and reuse.

## Help pointer

When in doubt: `officecli help docx`, `officecli help docx <element>`, `officecli help docx <element> --json`. Help is the authoritative schema; this skill is the decision guide for building real fillable Word forms on top of it.
