# Question Framing Skill

## PURPOSE

Apply the Question Ladder framework to decompose user questions into structured analytical components: goal, decision, metrics, and initial hypotheses. Works in conjunction with the question-framing agent.

## TRIGGER

- Auto-applied on **all user queries** (L1-L5)
- Internal skill (no user command)

## INSTRUCTIONS

### Question Ladder Framework

Every user question is decomposed into four components:

#### 1. Goal

What is the user trying to understand?

- L1: "Know the current price of VCB"
- L2: "Understand which bank offers better value"
- L3: "Find stocks meeting specific criteria"
- L4: "Understand why a trend occurred"
- L5: "Optimize portfolio allocation"

#### 2. Decision

What investment decision will this inform?

- L1: "Whether to look deeper at this stock"
- L2: "Which stock to research further"
- L3: "Which stocks to add to watchlist"
- L4: "Whether to buy/sell/hold"
- L5: "How to allocate capital"

#### 3. Metrics

What measurable quantities are relevant?

- Extract from question: price, P/E, ROE, volume, etc.
- Add standard complementary metrics (if user asks P/E, also note P/B and ROE)
- Map to metric definitions in `.knowledge/datasets/vnstock_default/metrics/`

#### 4. Initial Hypotheses

What do we expect to find before looking at data?

- Generate 2-4 testable hypotheses based on domain knowledge
- Each hypothesis should be falsifiable with available data
- Rate testability: HIGH (data readily available) / MEDIUM / LOW

### Vietnamese Market Context

When framing questions, apply these default assumptions:

- Currency is VND unless specified otherwise
- "The market" refers to HOSE / VN-Index
- Banks: VCB, TCB, BID, CTG, VPB, MBB, ACB, STB, HDB, TPB
- Blue chips: VN30 constituents
- Typical P/E range: 5-30 for Vietnamese stocks

### Output

Write structured question brief to `_working/question_brief.md` with YAML frontmatter containing all four Question Ladder components plus entity extraction results.

---

**Powered by AI Analyst Lab | aianalystlab.ai**
