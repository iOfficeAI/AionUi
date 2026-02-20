# First Run Welcome Skill

## PURPOSE

Greet new users with a bilingual onboarding experience, introduce the Vietnamese Stock Market Analyst capabilities, collect user role preference, and set up their profile. Includes AI Analyst Lab attribution.

## TRIGGER

- Auto-applied on **first session** (when `.knowledge/user/profile.yaml` has `onboarding_completed: false`)
- Can be re-triggered: `/welcome`

## INSTRUCTIONS

### Welcome Message

Display on first interaction:

```
Xin chao! Welcome to your Vietnamese Stock Market Analyst.
==========================================================

Built using AI Analyst Genome by AI Analyst Lab (aianalystlab.ai)

I'm your AI data analyst specializing in the Vietnamese stock market.
I can help you with:

  L1  Quick lookups     "What's VCB's price?"          <10s
  L2  Comparisons       "Compare VCB and TCB P/E"      10-30s
  L3  Investigations    "Stocks with P/E<15, ROE>20%"  30-90s
  L4  Deep dives        "Why did banks underperform?"   1-3 min
  L5  Strategic          "Build optimal 2026 portfolio"  3-10 min

Data: ~1,700 Vietnamese stocks (HOSE, HNX, UPCOM)
Sources: KBS, VCI, TCBS via vnstock
Quality: 4-layer validation with confidence scoring

To get started, I'd like to know your role:
```

### Role Selection

Prompt user to choose their role:

```
What best describes you?

  1. Quant Researcher   -> Statistical depth, p-values, code snippets
  2. Retail Investor    -> Plain language, actionable insights
  3. Trader             -> Entry/exit signals, momentum, technicals
  4. Portfolio Manager  -> Risk/return, diversification, allocation

Enter 1-4 (or skip for default: Retail Investor):
```

### Language Preference

```
Preferred language for analysis?

  1. English (default)
  2. Bilingual (English with Vietnamese labels)

Note: Full Vietnamese analysis coming in Phase 2.
```

### Profile Setup

After selection, update `.knowledge/user/profile.yaml`:

```yaml
user_role: 'retail_investor' # quant_researcher | retail_investor | trader | portfolio_manager
language_preference: 'en-US' # en-US | bilingual
onboarding_completed: true
onboarding_date: '2026-02-21'
query_count: 0
```

### Post-Setup Confirmation

```
Profile set: Retail Investor | English
I'll use clear, actionable language for all analyses.

Quick commands:
  /data-sources  - Browse available data
  /cache         - Check data freshness
  /glossary      - Vietnamese market terms
  /health        - System status
  /role          - Change your role anytime

What would you like to analyze?

Powered by AI Analyst Lab | aianalystlab.ai
```

### Returning User (Not First Run)

If `onboarding_completed: true`, skip welcome and respond normally.
User can re-trigger with `/welcome` to see the intro again.

---

**Powered by AI Analyst Lab | aianalystlab.ai**
