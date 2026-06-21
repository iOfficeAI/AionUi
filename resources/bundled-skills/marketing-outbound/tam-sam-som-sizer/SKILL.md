---
name: tam-sam-som-sizer
description: "Nutze, wenn du wissen willst, wie groß dein Markt realistisch ist — TAM/SAM/SOM mit transparenter Rechnung (Top-down + Bottom-up) und jeder Schlüssel-Annahme offen markiert, statt einer hübschen Zahl ohne Beleg. Beispiele: \"Wie groß ist mein Markt für ...?\", \"Size mir TAM/SAM/SOM für DACH\", \"Wie viele Firmen passen auf mein ICP?\", \"Lohnt sich dieses Segment überhaupt?\""
---

# TAM / SAM / SOM Sizer

Macht aus ICP + Geografie drei belastbare Zahlen — **TAM** (gesamter adressierbarer Markt), **SAM**
(was du mit deinem Angebot/Modell wirklich bedienen kannst), **SOM** (was du in 12–24 Monaten
realistisch holst) — inklusive Rechenweg und jeder Annahme offen auf dem Tisch. Eine Zahl ohne
Rechenweg ist Bauchgefühl mit Nachkommastellen; hier ist beides nachvollziehbar.

## Was du bekommst
Die 3 Zahlen (TAM/SAM/SOM, je als Firmen-Anzahl **und** als jährliches Umsatzpotenzial), zwei
unabhängige Rechenwege (Top-down + Bottom-up) mit Abweichungs-Check, eine nummerierte Annahmen-Liste
mit Quelle bzw. `ANNAHME(... — zu verifizieren)`, und ein ehrliches Konfidenz-Urteil. Keine
suggerierte Präzision: Spannen statt Scheinkommastellen.

## Wann nutzen
- Bevor du Zeit/Geld in ein Segment kippst — lohnt sich die Geografie/Branche überhaupt?
- Wenn du priorisieren musst: zwei ICPs gegeneinander, wo ist mehr SOM bei weniger Aufwand?
- Für Pitch, Plan oder Quartalsziel — und du willst eine Zahl, die einer kritischen Frage standhält.
- **Nach** `icp-definer` (du brauchst eine scharfe ICP-Definition) und idealerweise nach
  `offer-definer` (für den ACV/Ticketwert, der SAM/SOM in Umsatz übersetzt).

## Input
- **Pflicht:** ICP-Definition (Branche/Segment, Firmengröße z. B. Mitarbeiter oder Umsatz, ggf.
  Rolle/Setup) + **Geografie** (DACH, DE, EU, eine Region, eine Stadt).
- **Pflicht für die Umsatz-Zahl:** durchschnittlicher Jahres-Vertragswert (ACV) oder Ticketgröße —
  zieht `offer-definer` / `outreach-brief.md`, wenn vorhanden.
