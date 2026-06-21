---
name: icp-definer
description: "Nutze, wenn du dein ideales Kundenprofil aus echten Pipeline-Daten schärfen willst — Firmographie, Trigger, Qualifizierung UND explizite Disqualifier, nicht aus dem Bauch. Beispiele: \"Definier mein ICP aus den Won-Deals\", \"Wer passt zu uns und wer NICHT?\", \"Bau die Qualify/Disqualify-Checkliste\", \"warum churnen die falschen Kunden?\""
---

# ICP-Definer

Definiert dein Ideal Customer Profile aus **Pipeline-Evidenz** statt Wunschdenken: Welche Firmen
kaufen wirklich, schnell, bleiben und empfehlen weiter — und genauso scharf, **welche nicht**. Ergebnis
ist ein Profil plus eine Qualify/Disqualify-Checkliste, die jeder im Vertrieb in 60 Sekunden anwendet.

## Was du bekommst
Ein ICP-Profil: Firmographie (Größe, Branche, Reife, Geografie, Tech-Stack), die typischen **Trigger**
(wann der Bedarf akut wird), 3–6 **Qualifizierungs-Kriterien** und — das Unterscheidungsmerkmal — eine
Liste **expliziter Disqualifier** (wer trotz oberflächlicher Passung NICHT zu dir gehört). Dazu eine
Qualify/Disqualify-Checkliste zum direkten Anwenden. Jede Aussage ist mit Evidenz belegt oder als
`ANNAHME(...)` markiert.

## Wann nutzen
- Du verbrennst Outbound-Zeit an Firmen, die nie kaufen oder schnell wieder churnen.
- Dein „ICP" ist heute ein Branchen-Stereotyp („Mittelstand DACH"), kein evidenz-geschärftes Filter.
- **Vor** Listenbau, TAM-Sizing (`tam-sam-som-sizer`) und Persona-Arbeit (`persona-definer`) — dieser
  Skill liefert das Mengengerüst, auf das die anderen aufsetzen.
- Wenn `outreach-brief.md` schon existiert: ergänze den ICP-Block dort, statt parallel zu schreiben.

## Input
- **Pflicht:** Won-Deals (wer hat gekauft) + Lost-Deals (wer nicht, warum). Mindestens grob: Firmenname,
  Größe, Branche, Deal-Größe, Sales-Cycle-Länge, verlorener Grund.
- **Stark machend:** Churn-Daten (wer ist abgesprungen, nach wie lang, warum), Expansion/Upsell-Konten,
  NPS/Empfehlungen, Onboarding-Aufwand pro Kunde, Support-Last.
- **Optional:** `outreach-brief.md` (zieht Positionierung + Angebot automatisch), CRM-Export, eure
  Bauchgefühl-Hypothese zum ICP (zum Gegenprüfen, nicht zum Übernehmen).
- Zu dünn? Sag offen, welche Schicht fehlt, und arbeite mit `ANNAHME(...)`, statt Lücken zu erfinden.

## Workflow
1. **Won-Deals clustern — die Evidenz-Basis.** Sortiere die Gewinner nicht nach Umsatz, sondern nach
   **Qualität**: schnell geschlossen, sauber onboardet, geblieben, expandiert, empfohlen. Diese
   Top-Quartil-Kunden sind dein wahres ICP — nicht der größte Logo-Deal, der mit Müh und Not lief.
   - Suche das **gemeinsame Muster**: Größe (Mitarbeiter/Umsatz), Branche, Reifegrad, Org-Struktur,
     Tech-Stack, Region. Was teilen die *guten* Kunden, das die mittelmäßigen nicht teilen?
2. **Lost & Churn gegenlesen — das ist die Disqualifier-Goldmine.** Warum gehen Deals verloren oder
   Kunden churnen? Trenne zwei Ursachen sauber:
   - *Ausführungsfehler* (schlechtes Timing, falscher Ansprechpartner, Preis-Einwand) → fixbar, **kein**
     Disqualifier.
   - *Struktureller Mismatch* (zu klein für deinen Preis, kein Problem das du löst, falsche Erwartung,
     braucht Feature das du nie baust) → **das** sind deine Disqualifier. Jeder wiederkehrende
     Mismatch-Grund wird zu einer Regel.
3. **Firmographie festnageln.** Aus Schritt 1 die harten Filter: Mitarbeiterzahl-Range, Umsatz-Range,
   Branche(n), Reifegrad (Startup/Wachstum/etabliert), Geografie, relevante Tech-Signale. Gib **Ranges**,
   keine Punktwerte („20–80 MA", nicht „50 MA"). Was du nicht belegen kannst → `ANNAHME(...)`.
4. **Trigger ableiten — wann wird der Bedarf akut.** Aus den Won-Deals: Was war bei den guten Kunden
   *kurz vor dem Kauf* los? Wachstum, neue Rolle, Tool-Wechsel, Funding, Regulierung, Schmerzschwelle
   erreicht. Diese Trigger sind später die Hooks für `copywriting-first-touch` — markiere sie als solche.
5. **Qualifizierungs-Kriterien formulieren.** 3–6 **prüfbare** Ja/Nein-Fragen, die eine Firma ins ICP
   heben. Nicht „passt gut", sondern „hat ≥ 20 MA UND ein operatives Vertriebsteam UND nutzt schon ein
   CRM". Jedes Kriterium muss aus außen recherchierbarer Info beantwortbar sein (LinkedIn, Website, Jobs).
6. **Disqualifier explizit machen.** Aus Schritt 2: die K.o.-Kriterien, bei denen du **nicht** ansprichst,
   egal wie verlockend das Logo ist. Pro Disqualifier ein Satz **warum** (sonst wird er ignoriert). Das
   spart mehr Zeit als jedes Qualify-Kriterium — disqualifizieren ist der Hebel.
