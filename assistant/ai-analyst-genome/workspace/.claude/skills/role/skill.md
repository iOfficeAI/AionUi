# Role Skill

# Switch User Role Mid-Session

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab

## Purpose

Allow users to switch their role mid-session, which adapts communication style, detail level, chart density, and recommendation framing across all outputs.

## When to Use

- **Trigger:** `/role` command
- **Syntax:** `/role [quant|retail|trader|pm]`
- **Context:** User wants to change how analysis is communicated

## Available Roles

| Role                  | Command        | Communication Style            | Detail Level                           |
| --------------------- | -------------- | ------------------------------ | -------------------------------------- |
| **Quant Researcher**  | `/role quant`  | Technical, statistical         | High (p-values, CIs, effect sizes)     |
| **Retail Investor**   | `/role retail` | Plain language, accessible     | Low (key findings, clear actions)      |
| **Trader**            | `/role trader` | Signal-oriented, concise       | Medium (entry/exit, risk/reward)       |
| **Portfolio Manager** | `/role pm`     | Portfolio-oriented, risk-aware | Medium (alpha, tracking error, Sharpe) |

## Instructions

### On `/role` (no argument)

Display current role and all options:

```
Current role: retail

Available roles:
  /role quant   - Technical analysis with full statistical detail
  /role retail  - Plain language with clear action items (current)
  /role trader  - Signal-focused with entry/exit levels
  /role pm      - Portfolio-oriented with risk metrics
```

### On `/role [role]`

1. Update `.knowledge/user/profile.yaml` with new role
2. Confirm change: "Role updated to [role]. Future outputs will be adapted accordingly."
3. If mid-analysis: re-run storytelling and deck-creator with new audience setting

### Profile Update

```yaml
# .knowledge/user/profile.yaml
role: 'quant' # Updated by /role command
role_history:
  - { role: 'retail', set_at: '2026-02-21T14:00:00+07:00' }
  - { role: 'quant', set_at: '2026-02-21T15:30:00+07:00' }
```

## Role Impact on Pipeline

| Pipeline Stage  | How Role Affects Output                                   |
| --------------- | --------------------------------------------------------- |
| story-architect | Storyboard slide count, chart density, language level     |
| storytelling    | Executive summary style, body text register, jargon level |
| deck-creator    | Component selection, detail in speaker notes              |
| close-the-loop  | Owner assignment template, metric suggestions             |
| export (email)  | Email formality, content depth                            |

## Error Handling

| Scenario             | Action                                                                           |
| -------------------- | -------------------------------------------------------------------------------- |
| Invalid role name    | "Unknown role '[input]'. Available: quant, retail, trader, pm"                   |
| Profile file missing | Create new profile with selected role                                            |
| Mid-analysis switch  | Warn: "Role changed. Re-run `/run-pipeline` to update current analysis outputs." |

---

**Powered by AI Analyst Lab | aianalystlab.ai**
