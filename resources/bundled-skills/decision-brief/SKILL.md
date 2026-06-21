---
name: decision-brief
description: Turn a messy question plus a pile of evidence/inputs into a sharp, DECISION-GRADE brief the operator can act on. The repeatable shape — BOTTOM-LINE up front · the answer to each sub-question (evidence-cited, confidence-marked) · a decisive VERDICT/recommendation (not a menu) · the honest RESIDUAL risk that perfect execution can't fix · the explicit DECISION asked of the user. Use when the user must DECIDE and there's a lot of input, when they say "make this decision-ready", "what should I do", "give it to me straight", or to compress a research / persona-panel / pre-mortem run into one action. For Command EVE this is a core product capability — EVE is the operator's confidant who, after the analysis runs, hands back ONE clear call instead of a wall of options, so the operator (and their clients) can bet with eyes open.
---

# Decision Brief

A decision brief is the opposite of a research dump. Research, an icp-persona-panel run, a pre-mortem, or a
deep-research fan-out all *produce* evidence — a decision brief *spends* it. It compresses the mess into the
shape a busy operator can act on in one read: the **bottom line first**, a crisp **evidence-cited answer** to each
sub-question that actually gates the call, **one decisive recommendation** (not a survey of options), the **honest
residual risk** that remains even if everything is executed perfectly, and the **explicit decision** the user now
has to make. It is decision-grade or it is noise: lead with the call, honesty over smoothing.

## When to use
- When the user must **DECIDE** and there's a pile of input — reports, options, numbers, conflicting takes.
- When the user says "make this decision-ready", "what should I do", "give it to me straight", "just tell me".
- **After** a deep-research, icp-persona-panel, pre-mortem, or plan-system run — to compress it into ONE action.
- When a thread has drifted into an exhaustive menu and the operator needs the recommendation, not the catalog.

## The method
Run it as ordered moves — restate, marshal, answer, recommend, residual, ask. Don't skip to the verdict before the evidence is marked.

1. **Restate the REAL decision + break it into the gating sub-questions.** Say in one line *what is actually being
   decided* (not the surface question) and *who decides* (founder = HG-4, vs an autonomous call). Then list only the
   **sub-questions that actually gate it** — the ones whose answers would flip the recommendation. Drop the rest.
2. **Marshal the evidence — and grade it.** For each load-bearing claim cite the source and **date** it, then mark it
   `FACT(file:path / source)`, `INFERENCE(from X)`, or `HYPOTHESIS(no evidence yet)` with a confidence (high/med/low).
   **Flag every vendor-sourced, aspirational, self-reported, or unsourced number** — those are the ones that quietly
   sink decisions. A repo name or a confident summary is not evidence (per eve-doctrine).
3. **Answer each sub-question crisply.** One tight answer per sub-question, each carrying its confidence and its
   strongest counter-evidence. No hedging walls — if the honest answer is "unknown", say "unknown" and name what test
   would resolve it.
4. **Give the VERDICT + a single recommendation.** State the call **first**, in one sentence, then the why. Recommend
   **one** path — not a balanced three-way menu the user has to re-decide. If a real fork exists, name the default and
   the one condition that would switch it; don't punt the whole choice back.
5. **Separate CONTROLLABLE from EXOGENOUS risk + state the honest residual.** Split self-inflicted risk (we can fix
   by executing well) from exogenous risk (market, platform, regulator — outside our control). Then state the **residual**:
   what still bites *even if execution is flawless*. This is the line most briefs omit and the one the operator most needs.
6. **End with the explicit decision asked.** Close with the single concrete thing the user must now do or approve —
   the gate, the spend, the go/no-go — and the immediate next step once they answer. One decision, not a to-do list.

## Output
- **BOTTOM LINE** (1–3 sentences, the call, up front) — readable before anything else.
- **Sub-question answers**, each evidence-cited and confidence-marked, with vendor/aspirational/unsourced numbers flagged.
- **VERDICT + the single recommendation** (decisive; if a fork is real, the default + the one switching condition).
- **Residual**: controllable vs exogenous risk, and the honest core that perfect execution can't remove.
- **The decision asked**: the explicit go/no-go or approval the user must make now, plus the next step on each answer.

## Key discipline
- **Lead with the decision.** The recommendation goes in the first lines, not the conclusion — assume the reader stops after the bottom line.
- **A recommendation, not a menu.** Surveying every option is a way of refusing to decide. Commit to one and own the fork conditions.
- **Honesty over smoothing.** Surface the inconvenient number, the soft "yes", the residual that doesn't go away. A brief that flatters the plan is worthless (same standard as icp-persona-panel's honesty rule).
- **Date and grade every load-bearing claim.** Stale or vendor-sourced numbers get flagged loudly; FACT / INFERENCE / HYPOTHESIS is mandatory, not decoration.

## For Command EVE
This is the seam where EVE stops being a search engine and starts being a **confidant who hands back a decision**.
EVE runs the heavy lifting — deep-research, the icp-persona-panel, a pre-mortem, the plan-system board — then a final
decision-brief pass turns all of it into ONE call the operator can act on, instead of leaving them to re-read the analysis.

- **EVE compresses, the operator decides.** EVE produces the brief — bottom line, graded sub-answers, the single
  recommendation, the residual — and routes the explicit decision to the right gate (founder HG-4 for anything
  irreversible or money/publish; autonomous otherwise), never quietly deciding the irreversible thing itself.
- **Alois uses it on his own bets first.** Before he commits budget, the operator gets the straight version — what the
  evidence actually supports, which number is the vendor's and not proven, and the residual risk he's still carrying —
  mirroring how the founder demanded the honest residual before the 79€ + credits call.
- **Then on his clients.** Alois points the same pass at a client decision (launch / price / kill) and hands the client
  a clean decision-grade brief — invisible-delivery preserved — so the client buys judgment, not a research dump.
- **Evidence rule.** Every load-bearing claim in the brief is dated and graded FACT / INFERENCE / HYPOTHESIS; any number
  that can't be sourced is flagged, not smoothed over — the brief narrows the bet, it does not manufacture certainty.
