# Phase 0 Build Arbiter: Decision Log

**Project:** Vietnamese Stock Market Analyst
**Date:** 2026-02-21
**Genome Version:** 1.0
**Capability Tier:** Full (19 agents)

---

## Conflict Resolution Summary

**Total Conflicts:** 5

- **Critical:** 1 (resolved)
- **Major:** 2 (resolved)
- **Minor:** 2 (resolved)

**Resolution Principles Applied (in order):**

1. Dependency order wins — if A must exist before B works, A's proposal wins
2. Fewer integration points wins — simpler interfaces beat complex ones
3. Existing patterns win — proven architecture beats novel design
4. User-facing impact breaks ties — what the end-user sees matters most

---

## C1: Skill Naming Conflict (`/data` vs `data/` directory)

**Severity:** Minor
**Proposals in Conflict:**

- DevEx Designer: `/data` skill for browsing datasets
- Product Architect: `data/` directory exists for local cache

**Decision:** RENAME to `/data-sources`
**Resolution Principle:** #4 (User-facing impact)

**Rationale:**

- Avoids namespace collision between command and directory
- `/data-sources` is semantically clearer (data sources vs raw data files)
- Merge functionality with existing `/datasets` skill to avoid redundancy
- User confusion eliminated by distinct naming

**Implementation:**

- DevEx proposal: `/data` → `/data-sources`
- Merge `/data-sources` and `/datasets` into single comprehensive skill
- Skill location: `.claude/skills/data-sources/skill.md`

---

## C2: Directory Visibility (`working/` vs `_working/`)

**Severity:** Minor
**Proposals in Conflict:**

- Product Architect: `working/` for intermediate artifacts
- DevEx Designer: `_working/` to hide from casual browsing

**Decision:** RENAME to `_working/`
**Resolution Principle:** #3 (Existing patterns win)

**Rationale:**

- Precedent already set with `_build/` directory (underscore hides internal artifacts)
- Consistency across project structure improves discoverability
- Users should only see `outputs/` for final deliverables
- Minimal cost: global find-replace in agent specs

**Implementation:**

- Product proposal: Update all directory references `working/` → `_working/`
- All 19 agent specs: Update artifact paths (e.g., `_working/question_brief.md`)
- `.gitignore`: Add `_working/` pattern

---

## C3: SQL Helpers Inclusion

**Severity:** Major
**Proposals in Conflict:**

- Product Architect + Quality: Include minimal `sql_helpers.py` for future extensibility
- DevEx Designer: Omit entirely (YAGNI principle)

**Decision:** INCLUDE minimal `sql_helpers.py`
**Resolution Principle:** #3 (Existing patterns win) + #2 (Simpler interface)

**Rationale:**

- Data platform agnostic constraint requires consistent helper module structure
- Future SQL warehouse integration should have clear extension point
- Cost is negligible: ~20 lines (empty functions + docstrings)
- Contract clearly states "UNUSED for vnstock, provided for SQL warehouse compatibility"
- Simpler for users to understand "all data platforms have same helper structure"

**Implementation:**

```python
# helpers/sql_helpers.py
"""
SQL query helpers for data warehouse integration.

NOTE: This module is UNUSED for vnstock (Python library-based).
Provided for future SQL warehouse compatibility (e.g., user adds DuckDB, PostgreSQL).

For vnstock data access, use data_helpers.py instead.
"""

def execute_query(connection, query: str):
    """Execute SQL query and return DataFrame. (Stub for future use)"""
    raise NotImplementedError("SQL helpers not used with vnstock. See data_helpers.py")

def build_select_query(table: str, columns: list, filters: dict = None):
    """Build parameterized SELECT query. (Stub for future use)"""
    raise NotImplementedError("SQL helpers not used with vnstock. See data_helpers.py")
```

---

## C4: Real-Time Data Handling

**Severity:** Major
**Proposals in Conflict:**

- Product + Quality: Defer real-time-monitor agent to Phase 2
- DevEx Designer: Include basic real-time for L1 simple queries

**Decision:** INCLUDE basic real-time for L1 queries ONLY
**Resolution Principle:** #4 (User-facing impact wins)

**Rationale:**

- User expectation: "What's VNM's current price?" expects real-time, not cached
- vnstock already supports `fetch_price_board()` for real-time prices (no new API needed)
- No new agent required — data-explorer agent handles L1 queries
- Quality managed by adding timestamp staleness validation to Layer 1
- Defer: Continuous monitoring agent (real-time-monitor) to Phase 2

