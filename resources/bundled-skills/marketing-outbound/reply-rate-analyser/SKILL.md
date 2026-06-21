---
name: reply-rate-analyser
description: "Nutze, wenn eine Outbound-Sequenz läuft und du wissen willst, warum sie performt oder nicht — Benchmark-Check gegen realistische B2B-Werte, Ursache pro Touch (Betreff? Angle? Timing? Liste?) und priorisierte A/B-Tests, statt blind alles umzuschreiben. Beispiele: \"Warum antwortet keiner auf meine Sequenz?\", \"Analysier die Open/Reply-Rates pro Touch\", \"Welchen A/B-Test soll ich zuerst fahren?\", \"Ist 1,2% Reply normal?\""
---

# Reply-Rate Analyser

Verwandelt rohe Sequenz-Zahlen (Open / Reply / Bounce pro Touch) in eine Diagnose: was hakt, an
welchem Touch, *warum* — und welche drei Tests du in dieser Reihenfolge fährst. Kein „schreib alles
neu", sondern ein chirurgischer Eingriff am schwächsten Glied.

## Was du bekommst
Eine Diagnose pro Touch (Benchmark-Ampel + vermutete Ursache mit Begründung) und die **Top-3-Tests**,
priorisiert nach Hebel × Aufwand — jeder Test mit Hypothese, konkreter Änderung und Erfolgsmetrik.
Plus: ein klares „erst das, dann messen, dann das nächste" — nie zwei Variablen gleichzeitig.

## Wann nutzen
- Eine Sequenz hat **genug Volumen gelaufen** (Faustregel: ≥ 50 Kontakte/Touch, besser 100+), sonst
  ist jede „Reply-Rate" Rauschen, kein Signal.
- Die Zahlen fühlen sich „irgendwie schlecht" an und du weißt nicht, **wo** der Bruch sitzt.
- **Vor** der nächsten Sequenz-Runde — damit du die echte Schwachstelle fixt, nicht die laute.

## Input
- **Pflicht:** pro Touch die Zahlen — versendet, **Open-Rate**, **Reply-Rate**, **Bounce-Rate**.
  (Hast du keine Open-Rate, weil Pixel aus / Apple MPP verzerrt: sag es — dann fahren wir
  Reply-first, Open wird ignoriert. Das ist 2026 oft der ehrlichere Weg.)
- **Stark machend:** der Betreff je Touch, der Angle/Hook je Touch, Versand-Tag/-Zeit, Kanal
  (Email/LinkedIn), wie die Liste gebaut wurde (Quelle, Filter, Verifizierung).
