---
name: session-start-hook
description: "Nutze, wenn Claude deinen Outreach-Kontext (Angebot, ICP, Persona, Wettbewerb) nicht in jeder Session neu erklärt bekommen soll. Dokumentiert einen Claude-Code SessionStart-Hook, der outreach-brief.md automatisch in jede Session lädt. Beispiele: \"Wie lädt Claude meinen Brief automatisch?\", \"Richte den outreach-brief-Hook ein\", \"Claude soll meinen Kontext beim Start kennen\", \"Session-Start-Hook für Outbound\""
---

# Session-Start-Hook

Kein Workflow-Skill, sondern **ein Stück Konfiguration**: ein Claude-Code SessionStart-Hook, der
deinen `outreach-brief.md` (falls vorhanden) automatisch in **jede** neue Session injiziert. Damit
kennt Claude Angebot, ICP, Persona und Wettbewerb ab dem ersten Prompt — du erklärst es nie wieder.

## Was du bekommst
Ein fertiges `settings.json`-Snippet (Block `hooks.SessionStart`), das beim Start jeder Session den
Inhalt von `outreach-brief.md` in den Kontext schreibt — wenn die Datei existiert, lautlos und ohne
Fehler, wenn nicht. Plus Setup-Schritte und Troubleshooting. Einmal eingerichtet, läuft es im
Hintergrund.

## Wann nutzen
- Du hast mit `deep-company-analyser` (Skill #01) einen `outreach-brief.md` geschrieben und willst,
  dass **jeder** Outbound-Skill ihn ohne erneutes Anhängen kennt.
- Du startest oft frische Sessions zur selben Zielfirma und tippst den Kontext jedes Mal neu.
- Du baust dir die Skill-Bibliothek in ein Projekt und willst die „Klammer" schließen: #01 schreibt
  den Brief, #17 (dieser Hook) lädt ihn.

## Input
- **Pflicht:** Schreibzugriff auf die `settings.json` deines Projekts oder deines Users:
  - Projekt-spezifisch (empfohlen, ins Repo eingecheckt): `.claude/settings.json`
  - Projekt-lokal (nicht eingecheckt, persönlich): `.claude/settings.local.json`
  - User-weit (alle Projekte): `~/.claude/settings.json`
- **Vorausgesetzt:** ein `outreach-brief.md` im Projekt-Root (von Skill #01). Fehlt er, tut der Hook
  schlicht nichts — kein Fehler, kein Müll im Kontext.

## Der Klammer-Trick (das „warum")
Skill #01 schreibt `outreach-brief.md` einmal sauber: Positionierung, Top-3 Value-Props,
Wettbewerbsrealität, aktive Trigger, Anknüpfungspunkte, offene `ANNAHME(...)`. Ohne diesen Hook
müsstest du den Brief in jeder neuen Session von Hand anhängen (`@outreach-brief.md`) — oder Claude
fragt nach Kontext, den du längst hast. Der SessionStart-Hook **schließt die Klammer**: er liest die
Datei beim Start und legt ihren Inhalt in den Kontext. Ergebnis: null Wiederholungs-Erklären, ein
konsistenter Wissensstand über alle 16 anderen Skills hinweg.

## Workflow
1. **Brief prüfen.** Liegt `outreach-brief.md` im Projekt-Root? Wenn nicht: erst Skill #01
   (`deep-company-analyser`) laufen lassen. Der Hook ist nur die Zustellung, nicht der Inhalt.
2. **Settings-Datei wählen.** Faustregel:
   - Team/Repo soll den Hook teilen → `.claude/settings.json` (eingecheckt).
   - Nur du, dieselbe Maschine → `.claude/settings.local.json`.
   - Über alle Projekte hinweg → `~/.claude/settings.json` (dann mit absolutem Pfad zum Brief, s.u.).
3. **Snippet einfügen.** Den `hooks.SessionStart`-Block aus dem Output unten in die gewählte Datei
   setzen. Existiert dort schon ein `hooks`-Objekt: **nicht** überschreiben, nur den `SessionStart`-
   Schlüssel ergänzen (sonst killst du andere Hooks).
4. **Pfad-Entscheidung.** Liegt der Brief im Projekt-Root und nutzt du eine Projekt-`settings.json` →
   relativer Pfad `outreach-brief.md` reicht (Hooks laufen im Projekt-Root). Nutzt du die User-weite
   `~/.claude/settings.json` → **absoluter Pfad**, sonst greift der Hook ins Leere.
5. **Verifizieren.** Neue Session starten und Claude fragen: „Welche Firma ist mein aktuelles
   Outreach-Ziel?" Kommt die Positionierung aus dem Brief ohne dein Zutun → Hook läuft.

## Hook-Mechanik (kurz)
- **Event:** `SessionStart` feuert einmal beim Öffnen jeder Session.
- **Typ `command`:** führt einen Shell-Befehl aus; was er auf **stdout** schreibt, wird in den
  Session-Kontext injiziert. Schreibt er nichts, wird nichts injiziert.
- **Das „falls vorhanden":** der Befehl prüft erst mit `test -f`, ob die Datei existiert, und gibt
  sie nur dann aus. Fehlt sie, endet der Befehl still mit Exit 0 — kein roter Fehler beim Start.

## Output — fertiges `settings.json`-Snippet
Direkt nutzbar. In Projekt-`settings.json` (Brief im Root, relativer Pfad):
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "test -f outreach-brief.md && printf '%s\\n' '# Geladener Outreach-Kontext (outreach-brief.md)' && cat outreach-brief.md || true"
          }
        ]
      }
    ]
  }
}
```

Variante für User-weite `~/.claude/settings.json` (absoluter Pfad — `$CLAUDE_PROJECT_DIR` löst auf den
Projekt-Root auf, so bleibt es projektunabhängig korrekt):
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "f=\"$CLAUDE_PROJECT_DIR/outreach-brief.md\"; test -f \"$f\" && printf '%s\\n' '# Geladener Outreach-Kontext (outreach-brief.md)' && cat \"$f\" || true"
          }
        ]
      }
    ]
  }
}
```

