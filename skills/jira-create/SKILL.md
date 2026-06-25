---
name: jira-create
description: Legt im Jira-Projekt QF ein Task-/Bug-Ticket im aktuellen Sprint an und startet danach jira-comment.
argument-hint: "<optional: Titel des neuen Jira-Tickets>"
disable-model-invocation: true
---

Lege ein neues Jira-Ticket in `QF` an.

## Regeln

- **Titel**: Wenn ein nicht-leeres Argument angegeben ist, ist es exakt der Titel und darf nicht übersetzt oder umformuliert werden. Sonst leite den Titel knapp auf Deutsch aus dem Ziel der aktuellen Session ab. Wenn das nicht eindeutig geht, per `ask_user_question` nachfragen. Präfixe den Titel mit [RAG] (für "Rest API Gateway"), [PUSH API], [ABC], [Pulsar], [V2] oder [V3], je nach zugehörigkeit der Aufgabe
- **Typ**: `Bug` bei Bug, Defekt, Regression, Testfehler, Incident oder Fehlerbehebung; sonst `Task`. Bei echter Unsicherheit per `ask_user_question` nachfragen.
- **Assignee**: aktueller Atlassian-User (`jira_atlassianUserInfo.account_id`).
- **Projekt**: `QF`.
- **Sprint-Feld**: `customfield_10020`.
- **CloudId**: Resource `https://sipgatede.atlassian.net` aus `jira_getAccessibleAtlassianResources`.
- **Kein Description-Text** setzen.

## Ablauf

1. Titel und Typ bestimmen.
2. CloudId und Assignee ermitteln.
3. Aktuellen Sprint per JQL finden:
   - `project = QF AND Sprint in openSprints() ORDER BY updated DESC`
   - `fields`: `summary`, `status`, `customfield_10020`
   - Eindeutige aktive Sprint-ID aus `customfield_10020[].state == "active"` verwenden.
   - Wenn mehrere aktive Sprints gefunden werden: per `ask_user_question` auswählen lassen.
   - Wenn keiner gefunden wird: abbrechen; kein Ticket ohne Sprint anlegen.
4. Issue erstellen mit `jira_createJiraIssue`:
   - `projectKey`: `QF`
   - `issueTypeName`: ermittelter Typ
   - `summary`: ermittelter Titel
   - `assignee_account_id`: aktuelle Account-ID
   - `additional_fields`: `{ "customfield_10020": <sprintId> }`
   - Die Sprint-ID direkt als Zahl setzen, nicht als Liste; Jira erwartet für dieses Projekt einen Zahlenwert.
5. Nach dem Create aktuellen Status und Transitionen des neuen Issues lesen. Per `ask_user_question` fragen, in welchen Status das Ticket gehört.
   - Optionen aus aktuellem Status + `transitions[].to.name` bilden.
   - Bei aktuellem Status keine Transition ausführen.
   - Sonst exakt passende Transition (`to.name`, Fallback `name`) ausführen.
   - Wenn keine passende Transition existiert: melden und trotzdem fortfahren.
6. Danach `jira-comment` für das neue Ticket starten: `/skill:jira-comment <KEY>`.

## Fehler

- Jira-Auth/Resource fehlt: abbrechen, Reauth-Hinweis geben.
- Create scheitert: Tool-Fehler zeigen, nicht kommentieren.
- Transition scheitert: Tool-Fehler zeigen; Ticket bleibt bestehen; trotzdem `jira-comment` starten.
