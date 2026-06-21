---
name: deep-research
description: Run fan-out, evidence-driven, adversarially-verified research with three modes — MARKET (size, dynamics, regulation, timing), COMPETITOR (positioning, who they target, copy/headline mechanic, pricing, and the GAP they leave unserved), and ICP/TARGET-GROUP (who needs it most NOW, solvency, reachability, the "tried-AI-and-got-stuck" signal, per market). Use when entering a market, sizing an opportunity, studying competitors before positioning, or finding/validating a target group, and whenever the user asks "is there a market for this", "who are the competitors", "who should we sell to", "research X", "size this", or "find the gap". Decompose into parallel sub-searches, fan out blind web-search/fetch agents, collect claims WITH sources + recency, then refute-by-default before trusting any load-bearing number. For Command EVE: this is a core product capability — EVE does the research a marketing/strategy hire would, and the operator "Alois" uses it to scope his own business before he builds, then to scope each client he takes on.
---

# Deep Research

Most "research" is one search and a confident summary. This is the opposite: you **split the question
into independent angles, fan out separate searches that cannot see each other, and then try to BREAK
the answer before you trust it.** The output is not a wall of links — it is a **decision-grade, cited
report** where every load-bearing number has survived an attempt to refute it, and weak evidence is
labeled weak. A research report nobody can act on (or that quietly launders a vendor's marketing
number) is theater.

## When to use
- **Entering a market** — is it real, how big, growing or dying, regulated, and is the timing right NOW.
- **Studying competitors before positioning** — what they sell-as, who they target, their headline/copy mechanic, their price, and the GAP they leave open.
- **Finding or validating a target group** — who needs it most now, can they pay, can you reach them, and do they show the "tried AI, got stuck" signal.
- Whenever the user asks "is there a market", "who are the competitors", "who should we sell to", "find the gap", "size this", or "research X" — and the answer must be defensible, not vibes.

## The method
1. **Decompose the question into parallel sub-searches.** Split by angle, by market/geo, by segment, and
   by source-type (Reddit/forums · X/HN · analyst reports · competitor sites · pricing pages · review
   sites). Pick the MODE — MARKET, COMPETITOR, or ICP/TARGET-GROUP — and let it shape the sub-questions.
   One vague query is the failure mode; many sharp ones are the method.
2. **Fan out — blind agents.** Run each sub-search as its own web-search/fetch pass that does NOT see the
   others' findings. Independence is the whole point: agents that share context converge and amplify the
   same wrong number. Cover the spread of source-types — community signal (Reddit/X/HN/forums), primary
   sites, and reports — not just the first page of Google.
3. **Collect claims WITH provenance.** For every claim, capture the source URL, the publisher, and the
   recency. **State the date.** Demand current evidence — a 2021 market number in a fast-moving space is a
   liability, not a fact. Tag each as `FACT(source, date)`, `INFERENCE(from …)`, or `HYPOTHESIS(no evidence yet)`.
4. **Adversarially verify the load-bearing claims — refute by default.** Take the numbers the conclusion
   rests on and try to KILL them. Flag anything vendor-sourced, aspirational, round-and-viral, or
   self-labeled unsourced (the classic "29.8M users / $1.7T market" stat that traces back to a single
   pitch deck citing itself). A claim that appears in ten blog posts all citing each other is ONE source,
   not ten. Seek a second independent origin; if there isn't one, downgrade it and say so.
5. **Synthesize a decision-grade, cited report.** Lead with the answer and your confidence. Be honest
   where evidence is thin — "weak signal, single source, treat as hypothesis" is more valuable than false
   certainty. Where it's a comparison, **rank and score**. Where it's COMPETITOR mode, deliver the table.
   Where it's ICP mode, deliver the per-market ranking.

## Output
- **MARKET mode:** size (with the methodology and the date), growth/dynamics, regulation, and a timing
  read (why now / why not yet) — each backed by a cited, verified source, with unverifiable numbers
  flagged as such.
- **COMPETITOR mode:** a table — `competitor · sells-as · targets · headline/copy mechanic · pricing · the GAP they leave unserved` — one row per player, plus a short read on where the open lane is.
- **ICP/TARGET-GROUP mode:** a per-market ranking scored on `pain × solvency × reachability × entry-speed × fit × competition-gap`, naming the single best beachhead and the "tried-AI-and-got-stuck" evidence behind it.
- In every mode: a sources list with dates, and an explicit **confidence + weak-evidence** note so the reader knows which conclusions are load-bearing and which are still hypotheses.

## Rules
- Refute before you trust — every load-bearing number must survive an attempt to break it.
- Vendor/aspirational/unsourced numbers get flagged, never silently passed through. Self-citing virality is one source, not many.
- State the date on every claim; current evidence beats authoritative-sounding stale evidence.
- Honesty over completeness — label weak evidence weak; a hedged true answer beats a confident wrong one.

## For Command EVE
This is a native product capability — EVE does the market/competitor/ICP research a marketing or strategy
hire would do, on demand, cited and stress-tested. The operator **Alois** uses it in two passes:

1. **Self-check (before he builds).** Alois runs deep-research on his OWN idea first — MARKET to confirm
   there's a real, payable, timely opportunity; COMPETITOR to see who already owns the space and what gap
   they leave; ICP to name the beachhead he can actually reach and who'll pay now. EVE creates the
   research **profile/asset** (a reusable saved report + sources), so the finding is durable, not a
   throwaway chat answer.
2. **Client-check (once clients exist).** For each client Alois takes on, EVE re-runs the same three modes
   scoped to that client's market, competitors, and target group — producing the same decision-grade,
   cited deliverable per account. Alois self-checks his positioning, then checks each client's, on the
   same evidence bar.

EVE/Hermes runs this natively: it fans out the blind web-search/fetch passes, applies the refute-by-default
verification, and emits the saved research asset — the same artifact whether the subject is Alois's own
business or his newest client.
