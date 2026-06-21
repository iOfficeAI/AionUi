---
name: value-prop-lister
description: "Nutze, wenn du die ECHTEN Value-Props aus gewonnenen Deals ziehen willst — was Kunden wirklich gesagt und gekauft haben, nicht was auf deiner Website steht. Beispiele: \"Was sind unsere echten Value-Props?\", \"Zieh die Value-Props aus diesen Won-Deal-Notizen\", \"Welcher Nutzen hat den Kauf ausgelöst?\", \"Rank unsere Value-Props nach Evidenz\""
---

# Value-Prop Lister

Extrahiert und **rankt** die echten Value-Props aus Evidenz — Won-Deal-Notizen, Kundenzitate,
Sales-Calls. Nicht aus deiner Marketing-Copy, nicht aus dem, was der Gründer für wichtig hält,
sondern aus dem, was Kunden **wirklich gesagt** haben, als sie unterschrieben. Jeder Prop kommt mit
dem belegenden Original-Zitat. Kein Beleg → kein Prop.

## Was du bekommst
Eine **gerankte Liste** von 3–7 Value-Props, je mit (a) dem Nutzen in Buyer-Sprache, (b) dem
belegenden Original-Zitat oder Beleg, (c) wie oft das Thema in der Evidenz auftauchte. Plus eine
Trennung von **belegt** vs. `ANNAHME(...)` — und optional die Einspeisung in `outreach-brief.md`.

## Wann nutzen
- Du hast 5+ gewonnene Deals und willst wissen, **warum** Leute wirklich kaufen (nicht raten).
- Deine Website-Value-Props und das, was Kunden im Call sagen, klaffen auseinander.
- Bevor du Copy oder Call-Skripte baust — diese Liste liefert die Worte, die im Markt funktionieren.
- Vor `offer-definer` / `pain-identifier`: belegter Nutzen ist der Rohstoff für beide.

## Input
- **Pflicht:** Won-Deal-Notizen ODER Kundenzitate (Call-Transkripte, Slack/Email-Snippets,
  Testimonials, Case-Study-O-Töne, Review-Texte). Min. 3 Deals, besser 8+.
- **Optional:** verlorene Deals (zeigt, was *nicht* zog), deine aktuelle Website-Copy (zum Abgleich
  belegt vs. behauptet), `outreach-brief.md` (zum Einspeisen der Top-Props).
- **Datensparsamkeit:** anonymisiere Kundennamen, wo nicht nötig. Keine PHI/Finance-Rohdaten in den
  Output — der *Nutzen* zählt, nicht die Kundenidentität.

## Workflow
1. **Evidenz sammeln & markieren.** Lies jede Quelle. Markiere jede Stelle, an der ein Kunde sagt,
   *warum* er kaufte, *was sich änderte*, oder *was vorher weh tat*. Ignoriere Höflichkeits-Floskeln
   („tolles Team", „super Support") — die sind nett, aber kein Kaufgrund.
2. **O-Töne extrahieren — wörtlich.** Kopiere die belegenden Sätze **unverändert**. Die Sprache des
   Kunden ist Gold: „endlich keine Excel-Listen mehr" schlägt jedes „Effizienzsteigerung".
   Paraphrasiere nicht — das Zitat *ist* der Beleg.
3. **Zu Value-Props clustern.** Gruppiere Zitate, die denselben Nutzen meinen. Drei Kunden sagen
   „spare 2 Tage im Monat", „mache das jetzt in einer Stunde", „kein Wochenend-Reporting mehr" → ein
   Prop: *Zeitersparnis im Reporting*. Benenne den Prop in **Buyer-Sprache**, nicht in Feature-Sprech.
4. **Outcome vs. Feature trennen.** „Hat eine API" ist ein Feature. „Wir haben in 2 Wochen statt 3
   Monaten integriert" ist der Value-Prop. Wenn die Evidenz nur Features nennt, frag: *welches Ergebnis
   brachte das?* — und wenn es niemand sagte, markiere es als `ANNAHME(...)`, nicht als Prop.
