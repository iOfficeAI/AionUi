# Knowledge Bootstrap Skill

## PURPOSE

Load dataset context at session start. Reads manifest, schema, quirks, and metric definitions from `.knowledge/` to prime the analyst with full awareness of available data, known issues, and metric definitions. Ensures every analysis starts with current context.

## TRIGGER

- Auto-applied on **session start** (before first query)
- Auto-applied when **dataset changes** (via /switch-dataset)
- Can be re-triggered: `/bootstrap`

## INSTRUCTIONS

### Session Start Sequence

On session initialization, load these files in order:

#### 1. Active Dataset

Read `.knowledge/active.yaml` to determine current dataset:

```yaml
active_dataset: 'vnstock_default'
path: '.knowledge/datasets/vnstock_default/'
last_loaded: '2026-02-21T14:30:00+07:00'
```

#### 2. Dataset Manifest

Read `.knowledge/datasets/vnstock_default/manifest.yaml`:

- Connection details (data platform, sources)
- Coverage summary (symbols, date ranges)
- Last profiling date

#### 3. Dataset Schema

Read `.knowledge/datasets/vnstock_default/schema.md`:

- Table/column documentation
- Data types and expected ranges
- Relationships between tables

#### 4. Known Quirks

Read `.knowledge/datasets/vnstock_default/quirks.md`:

- Financial lag (30-45 days for Vietnamese companies)
- Source variance (KBS vs VCI +-1-2%)
- Price limits (+-7% HOSE/HNX, +-15% UPCOM)
- Known bugs and limitations

#### 5. Metric Definitions

Read `.knowledge/datasets/vnstock_default/metrics/*.yaml`:

- pe_ratio.yaml, pb_ratio.yaml, roe.yaml, market_cap.yaml
- Formula, typical range, data source, update frequency

#### 6. User Profile

Read `.knowledge/user/profile.yaml`:

- User role (quant/retail/trader/PM)
- Language preference
- Past query patterns

#### 7. Global Frameworks

Read `.knowledge/global/frameworks.md`:

- Question Ladder framework
- Validation rules reference
- Analytical patterns

### Context Priming

After loading, the analyst has awareness of:

- What data is available and where it comes from
- Known gotchas and how to handle them
- User preferences for output style
- Metric definitions for consistent interpretation
- Quality frameworks for validation

### Health Check

During bootstrap, verify:

- [ ] Active dataset path exists
- [ ] Manifest.yaml is readable
- [ ] At least one data source is configured
- [ ] User profile exists (create default if not)

If any check fails, log warning and continue with defaults.

### Output

No visible output to user (silent initialization).
Logs bootstrap status to console:

```
[Bootstrap] Loaded vnstock_default context
[Bootstrap] 4 metric definitions loaded
[Bootstrap] User role: retail_investor
[Bootstrap] 6 known quirks loaded
[Bootstrap] Ready
```

---

**Powered by AI Analyst Lab | aianalystlab.ai**
