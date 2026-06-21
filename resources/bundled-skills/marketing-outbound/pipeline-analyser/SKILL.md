---
name: pipeline-analyser
description: "Nutze, wenn du einen Pipeline-Export / CRM-Dump in eine ehrliche Risiko-Diagnose verwandeln willst — welche Deals kippen, warum sie stecken, und die EXAKTE nächste Aktion pro Deal. Beispiele: \"Analysier meine Pipeline\", \"Welche Deals sind at risk?\", \"Was ist diese Woche dran?\", \"Warum steckt der Deal mit acme.com?\""
---

# Pipeline Analyser

Verwandelt einen Pipeline-Export in eine Risiko-Diagnose, die du sofort abarbeiten kannst: pro Deal
ein At-Risk-Flag, die wahrscheinliche Ursache (warum steckt es), und die *eine* nächste Aktion — plus
die 3 Deals, die **diese Woche** Priorität haben. Keine Vanity-Forecasts, kein „sieht gut aus".

## Was du bekommst
Eine Deal-Tabelle (Deal · Stage · Risiko · Ursache · nächste Aktion) und darunter die **Top-3 dieser
Woche** mit klarer Begründung, warum genau die drei. Jeder Risiko-Call kommt mit Beleg aus den Daten
(letzter Kontakt, Stage-Alter, fehlender Next-Step) — geratene Ursachen werden als `ANNAHME(...)`
markiert, nicht als Fakt getarnt.

## Wann nutzen
- Montag-Morgen-Triage: Du hast 20–80 offene Deals und willst wissen, wo du *heute* anpacken musst.
- Ein Deal ist still geworden und du brauchst eine ehrliche Diagnose statt Wunschdenken.
- Vor dem Forecast-Call: Du willst die wackeligen Deals kennen, bevor jemand anders sie findet.
- Nach einer Outreach-Welle: Welche frischen Deals brauchen jetzt den nächsten Touch, bevor sie kalt werden.

## Input
- **Pflicht:** Pipeline-Export (CSV / Tabelle / CRM-Dump). Sinnvoll pro Deal: Firma, Stage,
  Deal-Wert, letzter Kontakt (Datum), Datum des Stage-Eintritts, nächster geplanter Schritt.
- **Optional (schärft die Diagnose):** `outreach-brief.md` (liefert ICP → erkennt schlechte Fits),
  typische Sales-Cycle-Länge, eure Stage-Definitionen, Notizen/letzte Antwort pro Deal.
- **Datensparsam:** Es reicht **Firma + Rolle**. Keine privaten Notizen, keine vollständigen
  Kontaktprofile, keine sensiblen Verhandlungs-/Personendaten ins Tool ziehen — nur das, was für die
  Risiko-Entscheidung nötig ist. Fehlt ein Feld, arbeite mit dem, was da ist, und nenne die Lücke.

## Workflow
1. **Daten einlesen & normalisieren.** Erkenne die Spalten (Stage, Wert, letzter Kontakt, Stage-Alter,
   Next-Step). Fehlt „letzter Kontakt" oder „nächster Schritt", ist das schon ein Signal — markiere es,
   rate es nicht weg.
2. **Stage-Alter berechnen.** Wie lange steckt der Deal in der aktuellen Stage? Das ist der stärkste
   Einzel-Indikator. Gegen die typische Cycle-Länge halten (oder gegen die Faustregeln unten, falls
   keine eigene gegeben — dann als `ANNAHME` kennzeichnen).
