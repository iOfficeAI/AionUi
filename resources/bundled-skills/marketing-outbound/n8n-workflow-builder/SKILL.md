---
name: n8n-workflow-builder
description: "Nutze, wenn du eine Outbound-Automatisierung in n8n bauen willst — vom Trigger über die Schritte bis zum Output, inklusive nötiger API-Endpoints/Credentials (nur Namen), Error-Handling und Test-Plan. Technischer als die anderen Skills, gleiche Struktur. Beispiele: \"Bau mir den n8n-Flow für die LinkedIn-Trigger-Sequenz\", \"Wie automatisiere ich Brief→Erstansprache→CRM in n8n?\", \"Workflow: neuer Lead in Pipedrive → Slack-Alert\""
---

# n8n Workflow Builder

Verwandelt eine Workflow-Idee + die beteiligten Tools in einen **bauformulierten n8n-Flow**: Node-Struktur
(Trigger → Schritte → Output), die nötigen API-Endpoints und Credential-**Namen** (nie Werte),
Error-Handling und einen Test-Plan. Du bekommst keinen halben Pseudocode, sondern eine Bauanleitung,
die du in n8n direkt nachklicken kannst.

## Was du bekommst
Eine nummerierte **Node-Liste** (jeder Node mit Typ, Zweck, Ein-/Ausgangsfeldern), den **Datenfluss**
zwischen den Nodes, ein konkretes **Error-Handling-Konzept** (Retry, Fallback, Alerting) und einen
**Test-Plan** mit Pinned-Data-Schritten. Plus die Liste der Credentials, die du in n8n anlegen musst —
als Referenz-Namen, ohne einen einzigen echten Key.

## Wann nutzen
- Du willst einen der Outbound-Schritte automatisieren statt manuell zu klicken (z. B. neuer Lead →
  Anreicherung → `copywriting-first-touch` → CRM-Eintrag → Slack-Ping).