**Implementation:**

- data-explorer agent: Add logic for L1 real-time queries
  ```python
  if query_type == 'simple_lookup' and metric == 'current_price':
      df = vnstock_lib.fetch_price_board([symbol])  # Real-time
      validate_timestamp(df, max_age_minutes=5)  # Layer 1 check
  else:
      df = cached_query(query_spec)  # Cached for historical/complex
  ```
- Layer 1 validation: Add timestamp staleness rules
  - Real-time prices: <5 min old (else WARN)
  - Cached prices: <1 hour old (else STALE flag)
  - Financials: <24 hours old (else INFO)
- L1 response template: "VNM: 82,500 VND (updated 14:35 ICT, real-time)"

---

## C5: Internationalization (i18n) Scope

**Severity:** Critical (BLOCKS BUILD)
**Proposals in Conflict:**

- Product + Quality: Defer all i18n to Phase 2
- DevEx Designer: Include basic Vietnamese i18n NOW (greetings, formatting, labels)

**Decision:** INCLUDE basic Vietnamese i18n (formatting + labels only)
**Resolution Principle:** #4 (User-facing impact wins)

**Rationale:**

- PRIMARY AUDIENCE: Vietnamese stock market analysts/traders (not international users)
- Cultural respect: Vietnamese users expect local conventions (VND, ICT timezone, Vietnamese labels)
- Low implementation cost: ~50 lines in locale_adapter skill + chart_helpers.py
- Low quality risk: Formatting and labels (not full narrative translation, no mistranslation risk)
- Existing architecture: DevEx proposal already designed locale-adapter as auto-apply skill
- Defer: Full narrative translation (prose in Vietnamese) to Phase 2

**Scope Included (Phase 1):**

1. **Currency formatting:** 82,500 VND (not $82,500 or 82500)
2. **Number formatting:** Thousands separator = comma, decimal = dot
3. **Date/time formatting:** ISO + ICT timezone (2026-02-21 14:35 ICT)
4. **Bilingual labels:**
   - "VN30 (Rổ chỉ số 30 cổ phiếu)"
   - "HOSE (Sở Giao dịch Chứng khoán TP.HCM)"
   - "P/E (Hệ số giá trên thu nhập)"
5. **Greetings:** "Xin chào! Welcome to..." (bilingual onboarding)
6. **Ticker conventions:** 3-letter uppercase (VNM, FPT, VCB)

**Scope Deferred (Phase 2):**