- **Optional:** `outreach-brief.md` (liefert ICP + Persona + Pains — nötig, um „falsche Liste" von
  „falscher Botschaft" zu trennen), Positive-vs-Negative-Reply-Split.

## Workflow
1. **Funnel aufstellen.** Schreib pro Touch die Kette: versendet → zugestellt → geöffnet → geantwortet.
   Erst dann siehst du, *an welcher Stufe* es leakt. Eine nackte Reply-Rate ohne den Funnel darüber
   ist nicht diagnostizierbar.
2. **Bounce zuerst lesen** — die ehrlichste Zahl. > 5 % = Listenproblem, nicht Copy-Problem. Alles
   andere ist Makulatur, bis die Liste sauber ist (siehe Benchmarks unten). Hohe Bounce killt obendrein
   die Domain-Reputation → drückt *alle* folgenden Touches.
3. **Stufe für Stufe gegen Benchmark prüfen** (Ampel grün/gelb/rot, Tabelle unten). Wo zuerst rot wird,
   *dort* sitzt der Engpass — Stufen *danach* erst bewerten, wenn die davor grün ist. Reihenfolge:
   **Zustellung → Open → Reply**.
4. **Ursache pro Touch herleiten** — nicht raten, aus dem Muster lesen:
   - **Zustellung niedrig / Bounce hoch** → Liste (alte Daten, kein Catch-all-Filter, kein
     Verify-Schritt) oder Domain-Setup (SPF/DKIM/DMARC, Warmup, zu hohes Volumen).
   - **Open niedrig, Zustellung ok** → **Betreff** (zu generisch, salesy, Clickbait) oder Absender-Name
     / Reputation. *Falls keine Open-Daten verlässlich: überspringen, Reply-first.*
   - **Open ok, Reply niedrig** → **Botschaft**: Hook nicht relevant (falscher Angle/Pain), CTA zu
     schwer (Kalender-Link, „15 Min?"), zu lang, Ich-zentriert, oder schlicht **falsche Liste** (Open
     aus Neugier, aber kein echter Fit → gegen `outreach-brief.md` prüfen).
   - **Touch 1 ok, Folge-Touches brechen ein** → Follow-ups bringen keinen neuen Angle (nur „nochmal
     hochschieben") oder Timing zu eng/zu weit.
   - **Alles flach über alle Touches** → meist Liste oder Angle-Market-Fit, selten der Betreff.
5. **Reply-Qualität trennen.** Eine 8 %-Reply-Rate aus „kein Interesse / nehmt mich raus" ist
   *schlechter* als 3 % positiv. Wenn der Split vorliegt: positive Reply-Rate ist die echte Metrik.
6. **Tests priorisieren** — Hebel (wie viel kann sich bewegen) × Aufwand (wie schnell testbar). Fix den
   **frühesten roten Funnel-Schritt zuerst** — ein Open-Test bringt nichts, wenn 40 % bouncen. Genau
   **eine Variable pro Test**, sonst weißt du hinterher nicht, was gewirkt hat.
7. **Ausgeben** — Diagnose pro Touch + Top-3-Tests (Struktur unten). Jede Annahme als
   `ANNAHME(... — zu verifizieren)`, kein geratener Grund als Fakt getarnt.

## B2B-Benchmarks (realistisch, Cold-Outbound, kein Hype)
ANNAHME(typische DACH-/B2B-Spannen 2025/26 — gegen deine eigene Historie kalibrieren, sobald vorhanden):

| Metrik | rot (Problem) | gelb (ok) | grün (stark) |
|---|---|---|---|
| **Bounce** | > 5 % | 2–5 % | < 2 % |
| **Open** (wenn messbar) | < 25 % | 25–45 % | > 45 % |
| **Reply** (gesamt) | < 1 % | 1–5 % | > 5 % |
| **Positive Reply** | < 0,5 % | 0,5–2 % | > 2 % |

Open-Rates sind durch Apple Mail Privacy Protection systematisch aufgebläht — behandle sie als grobe
Richtung, nicht als Wahrheit. Im Zweifel **Reply ist die einzige Zahl, die zählt**.

## Diagnose-Logik (Kurzformeln)
- `Bounce hoch + Reply egal` → **Liste/Domain fixen, sonst nichts testen.**
- `Open hoch + Reply niedrig` → **Botschaft oder Fit**, nicht der Betreff.
- `Open niedrig + Zustellung ok` → **Betreff/Absender**, nicht der Body.
- `Touch 1 gut, Rest tot` → **Follow-up-Angles**, nicht der Erst-Touch.
- `Reply ok, aber alles negativ` → **falsche Liste / falscher Angle**, nicht die Copy-Mechanik.

## Test-Skelett (so sieht ein Top-3-Eintrag aus)
```
Test 1 — <was du änderst, EINE Variable>
  Touch:        <welcher>
  Hypothese:    <warum das den Engpass löst — auf die Diagnose bezogen>
  Änderung:     A: <Ist>  →  B: <Variante>
  Erfolgsmetrik:<welche Zahl muss sich bewegen, ab wann signifikant>
  Aufwand:      <niedrig/mittel — wie schnell live>
```

## Beispiel (Auszug)
> **Touch 1:** Bounce 1 % (grün), Open 38 % (gelb), Reply 0,6 % (rot).
> Open ok → Liste & Betreff sind nicht das Problem. Reply rot bei ordentlichem Open →
> `ANNAHME(Hook trifft den Pain nicht / CTA zu schwer)`. Im Body steht ein Kalender-Link im
> Erst-Touch — klassischer Reply-Killer.
>
> **Top-Test 1 — CTA entschärfen.** Touch 1. Hypothese: Low-Friction-Ja/Nein-Frage statt Kalender-Link
> hebt Reply, weil die Hürde fällt. A: „Passt Dienstag 15 Uhr?" → B: „Lohnt sich ein kurzer Blick?".
> Erfolgsmetrik: Reply-Rate Touch 1 von 0,6 % → Ziel > 1,5 %, ab ~100 Sends/Arm bewertbar. Aufwand: niedrig.

## Häufige Fehler
- **Aus zu wenig Volumen schließen.** 2 Replies auf 30 Mails sind kein Trend. Erst Volumen, dann Urteil.
- **Open-Rate als heilige Zahl** behandeln, obwohl MPP/Pixel sie verzerren — Reply schlägt Open.
- **Mehrere Variablen gleichzeitig** ändern → kein verwertbares Ergebnis.
- **Den Betreff fixen, während die Liste bouncet.** Immer den frühesten roten Funnel-Schritt zuerst.
- **Bounce ignorieren** — hohe Bounce ruiniert die Domain-Reputation und sabotiert *kommende* Sequenzen.
- Reply-*Menge* mit Reply-*Qualität* verwechseln (viele „nein danke" ≠ Erfolg).

## Regeln
- **Evidenz vor Behauptung.** Jede Ursache wird aus dem Funnel-Muster hergeleitet oder als
  `ANNAHME(...)` markiert — kein geratener Grund als Diagnose verkauft.
- **Keine erfundenen Benchmarks** — die Spannen oben sind Orientierung; sobald eigene Historie da ist,
  schlägt sie jeden externen Richtwert.
- **Eine Variable pro Test.** Priorität = frühester roter Funnel-Schritt zuerst, dann messen, dann der nächste.
- Relevanz statt Volumen: wenn die Diagnose „falsche Liste" lautet, ist mehr Senden die falsche
  Antwort — und hohe Bounce/„nehmt-mich-raus"-Quoten sind auch das Signal, sauberer und gezielter zu
  werden, nicht lauter.

## Output
- **Diagnose pro Touch:** Funnel-Zahlen + Ampel je Stufe + vermutete Ursache (mit Begründung oder `ANNAHME`).
- **Top-3-Tests:** je Hypothese, EINE-Variablen-Änderung (A→B), Erfolgsmetrik + Signifikanzschwelle, Aufwand.
- **Eine Zeile Reihenfolge-Empfehlung:** welchen Test zuerst, warum (frühester roter Schritt), wie lange messen.
