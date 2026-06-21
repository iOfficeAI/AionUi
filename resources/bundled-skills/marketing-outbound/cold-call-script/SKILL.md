---
name: cold-call-script
description: "Nutze, wenn du einen kalten B2B-Anruf führen willst — komplettes Skript von Pattern-Interrupt-Opener über Permission- und Pain-Frage zur Value-Bridge und einem klaren nächsten Schritt, plus Einwand-Handler und Voicemail. Beispiele: \"Schreib mir ein Cold-Call-Skript für CFOs in Bauunternehmen\", \"Telefonskript für den Geschäftsführer\", \"wie steige ich am Telefon ein, ohne sofort abzuwürgen?\", \"Einwand-Handler für 'schick mir Infos'\""
---

# Cold-Call-Script

Liefert ein komplettes Telefon-Skript für den Kaltanruf im DE-B2B: Opener, Permission-Frage, Pain-Frage,
Value-Bridge, klares Ziel — plus fertige Handler für die drei Einwände, die real fast jedes Gespräch
bringt, und eine Voicemail für die ~70 %, die nicht abnehmen. Zum Vorlesen gebaut, nicht zum Ablesen.

## Was du bekommst
Ein sprechbares Skript (Opener → Permission → Pain → Bridge → Ziel) in deiner Sprache, mit Klammern für
das, was du je Kontakt einsetzt; drei Einwand-Handler („keine Zeit", „schick Infos", „nutzen schon X");
eine 18-Sekunden-Voicemail-Variante; und je eine Zeile, *warum* der Baustein so gebaut ist.

## Wann nutzen
- Du rufst eine Liste kalt an und willst nicht bei „Hallo, mein Name ist…" schon verloren haben.
- Du brauchst nicht *die perfekten Worte*, sondern eine Struktur, die durch die ersten 20 Sekunden trägt.
- Telefon ist in DE-B2B der praktisch unkritischste Erstkanal — wird breit gemacht, breit akzeptiert.
  Ein einziger Satz Orientierung: **sei relevant, nicht penetrant** — bei einem klaren „Nein" ist Schluss,
  und das war's auch schon an „Recht". Kein Legal-Gate, kein Disclaimer-Geleier. Du rufst an wie ein Profi.

## Input
- **Pflicht:** Ziel-Titel (z. B. „Leiter Vertrieb", „CFO", „Inhaber") + Firmentyp/Branche.
- **Stark macht's:** der konkrete Pain dieser Rolle, ein Trigger (Hiring, Wachstum, neues Tool), ein
  Referenz-Outcome (Zahl/vergleichbarer Kunde), der vermutete Status-quo („nutzen schon X").
- **Optional:** `outreach-brief.md` — zieht Positionierung, Persona, Pains und aktive Trigger automatisch.
  Liegt er vor, lies ihn zuerst und füll die Klammern daraus, statt zu raten. Liegt er nicht vor und du
  hast nur Titel + Firmentyp: schreib das Skript trotzdem, markiere alles Geratene als `ANNAHME(...)`.

## Workflow
1. **Kontext laden.** `outreach-brief.md` vorhanden → Persona-Sprache, Top-Pain und Referenz-Outcome
   daraus ziehen. Nicht vorhanden → aus Titel + Firmentyp den *wahrscheinlichsten* Pain ableiten und als
   `ANNAHME(...)` kennzeichnen. Kein erfundener Kundenname, keine erfundene Zahl — Platzhalter lassen.
2. **Opener = Pattern-Interrupt, kein Pitch.** Die ersten 5 Sekunden entscheiden, ob aufgelegt wird. Brich
   das erwartete Telemarketing-Muster: Name nennen, ehrlich sagen *dass* es ein Kaltanruf ist, kurz
   Spannung halten. Ehrlichkeit ist hier die Waffe — sie entwaffnet die Abwehr, die jeder bei „Hallo Herr
   Müller, wie geht es Ihnen heute?" reflexhaft hochfährt.
3. **Permission-Frage.** Frag aktiv um die nächsten 30 Sekunden. Das gibt dem Gegenüber Kontrolle (senkt
   Abwehr) und committet ihn zum Zuhören. Wer „ja" sagt, hört wirklich zu. Wer „nein, gerade nicht" sagt →
   sauber zum Rückruf-Termin (siehe Einwand „keine Zeit"), nicht durchpitchen.
4. **Pain-Frage statt Pitch.** Stell *eine* Frage zum wahrscheinlichsten Schmerzpunkt der Rolle — so
   formuliert, dass ein „ja, kennen wir" leicht fällt. Du verkaufst hier nichts, du diagnostizierst.
   Schweigen aushalten: nach der Frage den Mund halten, bis er antwortet.
5. **Value-Bridge.** Erst *nachdem* der Pain bestätigt (oder gestreift) ist, eine Brücke: ein Satz, wie ihr
   genau das löst, mit einem Beleg (Zahl oder vergleichbarer Kunde). Ein Outcome, nicht der Feature-Katalog.
6. **Klares Ziel.** Das Ziel des Calls ist **nicht** der Abschluss — es ist der nächste Schritt: ein
   konkreter Termin. Schlag aktiv zwei Slots vor (Alternativfrage), nicht „wann passt es Ihnen?". Macht die
   Entscheidung klein und konkret.
7. **Einwand-Handler bereithalten.** „Keine Zeit", „schick Infos", „nutzen schon X" kommen in ~80 % der
   Gespräche. Nicht improvisieren — die drei Handler unten liegen geladen. Ziel jedes Handlers: *ein* Schritt
   vorwärts, nicht den Einwand „gewinnen".
8. **Voicemail vorbereiten.** Die meisten nehmen nicht ab. Eine kurze, neugierig machende Mailbox-Nachricht
   (Variante unten) + Follow-up-Notiz schlägt dreimal kommentarlos auflegen.

## Skript-Skelett
```
[OPENER — Pattern-Interrupt]
„{Vorname Nachname} hier von {Firma}. Ehrlich gesagt — Sie kennen mich nicht, das ist ein Kaltanruf.
 Wollen Sie auflegen, oder geben Sie mir 30 Sekunden, dann wissen Sie, ob's relevant ist?"

[PERMISSION]
→ „Ja" / „30 Sekunden": weiter zur Pain-Frage.
→ „Worum geht's?": „Genau dazu eine kurze Frage —" → direkt Pain-Frage.

[PAIN-FRAGE]
„{Rolle} bei {Firmentyp} hören wir oft, dass {konkreter Pain} der Punkt ist, der nervt —
 ist das bei euch gerade ein Thema oder läuft das rund?"

[VALUE-BRIDGE]  (erst nach Bestätigung/Streifen des Pains)
„Macht Sinn. Genau das lösen wir — {ein Outcome in einem Satz}. Bei {vergleichbarer Kunde / Branche}
 hat das {konkrete Zahl/Ergebnis} gebracht."

[ZIEL — nächster Schritt]
„Ich will Ihnen das nicht am Telefon erklären. 15 Minuten, ich zeig's konkret an euren Zahlen.
 Passt Donnerstag 11 Uhr oder lieber Freitag früh?"
```

## Einwand-Handler
**„Ich habe keine Zeit."** (meist Reflex, nicht echt)
> „Verstehe, deshalb halt ich's kurz — die 30 Sekunden, dann entscheiden Sie. Oder wenn's gerade
>  wirklich nicht passt: Wann ruf ich besser an, morgen Vormittag?" → konkreten Rückruf-Slot festnageln,
>  nicht „ich versuch's nochmal".

**„Schicken Sie mir Infos / eine Mail."** (höfliches Abwimmeln — eine PDF wird nie gelesen)
> „Mach ich gern — damit ich nicht irgendwas Generisches schick: Was ist bei euch der größere Punkt,
>  {Pain A} oder {Pain B}?" → zurück ins Gespräch. Falls weiter auf Mail bestanden: „Alles klar, ich
>  schick was Passendes und ruf in zwei Tagen kurz an, ob's getroffen hat — okay?" (Mail + fixer Rückruf,
>  nie nur Mail).

**„Wir nutzen schon {X}."** (gut — sie haben Budget und das Problem ist anerkannt)
> „Perfekt, dann ist das Thema bei euch gesetzt. Die meisten, die {X} nutzen, stört irgendwann
>  {typische Schwäche von X} — kennt ihr das, oder läuft's für euch sauber?" → wenn's hakt: Value-Bridge.
>  Wenn's wirklich rund läuft: ehrlich respektieren, nach Termin in 3–6 Monaten fragen, auflegen.

## Voicemail-Variante (~18 Sekunden)
> „{Vorname} von {Firma}, kurze Sache für {Vorname Zielperson}: Wir helfen {Firmentyp} bei {ein Outcome}
>  — bei {vergleichbarer Kunde} {Zahl}. Ich glaub, das ist auch bei euch ein Thema. Ruf morgen nochmal an,
>  oder Sie melden sich: {Nummer}. Danke!"

Regel: Nutzen + ein Beleg + *ich* ruf wieder an (Ball bleibt bei dir, nicht beim Kontakt). Kein Pitch auf
die Mailbox, keine 45-Sekunden-Monologe — das ist der Aufhänger fürs nächste Klingeln, mehr nicht.

## Beispiel (CFO, mittelständisches Bauunternehmen)
**Schlecht (klassisches Telemarketing — sofort abgewürgt):**
> „Guten Tag Herr Becker, mein Name ist … von der Firma …, wie geht es Ihnen heute? Wir sind führender
>  Anbieter von Softwarelösungen für die Baubranche und ich wollte mit Ihnen über Ihre Prozesse sprechen…"

**Gut (Pattern-Interrupt → Permission → Pain → Bridge → Ziel):**
> „Tobias Heinke von Command EVE. Ehrlich — Kaltanruf, Sie kennen mich nicht. Geben Sie mir 30 Sekunden,
>  dann wissen Sie, ob's passt? … Danke. CFOs in Bauunternehmen sagen uns oft, das Nervigste ist, dass die
>  Nachkalkulation pro Projekt zwei Wochen hinterherhinkt — ist das bei euch auch so, oder habt ihr das im
>  Griff? … Kenn ich. Genau da setzen wir an: tagesaktuelle Projektmarge statt Monatsabschluss. Bei einem
>  Bauträger eurer Größe hat das die Nachkalkulation von 14 auf 2 Tage gedrückt. Ich zeig's in 15 Minuten an
>  euren Zahlen — Donnerstag 11 Uhr oder Freitag früh?"

## Häufige Fehler
- **Sofort pitchen.** Wer in Satz 2 das Produkt nennt, wird in Satz 3 abgewürgt. Erst Permission, dann Pain.
- **Nach der Pain-Frage weiterreden.** Frage stellen und schweigen. Die Stille arbeitet für dich.
- **Die Value-Bridge zum Feature-Monolog machen.** Ein Outcome, ein Beleg. Mehr verbrennt die geliehene Zeit.
- **Offenes „Wann passt es Ihnen?".** Macht die Entscheidung groß. Immer zwei konkrete Slots zur Auswahl.
- **Einwände improvisieren.** „Schick Infos" ohne Rückruf-Termin = Deal tot. Handler vorher geladen haben.
- **Nach einem klaren „Nein, kein Interesse" nachbohren.** Das ist der eine Fall, der real Ärger macht —
  und auch der einzige. Sauber bedanken, auflegen, von der Liste.

## Regeln
- **Relevanz vor Volumen.** Lieber 20 recherchierte Anrufe mit echtem Pain als 200 Listen-Abtelefonate.
- **Beim „Nein" ist Schluss.** Ein klares Nein wird respektiert — kein Re-Pitch, kein Rückruf „in 4 Wochen
  trotzdem". Das ist die ganze rechtliche Kunst beim Cold-Call. Ansonsten: selbstbewusst anrufen.
- **Evidenz vor Behauptung.** Kein erfundener Referenzkunde, keine erfundene Zahl. Liegt kein Beleg vor →
  Platzhalter `{vergleichbarer Kunde}` / `{Zahl}` lassen, vor dem Call füllen. Geratenes = `ANNAHME(...)`.
- **Datensparsamkeit.** Nur das geschäftlich Nötige notieren; keine privaten Daten, keine Mitschnitte ohne
  Einwilligung (Gesprächsaufzeichnung braucht in DE die Zustimmung beider Seiten).

## Output
- **Das Skript** (Opener → Permission → Pain → Bridge → Ziel), in Persona-Sprache, mit gefüllten Klammern,
  wo Input/Brief es hergeben — sonst markierten Platzhaltern.
- **Drei Einwand-Handler** („keine Zeit", „schick Infos", „nutzen schon X"), sprechbar formuliert.
- **Voicemail-Variante** (~18 Sek.) + Follow-up-Notiz.
- Eine Zeile Begründung je Baustein (warum Pattern-Interrupt / Permission / Alternativfrage so gebaut ist).