3. **At-Risk-Flag pro Deal setzen** (🟢 / 🟡 / 🔴, Logik unten). Flag = Funktion aus Stage-Alter,
   Tagen seit letztem Kontakt, fehlendem Next-Step und Stage-Sprung-Mustern (z. B. seit Wochen in
   „Angebot" ohne Reaktion).
4. **Ursache diagnostizieren** — *warum* steckt es? Genau eine Hauptursache pro Deal, aus dem
   Ursachen-Katalog unten. Beleg dazu (z. B. „31 Tage kein Kontakt, kein Next-Step gesetzt"). Wenn die
   Daten keine eindeutige Ursache hergeben: `ANNAHME(...)` + welches Datenfeld es klären würde.
5. **Nächste Aktion ableiten** — *eine* konkrete, ausführbare Aktion, kein Vorhaben. Nicht „nachfassen",
   sondern „Anruf: nach Budget-Freigabe fragen" oder „Breakup-Mail (siehe `copywriting-follow-up`)".
   Aktion muss zur Ursache passen (Katalog koppelt beide).
6. **Top-3 der Woche wählen.** Nicht einfach die 3 rötesten — sondern die mit dem höchsten
   **(Rettbarkeit × Wert)**. Ein 🔴-Deal, der seit 90 Tagen tot ist, ist *nicht* Priorität; ein
   🟡-Deal mit hohem Wert und klarem nächstem Schritt schon. Begründe die Auswahl in je einem Satz.
7. **Sauber ausgeben** — Tabelle zuerst (Scan-bar), Top-3 darunter, offene Datenlücken am Ende. Keine
   Wertung ohne Beleg aus den Daten.

## Risiko-Flag-Logik (Faustregeln, anpassbar)
Falls keine eigenen Schwellen gegeben, nutze diese und markiere sie als `ANNAHME`:
- 🟢 **On Track** — Next-Step gesetzt, letzter Kontakt < 7 Tage, Stage-Alter im Rahmen.
- 🟡 **Watch** — kein Next-Step ODER 7–14 Tage kein Kontakt ODER Stage-Alter ~1,5× üblich.
- 🔴 **At Risk** — > 14 Tage kein Kontakt UND kein Next-Step, ODER Stage-Alter > 2× üblich, ODER „nach
  Angebot" seit > 10 Tagen still.
- ⚫️ **Wohl tot** — > 45 Tage komplett still, mehrere ignorierte Touches. Nicht Top-3-Material →
  einmal sauber schließen (Breakup) statt Energie verbrennen.

## Ursachen → Aktions-Katalog
- **Kein Next-Step gesetzt** → Aktion: konkreten nächsten Schritt mit Datum vereinbaren (kurzer Call/Mail).
- **Single-Threaded** (nur ein Kontakt, kein Entscheider eingebunden) → Aktion: zweiten Stakeholder
  identifizieren + Intro anfragen.
- **Still nach Angebot** → Aktion: Anruf statt Mail; nach konkretem Einwand/Bedenken fragen, nicht „melden".
- **Kein echter Pain / schlechter Fit** (gegen ICP aus `outreach-brief.md` prüfen) → Aktion: ehrlich
  disqualifizieren oder Pain neu schärfen (`pain-identifier`), nicht künstlich am Leben halten.
- **Timing/Budget geparkt** → Aktion: konkretes Reaktivierungsdatum setzen, bis dahin nicht jagen.
- **Ghosting / mehrfach ignoriert** → Aktion: Breakup-Mail (`copywriting-follow-up`) — gibt oft die
  letzte ehrliche Antwort.

## Ausgabe-Skelett
```
## Pipeline-Risiko · <Datum> · <N Deals>

| Deal | Stage | Risiko | Ursache | Nächste Aktion |
|------|-------|--------|---------|----------------|
| <Firma> | <Stage> | 🔴 | <Ursache + Beleg> | <eine konkrete Aktion> |
| ... |

## Top-3 diese Woche
1. <Firma> — <warum jetzt: Rettbarkeit × Wert> → <Aktion>
2. ...
3. ...

## Offene Datenlücken
- <Feld fehlt bei X Deals — verzerrt das Risiko-Flag>
```

## Beispiel
**Schlecht (Wunschdenken, keine Aktion):**
> Acme sieht gut aus, kümmern uns die Tage. TechCorp ist noch dran, mal abwarten.

**Gut (Flag · Ursache + Beleg · eine Aktion):**
> | Acme GmbH | Angebot | 🔴 | Still nach Angebot — 18 Tage kein Kontakt, kein Next-Step | Anruf: nach konkretem Einwand fragen |
> | TechCorp | Discovery | 🟡 | Single-Threaded — nur Junior-Kontakt, `ANNAHME`: Entscheider fehlt | Intro zum Teamlead anfragen |
>
> **Top-3:** 1. Acme (hoher Wert, klarer rettbarer Einwand möglich) — der Deal kippt diese Woche oder gar nicht.

## Häufige Fehler
- **Rötlichkeit = Priorität** setzen. Tote Deals sind keine Priorität; rettbare mit Wert schon.
- Ursache **raten** statt aus Daten ableiten — und das Raten nicht als `ANNAHME` kennzeichnen.
- Aktion als Vorhaben formulieren („nachfassen", „dranbleiben") statt als konkreten, datierten Schritt.
- Mehr als eine Aktion pro Deal — dann macht man keine. Eine nächste Aktion, fertig.
- Mehr Personendaten ins Tool kippen als für die Risiko-Entscheidung nötig (Datensparsamkeit verletzt).
- Den ⚫️-„wohl tot"-Deal monatelang im Forecast mitschleppen, statt ihn sauber zu schließen.

## Regeln
- **Evidenz vor Behauptung.** Jeder Risiko-Call und jede Ursache braucht einen Beleg aus den Daten,
  sonst ist es eine `ANNAHME(... — welches Feld es klären würde)`.
- **Eine nächste Aktion pro Deal** — konkret, ausführbar, idealerweise mit Datum.
- **Keine erfundenen Felder.** Fehlt ein Datum oder Next-Step, nenne die Lücke, fülle sie nicht.
- **Datensparsam:** nur Firma + Rolle + die Felder, die die Risiko-Entscheidung tragen. Keine privaten
  Notizen, keine sensiblen Verhandlungsdaten in den Report kopieren.
- ICP-Abgleich, wenn `outreach-brief.md` vorliegt — schlechter Fit ist eine legitime Ursache, kein Versagen.

## Output
- **Deal-Tabelle:** Deal · Stage · Risiko (🟢🟡🔴⚫️) · Ursache (mit Beleg) · eine nächste Aktion.
- **Top-3 diese Woche** mit je einem Satz Begründung (Rettbarkeit × Wert), nicht nur „am rötesten".
- **Offene Datenlücken** am Ende, falls fehlende Felder das Flagging verzerren.