## Beispiel (vorher / nachher)
**Ohne Hook (jede Session von vorne):**
> Du: „Schreib die erste Email an den CMO von Acme."
> Claude: „Klar — was macht Acme, was ist dein Angebot, wer ist das ICP?"  ← Kontext-Verlust.

**Mit Hook (Brief liegt im Root):**
> Du: „Schreib die erste Email an den CMO von Acme."
> Claude: zieht Positionierung, Trigger („3 offene Data-Eng-Stellen") und Angle direkt aus dem
> bereits geladenen `outreach-brief.md` — keine Rückfrage, sofort relevant.

## Häufige Fehler
- **Bestehenden `hooks`-Block überschrieben** statt nur `SessionStart` ergänzt — andere Hooks weg.
- **User-weite Settings mit relativem Pfad** — der Hook läuft, findet die Datei aber nie. Absoluter
  Pfad bzw. `$CLAUDE_PROJECT_DIR`.
- **`||  true` vergessen** — fehlt der Brief, beendet sich der Befehl mit Exit 1 und du siehst bei
  jedem Start eine Hook-Fehlermeldung. Das `|| true` macht ihn lautlos optional.
- **Brief existiert gar nicht** — der Hook ist nur Zustellung. Ohne Skill #01 lädt er Leere.
- **JSON kaputt** (Komma vergessen, Backslash falsch escaped) — Claude Code ignoriert dann die ganze
  `settings.json`. Nach dem Einfügen einmal validieren (siehe Troubleshooting).

## Troubleshooting
- **Hook feuert nicht / kein Kontext:** JSON valide? Prüfe mit `cat .claude/settings.json | python3 -m json.tool`. Bei Fehler wird die Datei still ignoriert.
- **„command not found" oder leer:** Befehl isoliert testen: `test -f outreach-brief.md && cat outreach-brief.md || echo "kein Brief gefunden"` im Projekt-Root.
- **Brief wird nicht gefunden, obwohl er da ist:** Du nutzt User-Settings mit relativem Pfad → auf `$CLAUDE_PROJECT_DIR/outreach-brief.md` umstellen.
- **Fehler bei jedem Start, wenn kein Brief da ist:** `|| true` am Ende des Befehls fehlt — ergänzen.
- **Änderung greift nicht:** Hooks werden beim **Session-Start** gelesen. Neue Session öffnen, nicht nur den Prompt wiederholen.

## Regeln
- **Optional by design.** Der Hook darf nie hart fehlschlagen, wenn der Brief fehlt — `test -f … || true`.
- **Nur lesen, nichts schreiben.** Der Hook gibt eine bestehende Datei aus; er erzeugt, ändert oder versendet nichts.
- **Datensparsamkeit.** Lade nur den `outreach-brief.md` (öffentlich-recherchierter Geschäftskontext) — keine Secrets, keine `.env`, keine privaten Kundendaten in den Auto-Kontext.
- **Bestehende Hooks respektieren** — `SessionStart` additiv ergänzen, nie den `hooks`-Block ersetzen.