- Full narrative translation (analysis reports in Vietnamese)
- Vietnamese language mode (user types questions in Vietnamese)
- Translation validation (Quality Designer's concern)

**Implementation:**

- locale_adapter skill: Implement formatting functions
- chart_helpers.py: Add VND currency formatter, Vietnamese date formatter
- onboarding flow: Bilingual greeting + labels
- genome_config.yaml: Add `locale: 'vi-VN'` field (used by locale_adapter)

---

## Additional Resolutions (From Cross-Reviews)

### R1: Confidence Score Weight Adjustment

**Source:** Quality Designer review of Product proposal
**Issue:** Presentation accuracy weighted at only 10% in confidence formula
**Disagreement:** If charts wrong (Layer 4 RED flag), confidence should drop more

**Decision:** ADJUST confidence formula weights
**Original:** 30% data, 40% stats, 20% logic, 10% presentation
**Revised:** 25% data, 40% stats, 20% logic, 15% presentation

**Rationale:**

- Charts are primary user-facing artifact (more important than raw data quality)
- 5% chart error should drop confidence from A to C (current formula: A to B)
- Principle #4: User-facing impact matters most

### R2: Presentation Confidence Threshold

**Source:** Quality Designer proposal
**Issue:** Confidence scoring system needs red flag escalation for chart errors

**Decision:** ADD presentation accuracy threshold

- Chart-data mismatch >2%: YELLOW flag, confidence capped at B (89)
- Chart-data mismatch >5%: RED flag, confidence capped at D (69), auto-escalate

**Rationale:**

- Charts users trust but shouldn't (more dangerous than obvious data errors)
- Hard threshold prevents misleading high-confidence bad charts

---

## Extensions Integrated into BUILD_PLAN

**From Product Architect Review (29 extensions):**

- Add confidence score to all agent handoffs
- Add vnstock source consistency validation
- Add HANDOFF_ARTIFACTS to CONTRACT schema
- Add DATA_PLATFORM_AGNOSTIC flag to CONTRACT
- Add Template F: Data Platform Adapter acceptance criteria
- (24 more extensions integrated — see BUILD_PLAN for full list)

**From Quality Systems Designer Review (30 extensions):**

- Add .knowledge/validation/ directory for validation reports
- Add \_build/QUALITY_LOG.md for validation events
- Add quality checkpoints to agent DAG (4 quality gates)
- Add source variance check (KBS vs VCI >2% flagged)
- Add cache validation (integrity, hit rate monitoring)
- (25 more extensions integrated — see BUILD_PLAN for full list)

**From DevEx Designer Review (29 extensions):**

- Add user-visible agent names for progress indicators
- Add time estimates per agent
- Add progress visualization for L3-L5 queries
- Add /quality, /health, /role, /glossary, /cache skills (7 new skills)
- Add outputs/quick_answers/ for L1/L2 results
- (24 more extensions integrated — see BUILD_PLAN for full list)

---

## Final Architecture Summary

**Directory Structure Changes:**

- `working/` → `_working/` (hide intermediate artifacts)
- Added: `helpers/sql_helpers.py` (minimal, future-proofing)
- Added: `.knowledge/validation/` (quality reports)
- Added: `outputs/quick_answers/` (L1/L2 results)

**Skill Changes:**

- `/data` → `/data-sources` (merge with `/datasets`)
- Added: `/quality`, `/health`, `/role`, `/glossary`, `/cache` (7 total new skills)
- Total skills: 30 (original) + 7 (new) = **37 skills**

**Agent Changes:**

- All 19 agents: Update artifact paths (`working/` → `_working/`)
- data-explorer: Add real-time price fetching for L1 queries
- All agents: Add confidence score to output frontmatter
- All agents: Add CONTRACT blocks with extended schema

**Quality System Changes:**

- Confidence formula: 25% data, 40% stats, 20% logic, 15% presentation
- Layer 1 validation: Add timestamp staleness rules (real-time <5min, cached prices <1h, financials <24h)
- Layer 4 validation: Chart mismatch >5% = RED flag + auto-escalate

**DevEx Changes:**

- locale_adapter: Implement basic Vietnamese i18n (formatting + labels)
- Onboarding: Add bilingual greeting ("Xin chào! Welcome to...")
- Progress indicators: Show user-friendly agent names + time estimates
- L1 queries: Display real-time prices with timestamps

---

## Conflict Resolution Statistics

**By Principle:**

- Principle #1 (Dependency order): 0 conflicts
- Principle #2 (Simpler interfaces): 1 conflict (C3 - SQL helpers)
- Principle #3 (Existing patterns): 2 conflicts (C2 - directory naming, C3 - future-proofing)
- Principle #4 (User-facing impact): 3 conflicts (C1 - naming, C4 - real-time, C5 - i18n)

**By Outcome:**

- Product Architect wins: 1 (C3 - include sql_helpers)
- Quality Designer wins: 0 (all proposals accepted with extensions)
- DevEx Designer wins: 3 (C1 - naming, C4 - real-time, C5 - i18n)
- Compromises: 1 (C2 - adopted existing pattern from \_build/)

**Total Changes to Original Proposals:**

- Directory renames: 1 (`working/` → `_working/`)
- Skill renames: 1 (`/data` → `/data-sources`)
- Skills added: 7 (quality, health, role, glossary, cache, etc.)
- Features added: 2 (real-time L1 queries, basic Vietnamese i18n)
- Helper modules added: 1 (`sql_helpers.py` minimal stub)

---

## Build Arbiter Certification

I, the Build Arbiter, certify that:

1. ✅ All 5 conflicts resolved with clear rationale
2. ✅ All conflict resolution principles applied consistently
3. ✅ All cross-review extensions evaluated and integrated where appropriate
4. ✅ Final architecture is coherent, buildable, and meets user needs
5. ✅ BUILD_PLAN.md and BUILD_STATUS.yaml ready for Phase 1 implementation

**Next Step:** Proceed to Phase 1 Agent Implementation with this canonical architecture.

---

**Powered by AI Analyst Lab | aianalystlab.ai**
**Build Arbiter:** Claude Sonnet 4.5
**Date:** 2026-02-21