5. **Ranken — nach Evidenz, nicht nach Bauchgefühl.** Sortiere nach (in dieser Priorität):
   - **Häufigkeit** — wie viele *unterschiedliche* Kunden nannten es? (3 Kunden > 1 Kunde, der es 3x sagte)
   - **Nähe zur Kaufentscheidung** — wurde es als *Grund* genannt („deshalb haben wir uns entschieden")
     oder nur nebenbei gelobt? Kaufgrund schlägt Lob.
   - **Konkretheit/Beleg** — mit Zahl/Zeitraum belegt schlägt vages „besser".
6. **Gegen Marketing-Copy spiegeln (optional).** Lege deine Website-Props daneben. Notiere: *belegt*
   (Kunde sagt es auch), *unbelegt* (nur Marketing, kein Kunde nennt es → `ANNAHME`), *übersehen*
   (Kunden lieben es, Marketing erwähnt es nicht → **das ist dein verstecktes Gold**).
7. **Verlorene Deals checken (falls vorhanden).** Was die *nicht* überzeugt hat, schärft die Liste:
   ein Prop, der Won-Deals zog aber Lost-Deals kaltließ, ist segment-spezifisch — notieren.
8. **Einspeisen.** Existiert `outreach-brief.md`, ersetze/ergänze dort die `## Top-3 Value-Props`
   durch die Top-3 *belegten* Props inkl. Kurzbeleg. Markiere unbelegte Marketing-Claims im Brief als
   `ANNAHME(... — kein Kundenbeleg)`.

## Value-Prop-Formel
```
{Nutzen in Buyer-Sprache}  —  Beleg: "{wörtliches Zitat}"  ({Quelle/Kunde}, genannt von {N} Kunden)
```
- **Nutzen** = Outcome, nicht Feature. Vorher→Nachher, wenn möglich.
- **Beleg** = wörtliches Zitat. Kein Zitat = `ANNAHME`, nicht Prop.
- **N** = Zahl unterschiedlicher Kunden. Das ist dein Ranking-Treiber.

## Output-Skelett
```
# Value-Props (evidenzbasiert): <Firma/Angebot>
_Stand: <Datum> · Basis: <N> Won-Deals / <M> Zitate_

## Gerankte Value-Props
1. <Nutzen in Buyer-Sprache>
   - Beleg: "<wörtliches Zitat>" (<Kunde/anonym>)
   - Genannt von: <N> Kunden · als Kaufgrund: ja/nein
2. ...

## Verstecktes Gold (Kunden lieben es, Marketing nennt es nicht)
- <Prop> — Beleg: "<Zitat>"

## Unbelegte Marketing-Claims (zu verifizieren oder streichen)
- ANNAHME(<Claim> — kein Kundenbeleg in der Evidenz)

## Quellen
- <Deal/Call/Review, anonymisiert>
```

## Beispiel
**Schlecht (Marketing-Copy als Value-Prop getarnt, kein Beleg):**
> 1. KI-gestützte, end-to-end Plattform für nahtlose Workflow-Automatisierung
> 2. Branchenführende Skalierbarkeit
> 3. Erstklassiger Support

**Gut (aus Evidenz extrahiert, gerankt, belegt):**
> 1. **Monatsabschluss von 3 Tagen auf 4 Stunden** — Beleg: „Was vorher unser halbes Monatsende
>    gefressen hat, läuft jetzt vor dem ersten Kaffee durch." (Kunde B, Finance-Lead) · genannt von 4
>    Kunden · als Kaufgrund: ja
> 2. **Kein Tool-Wechsel mehr im Tagesgeschäft** — Beleg: „Ich hab vier Tabs zugemacht und nicht
>    vermisst." (Kunde D) · genannt von 3 Kunden · als Kaufgrund: ja
> 3. **Onboarding ohne IT-Ticket** — Beleg: „Am zweiten Tag hat mein Team ohne mich losgelegt."
>    (Kunde A) · genannt von 2 Kunden · als Kaufgrund: nein (Bonus, kein Auslöser)
>
> **Verstecktes Gold:** „Endlich keine Excel-Listen mehr" — taucht in 3 Calls auf, steht auf keiner
> Landingpage. → starker First-Touch-Hook.

## Häufige Fehler
- **Marketing-Copy abschreiben** statt Evidenz extrahieren. Die Website ist die Wunschliste, nicht der Beleg.
- **Features als Value-Props listen.** „Hat Feature X" ist kein Prop, bis ein Kunde sagt, *was es ihm bringt*.
- **Paraphrasieren statt zitieren.** Sobald du den O-Ton glättest, geht der Beleg verloren — und die
  Buyer-Sprache, die deine Copy bräuchte.
- **Nach Bauchgefühl ranken** („das finde ICH am wichtigsten") statt nach Häufigkeit + Kaufgrund-Nähe.
- **Lob mit Kaufgrund verwechseln.** „Super Team" ist nett, aber niemand kauft deswegen — runterstufen.
- **Einzelstimmen überbewerten.** Ein begeisterter Kunde ist eine `ANNAHME`, kein Muster. Erst ab
  mehreren unabhängigen Nennungen wird es ein verlässlicher Prop.

## Regeln
- **Evidenz vor Behauptung.** Jeder Prop braucht ein wörtliches Zitat oder einen harten Beleg. Sonst `ANNAHME`.
- **Keine erfundenen Zitate.** Gibt die Evidenz nichts her, schreib „kein belegender O-Ton vorhanden" —
  niemals einen plausibel klingenden Kundensatz erfinden.
- **Buyer-Sprache schlägt Marketing-Sprache.** Im Zweifel das Kundenwort, nicht das Kategorie-Wort.
- **Ranking ist nachvollziehbar** — Häufigkeit + Kaufgrund-Nähe + Konkretheit, in dieser Reihenfolge,
  nicht Geschmack.
- **Datensparsamkeit** — anonymisiere, wo möglich; keine sensiblen Kunden-/Finanz-/Gesundheitsdaten in den Output.

## Output
- **Gerankte Liste** (3–7 Props), je Nutzen + wörtlicher Beleg + N-Nennungen + Kaufgrund-Flag.
- **Verstecktes Gold** (belegte Props, die deine Copy noch nicht nutzt) — direkt als Hooks verwertbar.
- **Unbelegte Claims** als `ANNAHME(...)` markiert.
- Falls `outreach-brief.md` vorhanden: aktualisierte `## Top-3 Value-Props` + ein Hinweis, was eingespeist wurde.