7. **Checkliste bauen + schreiben.** Verdichte zu einer Qualify/Disqualify-Checkliste (Skelett unten) und
   schreib das ICP-Profil in `outreach-brief.md` (Block `## ICP`) oder als eigenständiges `icp.md`, wenn
   noch kein Brief existiert. Jede unbelegte Aussage als `ANNAHME(... — zu verifizieren)`.

## ICP-Profil-Skelett
```
# ICP: <kurzer Name, z.B. "wachsende DACH-Agentur, 20–80 MA">
_Stand: <Datum> · Evidenz-Basis: <N Won, N Lost, N Churn>_

## Firmographie
- Größe: <MA-Range> · Umsatz: <Range> · Reife: <Phase>
- Branche(n): <...> · Geografie: <...> · Tech-Signale: <...>

## Trigger (= Hooks für den ersten Touch)
- <Trigger> — beobachtbar an: <Signal/Quelle>

## Qualifizierung (alle Ja = ICP)
- [ ] <prüfbares Kriterium>
- [ ] ...

## Disqualifier (ein Ja = NICHT ansprechen)
- [ ] <K.o.-Kriterium> — weil: <Grund aus Lost/Churn>
- [ ] ...

## Offene Annahmen (zu verifizieren)
- ANNAHME(...)

## Evidenz
- Won-Muster: <...> · Lost/Churn-Muster: <...>
```

## Qualify/Disqualify-Checkliste (Skelett)
```
FIRMA: ___________________________

QUALIFY (≥ X von Y → ansprechen):
[ ] Größe im Range?            [ ] Branche passt?
[ ] Hat das Problem (Signal)?  [ ] Budget/Reife plausibel?
[ ] Trigger aktiv?

DISQUALIFY (ein einziges Ja → raus):
[ ] Zu klein für den Preis?    [ ] Kein passendes Problem?
[ ] Braucht Feature X (nie)?   [ ] Wettbewerber inhouse?

→ Entscheidung: ANSPRECHEN / SKIP / NURTURE
```

## Beispiel (Won-Muster → Disqualifier)
> **Gut (evidenz-getrieben):** Die 12 besten Kunden sind allesamt DACH-Agenturen mit 20–80 MA, eigenem
> Vertriebsteam, schon ein CRM im Einsatz. Trigger bei 9 von 12: Wechsel/Neueinstellung im Vertrieb in
> den 60 Tagen vor Kauf. **Disqualifier aus Churn:** Solo-Berater (< 5 MA) churnten zu 70 % in Monat 3 —
> der Preis trägt sich nicht, also Hard-Skip. Und: Firmen, die ein fertiges All-in-One-CRM wollten,
> gingen verloren — `ANNAHME(deren Erwartung passt nicht zu unserem Fokus, in 2 Lost-Calls zu prüfen)`.
>
> **Schlecht (Stereotyp, keine Evidenz):** „Unser ICP ist der deutsche Mittelstand." → kein Filter, keine
> Trigger, keine Disqualifier. Damit ist jede Firma ein Lead und keine ist qualifiziert.

## Häufige Fehler
- **Größte Logos = ICP setzen.** Der teuerste Deal ist oft der schmerzhafteste. Ranke nach *Deal-Qualität*
  (Cycle, Onboarding, Retention, Empfehlung), nicht nach Umsatz.
- **Disqualifier weglassen.** Ein ICP ohne explizite Ausschlüsse ist halb fertig — und kostet im Outbound
  am meisten Zeit. Wer nicht passt, ist so wichtig wie wer passt.
- **Ausführungsfehler als strukturellen Mismatch verbuchen** (oder umgekehrt). Ein verlorener Deal wegen
  schlechtem Timing ist kein Disqualifier. Sauber trennen, sonst filterst du gute Firmen weg.
- **Wunsch-ICP statt Realität.** Die Hypothese im Kopf ist zum *Gegenprüfen* da, nicht zum Bestätigen.
  Wenn die Daten dagegensprechen, gewinnen die Daten.
- **Unbelegtes als Fakt tarnen.** Punktwerte ohne Datenbasis, geratene Branchen, erfundene Churn-Gründe.

## Regeln
- **Evidenz vor Behauptung.** Jedes Kriterium und jeder Disqualifier kommt aus Won/Lost/Churn oder ist
  eine `ANNAHME(...)`. Keine ICP-Aussage ohne Herkunft.
- **Disqualifier sind Pflicht**, nicht Kür — mindestens 2–3, jeder mit Begründung.
- **Ranges statt Punktwerte**, prüfbare Ja/Nein-Kriterien statt Adjektive („passt gut").
- **Keine erfundenen Daten.** Fehlt eine Schicht (z.B. Churn), benenne die Lücke offen statt sie zu füllen.
- Nur das geschäftlich Nötige aus dem CRM ziehen; keine personenbezogenen Detaildaten in den Brief
  kopieren (Datensparsamkeit) — fürs ICP zählen Muster, nicht einzelne Kontakte.

## Output
- **ICP-Profil** (Skelett oben) — geschrieben in `outreach-brief.md` (Block `## ICP`) oder `icp.md`.
- **Qualify/Disqualify-Checkliste** zum direkten Anwenden im Vertrieb.
- Eine Zeile **Evidenz-Basis** (wie viele Won/Lost/Churn das Profil trägt) — Vertrauensgrad transparent.
- Offene `ANNAHME(...)`-Liste mit dem konkreten nächsten Schritt zur Verifikation.