- Du hast eine Idee („wenn X passiert, dann Y") und brauchst die saubere Node-Topologie dazu.
- **Vor** dem Bauen in n8n — damit du nicht mittendrin merkst, dass dir ein Credential, ein Error-Pfad
  oder ein Rate-Limit-Schutz fehlt.

## Input
- **Pflicht:** Was soll passieren (Trigger + gewünschtes Endergebnis) und **welche Tools** beteiligt sind
  (CRM, Email, LinkedIn-Tool, Slack, Google Sheets, …).
- **Optional (macht den Flow stark):** `outreach-brief.md` (liefert ICP/Persona/Angle, falls der Flow
  Copy generiert), Datenfeld-Namen aus deinem CRM, gewünschte Frequenz/Volumen (für Rate-Limits),
  bestehende n8n-Workflows zum Andocken.
- **Nie nötig:** echte API-Keys, Tokens, Passwörter. Wenn du sie nennst — ignoriere ich sie und arbeite
  mit Platzhaltern.

## Workflow
1. **Trigger klären — was startet den Flow?**
   - *Event-getrieben:* Webhook (neuer Lead aus Formular/CRM), n8n-native App-Trigger (z. B. „New Deal
     in Pipedrive"), Email-Trigger.
   - *Zeit-getrieben:* Schedule/Cron (z. B. täglich 08:00 die Follow-up-Fälligkeiten prüfen).
   - *Manuell:* nur für Tests — produktiv immer durch einen echten Trigger ersetzen.
2. **Schritte als lineare Kette skizzieren** — jeder fachliche Schritt = ein Node. Reihenfolge:
   Empfangen → Validieren/Normalisieren → Anreichern → Verarbeiten/Generieren → Schreiben → Benachrichtigen.
   Lieber ein Node mehr mit klarem Zweck als ein 200-Zeilen-Function-Node, den später keiner versteht.
3. **Pro Node festlegen:** Node-Typ, Zweck (ein Satz), erwartete **Input-Felder**, erzeugte
   **Output-Felder**. Hier entsteht der Datenfluss — benenne Felder konsistent (`lead.email`,
   `company.domain`), damit Folgenodes sie sauber referenzieren (`{{$json["lead"]["email"]}}`).
4. **Credentials benennen — nur Namen, nie Werte.** Pro externem Call: welcher Credential-Eintrag in n8n
   (z. B. `Pipedrive API (prod)`, `Slack Bot Token`, `OpenAI – outbound`). Schreibe **nie** den Key in
   den Flow; n8n hält Credentials verschlüsselt und referenziert sie nur per Name.
5. **API-Endpoints auflisten** — falls kein nativer n8n-Node existiert, der konkrete HTTP-Request-Node:
   Methode + Pfad (z. B. `POST /v1/deals`, `GET /persons/search`), nötige Header (`Authorization` →
   verweist auf Credential, nicht auf Klartext), Body-Felder. Pagination und Rate-Limit hier mitdenken.
6. **Error-Handling pro kritischem Node** (Detail unten): Retry-Politik, Fallback-Pfad, Alerting. Mindestens
   die externen Calls (CRM, Email, LinkedIn-Tool) brauchen einen definierten Fehlerweg — sonst kippt der
   ganze Flow still um.
7. **Rate-Limit & Compliance** — bei Outbound besonders: ein **Wait**-Node / „Loop with delay" gegen
   Hard-Sends im Sekundentakt (Anbieter-Limits **und** Zustellbarkeit). Bau einen **Opt-out-/Suppression-Check**
   ein, bevor du jemanden anschreibst (Node liest eine „Do-not-contact"-Liste; Treffer → Flow stoppt).
   Relevanz statt Volumen gilt auch in der Automatisierung — der Flow soll nicht zur Spam-Maschine werden.
8. **Test-Plan schreiben** (Detail unten) — Pinned Data, Einzel-Node-Ausführung, Fehlerfall provozieren,
   erst dann scharf schalten.

## Node-Skelett (typischer Outbound-Flow)
```
[1] Trigger            → Webhook / Schedule / App-Trigger        out: rohes Lead-Objekt
[2] Validate/Normalize → Function/Set: Felder mappen, leere      out: lead{email,name,domain,...}
                          Pflichtfelder abfangen → IF leer: stop
[3] Suppression-Check   → CRM/Sheet lookup gegen Do-not-contact   out: lead + {suppressed:bool}
                          IF suppressed → Stop & Log
[4] Enrich             → HTTP/App-Node (Firmendaten, Rolle)       out: lead + company{...}
[5] Generate Copy      → LLM-Node (nutzt outreach-brief Kontext)  out: + {subject, body}
[6] Wait / Rate-Limit  → Wait-Node (z. B. 30–90s jitter)         out: unverändert
[7] Send / Write       → Email- / LinkedIn-Tool- / CRM-Node       out: + {sent:bool, ext_id}
[8] Log + Notify       → CRM-Update + Slack/Email-Alert           out: Abschluss
        └─[Error Branch] → Error Trigger / „Continue On Fail" → Alert + Dead-Letter-Sheet
```

## Error-Handling-Konzept
- **Retry (transiente Fehler):** Netzwerk/5xx/Timeout → am Node „Retry On Fail" (z. B. 3 Versuche,
  exponentielles Backoff). Nie endlos — sonst hängt der Flow.
- **Fallback (fachlicher Fehler):** Anreicherung liefert nichts → mit Defaults weiterlaufen statt abbrechen;
  Send schlägt fehl → in ein **Dead-Letter-Sheet** schreiben, nicht still verlieren.
- **Alerting (was wirklich kaputt ist):** separater **Error-Workflow** (n8n „Error Trigger") oder
  `Continue On Fail` + IF-Branch → Slack/Email an dich mit Kontext (welcher Node, welcher Lead, Fehlertext).
- **Idempotenz:** bei Retries kein Doppel-Send. Schreibe eine externe ID / Dedupe-Key (`lead.email + tag`),
  prüfe vor dem Send, ob schon gesendet.
- **4xx vs. 5xx unterscheiden:** 5xx = retry; 4xx (z. B. 401/422) = nicht retrien, sofort alerten — der
  Key ist falsch oder der Payload kaputt, Wiederholen hilft nicht.

## Test-Plan
1. **Pinned Data** am Trigger setzen: ein realistisches Beispiel-Lead-Objekt, damit du ohne Live-Event testen kannst.
2. **Node für Node ausführen** (n8n „Execute Node") und nach jedem Schritt den Output prüfen — stimmen die Feldnamen, ist der Datenfluss intakt?
3. **Fehlerfall provozieren:** ungültige Domain / fehlende Email → greift der Suppression/Validate-Stop? Falscher Credential → landet es im Alert, nicht im Void?
4. **Rate-Limit verifizieren:** Wait-Node greift, keine Sekundentakt-Sends.
5. **Dry-Run scharf:** Send-Node temporär auf eine **eigene Test-Adresse** umbiegen, kompletten Flow einmal echt laufen lassen.
6. **Erst dann produktiv schalten** — Trigger aktivieren, erste echten Runs im Execution-Log beobachten.

## Beispiel
> **Schlecht (ein Mega-Node, kein Error-Pfad, Key im Klartext):**
> Ein einziger Function-Node holt Lead, ruft fünf APIs, sendet die Email — `Authorization: Bearer sk-live-…`
> hart reingeschrieben. Bei jedem Fehler bricht alles ab, niemand merkt es, und der Key liegt im Workflow-JSON.
>
> **Gut (klare Kette, Fehlerweg, Credentials referenziert):**
> `[1] Webhook → [2] Set (normalize) → [3] IF (suppression) → [4] HTTP GET /persons/search (Cred: „Pipedrive API prod")
> → [5] OpenAI-Node (Cred: „OpenAI – outbound") → [6] Wait 60s → [7] Email-Send (Cred: „SMTP outbound")
> → [8] Pipedrive-Update + Slack-Notify`. Jeder externe Node: Retry 3×/Backoff; `Continue On Fail` → Error-Branch
> schreibt ins Dead-Letter-Sheet und pingt Slack. Kein Key im Flow — alles über benannte Credentials.

## Häufige Fehler
- **Echte Keys im Workflow** statt benannte Credentials — landet im Export-JSON und in jedem Backup. Niemals.
- **Kein Error-Branch** an externen Calls — der erste API-Hänger killt den Flow lautlos.
- **Endlos-Retry / kein Backoff** — aus einem 429 wird ein Self-DDoS gegen die fremde API.
- **Mega-Function-Node** statt nachvollziehbarer Node-Kette — niemand (auch du nicht in 3 Monaten) debuggt das.
- **Kein Suppression-/Opt-out-Check** im Outbound-Flow — Automatisierung skaliert auch deine Fehler.
- **Direkt produktiv ohne Pinned-Data-Test** — der erste echte Run ist dann dein Test, an echten Empfängern.

## Regeln
- **Niemals echte Keys/Secrets/Tokens** in Output, Node-Beschreibung oder Beispiel. Nur Credential-**Namen**
  als Referenz. Werte gehören in n8ns verschlüsselten Credential-Store, nie in den Flow.
- **Evidenz vor Annahme:** Feldnamen, Endpoints, Rate-Limits, die du nicht sicher kennst, als
  `ANNAHME(... — in der API-Doku verifizieren)` markieren, nicht als Fakt ausgeben.
- **Jeder externe Call braucht einen Fehlerweg.** Kein „happy path only".
- **Outbound-Flows brauchen einen Opt-out-/Suppression-Check** vor dem Send — Compliance ist hier Code,
  kein Kommentar.
- **Keine erfundenen Endpoints.** Gibt es keinen nativen Node und du kennst den Pfad nicht, sag das und
  verweise auf die API-Doku, statt einen Pfad zu raten.

## Output
- **Node-Liste** (nummeriert): je Node Typ, Zweck, Input-/Output-Felder, referenziertes Credential (Name).
- **Datenfluss:** wie die Felder von Node zu Node wandern (Kette wie im Skelett oben).
- **Error-Handling:** Retry/Fallback/Alerting pro kritischem Node + Idempotenz-Hinweis.
- **Test-Plan:** Pinned-Data- und Einzelschritt-Schritte bis zum scharfen Dry-Run.
- **Credential-Liste:** welche Einträge du in n8n anlegen musst — nur Namen, **keine Werte**.
