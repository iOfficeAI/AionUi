---
name: icp-persona-panel
description: Stress-test ANY assumption — a product, feature, ad, landing page, headline, offer, or pricing model — by spawning 12–30 agents that each fully inhabit a distinct, realistic person from the target group (varied across sub-segments AND markets), having them react brutally honestly (most should NOT convert), then adversarial judges, then a decision-grade synthesis. This is the "30 agents that ARE your target group test it" panel — the engine behind a war-game. Use BEFORE committing to an offer/price/ad/headline/feature, when the user asks "would my target group actually buy this / click this / pay this", when validating a campaign, or whenever a message "tests well in the room" (that's when monoculture hides). For Command EVE this is a core product capability — EVE runs the panel WITH the operator on their own offer before they spend, then the operator runs it on their clients' offers.
---

# ICP Persona Panel

A persona panel is the inverse of asking your team "does this sound good?". Instead of one optimistic room,
you spawn **12–30 agents that each BECOME a different, realistic person from the target group** — varied across
sub-segments *and* markets — let each react **honestly** (most will NOT convert), then send **adversarial
judges** at the rosy read, and only then synthesize. The output is not a vibe — it is a **fit-distribution +
a decision**: does this offer/ad/price actually land, on whom, and where is the honest evidence still missing.
It is the engine behind a war-game: run the same panel on competing offers, prices, or headlines and compare.

## When to use
- **Before** committing to an offer, product, feature, ad, landing page, headline, or pricing model.
- When the user asks "would my target group actually buy / click / pay this", "test this on my audience", "war-game this price".
- When testing a campaign or message — and especially when it "tested well in the room" (small homogeneous rooms hide monoculture).
- To compare options head-to-head: run the panel on A vs B (two prices, two headlines, two offers) and rank.

## The method
Run it as phases — fan-out, react, attack, synthesize. Do NOT collapse them; the value lives in the separation.

1. **DEFINE the thing under test + the ICP + the markets.** State flatly *what* is being validated
   (paste the actual ad/headline/offer/price — never a paraphrase), *who* the target group is, and *which
   markets* (e.g. DE / AT / CH, or DE vs US). Pin the success bar: what would count as validated?
2. **GENERATE a varied persona matrix.** Build attribute arrays — e.g. **sophistication** (skeptic / pragmatist /
   early-adopter), **revenue/size** (solo / small / scaling), **attitude** (burned-before / curious / loyal-to-incumbent),
   **role** (economic buyer / champion / user / blocker) — and cross them **× markets** → **12–30 distinct personas**.
   Each persona gets a one-line spine: who they are, their incumbent, their budget reality, their bias.
   The matrix MUST span sub-segments and markets — a panel of 30 clones is worthless (see monoculture flag).
3. **Each persona reacts via a STRUCTURED schema** — spawn them, instruct each to *fully inhabit* the person and be
   **brutally honest, not a bull**. Most personas should land at "no" or "not yet"; a panel where everyone converts is a
   broken panel. Each returns exactly:
   - `would_try` (yes/no) · `would_pay` (yes/no + at what price) · `fit_score` (0–10)
   - `killer_or_hype` (the one thing that would make them act — or the word that screams "marketing")
   - `whats_missing` (what they'd need to see to convert) · `top_objection` (their single biggest "no")
   - `verdict` (one honest sentence in *their* voice, their vocabulary, not yours)
4. **ADVERSARIAL JUDGES.** Spawn a skeptic whose only job is to **refute the rosy read**: which "yes" votes are soft
   or socially-desirable, which fit-scores are inflated, is the sample stacked toward easy converters, is any "win"
   actually generic hype that any product could claim? The skeptic **ranks** the personas by how load-bearing each
   reaction really is and flags every place the panel is flattering itself.
5. **SYNTHESIZE — decision-grade.** Produce: the **fit-distribution** (how scores cluster, and across which
   segments/markets), **what genuinely wins vs what is hype**, the **must-haves** to convert the fence-sitters, the
   **honest evidence gaps**, and a **verdict** (ship / fix-then-ship / kill). Then split the two questions that always
   get conflated: does this **validate distribution** (people will look/click) vs does it **validate the solvent buyer**
   (the person with budget will actually pay)? A pretty distribution with no solvent buyer is a trap.

## Output
- The **persona matrix** (the attribute × market grid) + each persona's structured reaction.
- The **fit-distribution** (score clustering by sub-segment and by market) and the **adversarial judge's** ranking + refutations.
- **What wins vs hype · must-haves · honest evidence gaps**, and the **verdict** (ship / fix-then-ship / kill).
- The decision it changes: which offer/price/headline to commit to, what to fix first, and which **beachhead segment** is actually proven.

## Key discipline
- **Honesty over flattery.** A panel that loves everything taught you nothing. Instruct every persona that "no" and
  "not yet" are the expected default — make them earn each "yes".
- **Flag monoculture.** If all personas are the same archetype/market, say so loudly: you have NOT proven a beachhead,
  only that one kind of person reacts one way. Demand spread across sub-segments and markets.
- **Separate "validates distribution" from "validates the solvent buyer".** Clicks ≠ pays. Name the solvent buyer
  explicitly and report their verdict separately from the crowd's.
- **Ground it in the SPECIFIC thing.** Paste the real ad/offer/price; never run the panel on a sanitized summary.

## For Command EVE
This is a native EVE capability, run as a multi-agent panel through Hermes (one sub-agent per persona, a skeptic
sub-agent as judge, a synthesis pass) — the same fan-out the war-game already uses.

- **EVE creates the asset.** EVE generates the **persona-matrix profile** (the attribute × market grid as reusable
  personas), spawns the panel, collects the structured schema, runs the adversarial judge, and writes the
  fit-distribution + verdict back as a saved panel the operator can re-run when the offer changes.
- **Alois self-checks first.** Before he spends on his own funnel, the operator (Alois) runs the panel on **his own**
  offer/price/headline — EVE shows him where his ICP says "no", which segment is his real beachhead, and whether his
  price clears the solvent buyer (this mirrors how the founder war-gamed 79€ + credits before committing).
- **Then Alois checks his clients.** Once Alois has clients/campaigns created in EVE, he points the same panel at a
  **client's** ad/landing page/offer before launch — the panel becomes his pre-flight quality gate, so a campaign that
  would have flopped gets caught by 30 honest target-group agents instead of by the client's spend.
- **Evidence rule.** Any claim that isn't grounded in the panel's reactions is flagged as a hypothesis to verify with
  a real test (a live ad, a price experiment) — the panel narrows the bet, it does not replace the market.