- **Optional (macht's präzise):** `outreach-brief.md`, eure Win-Rate, eure Sales-Kapazität
  (wie viele Accounts schafft ihr realistisch pro Jahr), bekannte Disqualifier aus `icp-definer`,
  vorhandene Marktstudien/Verbandszahlen.

## Workflow
1. **ICP in zählbare Filter übersetzen.** Eine Markt-Definition muss man *abzählen* können. Zerlege
   das ICP in harte Kriterien, die in einer Quelle vorkommen:
   - *Branche* → NACE/WZ-Code, Verbands-Zugehörigkeit, oder Stichwort in Firmen-Datenbank.
   - *Größe* → Mitarbeiter-Bänder (Destatis/Eurostat nutzen genau diese) oder Umsatz-Klassen.
   - *Geografie* → Land, Bundesland, Umkreis.
   - *Qualifier* aus `icp-definer` (z. B. „hat eigenen Vertrieb", „nutzt CRM") → senkt SAM, nicht TAM.
2. **Top-down rechnen (vom Ganzen zur Nische).** Starte bei einer amtlichen Gesamtzahl und filtere
   herunter. Quellen-Reihenfolge: Destatis Unternehmensregister, Eurostat SBS, IHK/Handwerkskammer,
   Branchenverbände, Statista. Jeder Filterschritt = ein Prozentsatz, **jeder mit Quelle oder als
   `ANNAHME`**: `Gesamt × %Branche × %Größenband × %Geo × %Qualifier`.
3. **Bottom-up rechnen (von der Realität nach oben).** Unabhängig vom Top-down: zähl konkret. Wie
   viele Firmen findest du tatsächlich in LinkedIn Sales Navigator / Apollo / einem Verbands­verzeichnis
   für genau diese Filter? Diese Zahl ist oft *kleiner und ehrlicher* als Top-down — sie ist dein
   realistisches SAM-Anker.
4. **Top-down vs. Bottom-up abgleichen.** Weichen sie um > Faktor 3 ab, stimmt eine Annahme nicht —
   benenne welche. Konvergieren sie grob, steigt deine Konfidenz. Nimm **nicht** einfach den
   Mittelwert; entscheide begründet, welcher Weg für welche Schicht (TAM eher Top-down, SAM/SOM eher
   Bottom-up) belastbarer ist.
5. **TAM festlegen.** Alle Firmen weltweit/in der weitesten sinnvollen Geo, die das Problem *theoretisch*
   haben — ohne Rücksicht auf dein Modell, deine Sprache, deine Kapazität. Obergrenze, nicht Ziel.
6. **SAM ableiten.** TAM minus alles, was du strukturell **nicht** bedienen kannst: falsche Geo/Sprache,
   Segmente außerhalb deines Angebots, harte Disqualifier, fehlende Vertriebswege. SAM ist der Markt,
   den dein *aktuelles* Angebot wirklich treffen kann.
7. **SOM ableiten — der ehrlichste Teil.** Was holst du in 12–24 Monaten realistisch? Zwei Wege,
   nimm den **kleineren**:
   - *Marktanteil-Sicht:* SAM × realistischer Anteil (Jahr 1 selten > 1–5 % bei Outbound).
   - *Kapazitäts-Sicht:* (Accounts, die ihr pro Jahr sauber bearbeiten könnt) × Win-Rate. Diese
     Sicht deckt Selbstüberschätzung auf — Vertrieb skaliert nicht beliebig.
8. **In Umsatz übersetzen.** Jede Schicht × ACV = jährliches Umsatzpotenzial. SOM-Umsatz ist deine
   realistische 12–24-Monats-Pipeline-Obergrenze.
9. **Annahmen-Liste schreiben.** Jeder Prozentsatz, jeder ACV, jede Win-Rate, die nicht aus einer
   harten Quelle kommt → nummeriert als `ANNAHME(... — zu verifizieren)`. Markiere die **2–3
   sensibelsten** (die, bei denen ±20 % das Ergebnis kippen) — die verifizierst du zuerst.
10. **Ausgeben** (Struktur unten). Spannen statt Scheinpräzision; Konfidenz-Urteil offen.

## Rechen-Formeln
```
TAM (Firmen)  = Gesamtzahl Firmen (weiteste Geo) × %Branche × %Größenband
TAM (Umsatz)  = TAM-Firmen × ACV

SAM (Firmen)  = TAM × %erreichbare-Geo/Sprache × %im-Angebots-Scope × (1 − %harte-Disqualifier)
SAM (Umsatz)  = SAM-Firmen × ACV

SOM (Firmen)  = min(
                  SAM × realistischer-Marktanteil%,          # Marktanteil-Sicht
                  Accounts-pro-Jahr-Kapazität × Win-Rate%    # Kapazitäts-Sicht
                )
SOM (Umsatz)  = SOM-Firmen × ACV
```

## Output-Skelett (an `outreach-brief.md` anhängbar)
```
# Markt-Sizing: <ICP> in <Geografie>
_Stand: <Datum> · Konfidenz: niedrig | mittel | hoch_

## Die 3 Zahlen
| Schicht | Firmen (Spanne) | Umsatzpotenzial/Jahr | Konfidenz |
|---|---|---|---|
| TAM | <…> | <… € @ ACV …> | … |
| SAM | <…> | <… €> | … |
| SOM | <…> | <… €> | … |

## Rechenweg Top-down
<Gesamt → Schritt × % → Schritt × % → Ergebnis, je mit Quelle/ANNAHME>

## Rechenweg Bottom-up
<gezählte Quelle (Sales Nav / Apollo / Verband) → Ergebnis>

## Abgleich
<konvergieren / weichen um Faktor X ab — welche Annahme erklärt die Lücke>

## Annahmen (zu verifizieren)
1. ANNAHME(… — Quelle/Schätzung) [SENSIBEL: kippt Ergebnis bei ±20 %]
2. ANNAHME(…)

## Quellen
- <Destatis-Tabelle / Eurostat / Verband / Tool-Suche mit Filtern>
```

## Beispiel (Auszug)
> **ICP:** Handwerksbetriebe SHK, 10–49 MA, DACH. **ACV:** 6.000 €/Jahr.
> **Top-down:** ~50.000 SHK-Betriebe DE (ZVSHK, `FACT`) × 38 % im Band 10–49 MA
> (`ANNAHME(— grobe Verteilung, zu verifizieren)`) ≈ 19.000 → +AT/CH grob +20 % ≈ **23.000 (TAM)**.
> **Bottom-up:** Sales Navigator, Filter SHK + 11–50 MA + DACH = **~14.000 Treffer** (nicht alle
> haben LinkedIn → reale Zahl höher; Bottom-up ist hier Untergrenze).
> **Abgleich:** Faktor ~1,6 — konvergiert ordentlich, Konfidenz **mittel**. Lücke = LinkedIn-Abdeckung
> + Größen-Annahme.
> **SAM:** nur deutschsprachig + erreichbar via Telefon/LinkedIn − Betriebe ohne Online-Präsenz
> (~30 %, `ANNAHME`) ≈ **13.000** → ~78 Mio € Potenzial.
> **SOM:** Kapazitäts-Sicht: 600 Accounts/Jahr sauber × 8 % Win = **48 Kunden** ≈ 288 k €/Jahr —
> kleiner als Marktanteil-Sicht (1 % von 13.000 = 130), also **48 zählt**.

## Häufige Fehler
- **TAM als Ziel verkaufen.** „Der Markt ist 4 Mrd € groß" ist nutzlos, wenn dein SOM 300 k € ist.
  Die ehrliche, kleine SOM-Zahl ist die, mit der man arbeitet.
- **Nur Top-down rechnen.** Verband-Prozente fühlen sich präzise an, sind aber kaskadierte Schätzungen.
  Ohne Bottom-up-Gegenprobe weißt du nicht, ob du um Faktor 5 daneben liegst.
- **Annahmen als Fakten tarnen.** Eine geschätzte 38-%-Quote ohne `ANNAHME`-Markierung ist die häufigste
  Art, sich selbst zu belügen.
- **Kapazität ignorieren.** „1 % Marktanteil" klingt bescheiden, ist aber unmöglich, wenn euer Vertrieb
  nur 200 Accounts/Jahr schafft. SOM bricht an der Kapazität, nicht am Markt.
- **Scheinpräzision.** „SOM = 47.312 €" suggeriert Genauigkeit, die die Datenbasis nicht hergibt.
  Spannen nutzen.

## Regeln
- **Evidenz vor Behauptung.** Jeder Prozentsatz hat eine Quelle (`FACT(quelle)`) oder ist eine
  nummerierte `ANNAHME(... — zu verifizieren)`. Repo-/Branchen-Bauchgefühl ist kein Beleg.
- **Zwei Wege, immer.** Top-down **und** Bottom-up; eine Zahl ohne Gegenprobe wird nicht ausgegeben.
- **SOM ist das Minimum der Sichten**, nie das Maximum oder der Wunsch.
- **Keine erfundenen Marktzahlen.** Gibt die Quelle nichts her: Spanne + Konfidenz „niedrig" + klar
  benennen, was zu recherchieren ist. Lieber ehrlich unscharf als falsch präzise.
- Nur öffentliche/lizenzierte Quellen, Datensparsamkeit — keine zusammengekauften Adressdaten als „Markt".

## Output
- Die **3 Zahlen** (Firmen + Umsatz, als Spanne) mit Konfidenz-Urteil.
- **Beide Rechenwege** offen + Abgleich.
- **Nummerierte Annahmen-Liste**, sensibelste markiert — die To-do-Liste zum Verifizieren.
- Optional anhängbar an `outreach-brief.md`, damit `outreach-strategist` & Co. die Marktgröße kennen.
