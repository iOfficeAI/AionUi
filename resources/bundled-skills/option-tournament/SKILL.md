---
name: option-tournament
description: Make a wide-open creative or strategic CHOICE well — a headline, product name, tagline, design direction, positioning angle, GTM approach, CTA, or hook — by GENERATING many genuinely different candidates in parallel, JUDGING them with independent panels, picking the single winner, and GRAFTING the strongest lines from the runners-up into it. This is the "give me real options and pick the best, don't just iterate on one idea" engine. Use when the user asks "give me options", "name this", "what should the headline/tagline be", "which positioning", "pick the best", or whenever a choice has a wide solution space and one-shot-then-iterate would settle too early on a local maximum. DISTINCT from icp-persona-panel (which tests ONE thing against the audience) — this GENERATES and SELECTS among MANY options, then hands the runner-ups to a panel/A-B test. For Command EVE this is a core product capability — EVE runs the tournament WITH the operator on their own naming/copy/positioning, then the operator runs it on each client's campaign before spend.
---

# Option Tournament

Iterating on one idea converges fast — but on the *nearest* peak, not the best one. When a choice has a wide
solution space (a name, a headline, a tagline, a design direction, a positioning angle, a GTM approach), the
move is a **tournament**: **generate many genuinely different candidates in parallel** across distinct angles,
**judge them with independent panels** on the lenses that matter, **pick the single winner**, then **graft** the
strongest lines from the runners-up into it. Parallel-generate-then-judge beats one-attempt-iterated precisely
because it explores the whole field before committing — and it always keeps an honest A/B baseline so a bold
option has to *earn* its win over the safe one.

## When to use
- Choosing a **headline, product/feature name, tagline, hook, CTA, subject line, design direction, positioning angle, or GTM approach**.
- When the user says "give me options and pick the best", "name this", "what should we call/say", "which angle", "I can't decide between these".
- Any **wide-open creative or strategic fork** where the first good idea is probably not the best idea.
- NOT for narrow/closed choices with one clear answer — and NOT a substitute for `icp-persona-panel` when the question is "would my audience actually buy/click this" (run the tournament first, then panel the finalists).

## The method
Run it as phases — frame, generate, judge, synthesize. The value is in the **separation**: generators must be blind to each other, judges blind to who wrote what.

1. **FRAME the choice + the judging lenses.** State flatly *what* is being chosen (the exact slot: "H1 for the /app hero"), the constraints (length, tone, must-say, must-not-say), and the **2–4 lenses that actually decide it** — e.g. **ICP-pull** (does the target feel it), **craft** (is it well-made, not cliché), **conversion-intent** (does it move toward the action), **distinctiveness** (could a competitor say the same — if yes, it loses). Name an honest **baseline**: the safe, obvious option the winner must beat.
2. **GENERATE diverse candidates across DISTINCT angles.** Spawn several **angle-writers in parallel**, each *owning a different angle* and **blind to the others** — e.g. one writes from pain/loss, one from outcome/status, one from mechanism/proof, one from contrarian/pattern-break, one plain-and-clear. Each returns **a few candidates** in its lane. The point is a genuinely **varied field**, not one idea rephrased six ways — if two angles collapse into the same idea, replace one.
3. **JUDGE with independent panels.** Spawn judges who score **every** candidate on the lenses (0–10 per lens) and pick their **top-3** — instruct them to be **discriminating, not inflationary** (no participation scores; force separation). Include a **skeptic / conversion lens** whose only job is to check whether each **bold** option actually beats the **safe baseline** on intent — boldness that doesn't convert is just noise. Judges stay **blind to authorship and angle**.
4. **SYNTHESIZE — rank, pick, graft.** Aggregate the panels into one ranking, pick the **single winner**, then **GRAFT** the strongest line, word, or idea from the runners-up *into* the winner (the best final is rarely one pure candidate). Output the winner **plus a small test-stack**: the 2–3 runner-up variants worth A/B-testing later, and the baseline as control.

## Output
- The **candidate field** grouped by angle (so the spread is visible), each scored on the lenses.
- The **judges' ranking + top-3** with the skeptic's note on bold-vs-baseline for each finalist.
- The **single winner** (with any grafted line called out) and **why it won** on the lenses.
- A **test-stack**: 2–3 runner-up variants to A/B next, plus the **baseline as control** — so the choice stays falsifiable, not just asserted.

## Key discipline
- **Generate wide before you judge.** No editing during generation; a varied field is the whole point. One angle's polish can't substitute for missing angles.
- **Keep an honest baseline.** Always carry the safe/obvious option as control. If the bold winner can't out-argue it on conversion-intent, ship the baseline and A/B the bold one — don't fall for novelty.
- **Judges must discriminate.** A panel that scores everything 8/10 taught you nothing; force a real top-3 and a real bottom. Blind them to authorship so craft, not allegiance, wins.
- **The winner is usually a graft.** Treat runners-up as a parts bin — the best headline often borrows a verb from #2 and a frame from #3.

## For Command EVE
This is a native EVE capability, run as a multi-agent tournament through Hermes (one sub-agent per angle-writer, independent judge sub-agents, a synthesis pass) — the same fan-out shape as `icp-persona-panel`, but pointed at *generation+selection* instead of audience reaction.

- **EVE runs the tournament.** EVE frames the choice and lenses, spawns the blind angle-writers, runs the blind judges, and returns the winner + grafts + test-stack as a saved artifact the operator can re-run when the brief changes.
- **Hand the finalists to the panel.** The tournament narrows a wide field to a few strong options; pipe the winner + test-stack into `icp-persona-panel` to check the *solvent buyer's* reaction before spend — tournament picks the craft winner, panel checks it actually lands.
- **Alois on his own brand first, then clients.** The operator runs the tournament on **his own** name/headline/positioning, then points the same tournament at each **client's** campaign copy before launch — a pre-flight that replaces "the first idea we liked" with a judged field.
- **Stays falsifiable.** The test-stack + baseline mean every pick ships as an A/B-ready bet, not a verdict — pair with `pre-mortem` to ask how the winner could still flop, and keep the choice inside the operator's `plan-system` version it serves.
