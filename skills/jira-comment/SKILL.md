---
name: jira-comment
description: Verfasst aus dem bisherigen Session-Kontext einen knappen Diskussions-Kommentar zur Jira-Story, zeigt eine Vorschau, postet nach Bestätigung und kann optional nach Review/Fertig transitionieren.
argument-hint: "<optional: Issue-Key wie QF-123 und/oder Freitext-Hinweis; Reihenfolge beliebig>"
disable-model-invocation: false
---

Ziel: Einen kompakten deutschen Markdown-Kommentar zur bearbeiteten Jira-Story posten. Inhalt kommt aus dem bisherigen Session-Kontext, nicht aus neuer Code-Recherche.

## 1. Issue-Key finden

Der Argument-Rest nach Entfernen eines erkannten Keys ist immer Schwerpunkt-Hinweis.

Key-Regex: `\b[A-Z][A-Z0-9]+-\d+\b`.

1. **Argumente**: genau ein Treffer → nutzen; mehrere → nachfragen.
2. **Lokaler Kontext**: aus dem bisherigen Chatverlauf nach demselben Key-Regex Kandidaten sammeln.
3. **Entscheidung ohne eindeutigen Argument-Key**:
   - genau ein Key kommt in Argumenten+Chat zusammen mindestens 2× vor → nutzen
   - sonst per `ask_user_question` mit Top-Kandidaten + Freitext fragen

Keine Jira-Suche verwenden.

## 2. Vorbedingung prüfen

Wenn der User in den Argumenten genau einen Issue-Key angibt, gilt dieser als ausdrücklich bestätigt: ohne Rückfrage akzeptieren und direkt mit dem Jira-Zugriff fortfahren. Insbesondere nicht zusätzlich fragen, ob der Key richtig ist oder ob die Session-Arbeit zu diesem Issue gehört.

Nur wenn der Issue-Key aus dem lokalen Kontext abgeleitet wurde, vor Jira-Zugriff prüfen, ob im Session-Kontext erkennbare Arbeit zum Issue existiert (Code-Änderungen, Diskussion, Tool-Calls mit Key-Bezug). Ein unmittelbar zuvor per `/jira-create` angelegtes Ticket zählt als erkennbare Arbeit mit Key-Bezug. Falls nicht: kurz informieren und nur nach expliziter Bestätigung fortfahren.

## 3. Issue schlank lesen

CloudId vor MCP-Schreib-/Transitionszugriffen über `jira_getAccessibleAtlassianResources` ermitteln: Resource mit URL `https://sipgatede.atlassian.net` wählen; fehlt sie, abbrechen und CloudId nicht raten.

Für Issue-Reads immer Pi-Tool `jira_slim_issue` verwenden.
`jira_slim_issue` liefert Key, Summary, Description-Text und alle Kommentare kompakt als Markdown. Daraus verwenden:

- Summary für Vorschau-Header.
- Die jüngsten Kommentare für Doppelungsprüfung und Bezugnahmen.

Kommentar-Auswertung:

- Neueste eigene/ähnliche Kommentare erkennen. Bei substanzieller Überlappung: Entwurf trotzdem zuerst vollständig zeigen, danach fragen, ob er als explizite Ergänzung formuliert oder abgebrochen werden soll.
- Auf relevante fremde Kommentare in Klartext Bezug nehmen.
- Keine Jira-Mentions (`[~accountid:…]`).

## 4. Entwurf schreiben

Sprache: Deutsch. Format: Markdown (`contentFormat: "markdown"`). Stil: knapp, Bulletpoints statt Prosa, `###` nur wenn hilfreich.

Abschnitte in Reihenfolge:

1. **Was es tut** — fachlich/technisch high-level; keine Klassen-/Methodenlisten, keine Dateipfade. Weglassen, wenn leer.
2. **Entscheidungen** — Designentscheidungen mit Begründung; relevante verworfene Alternative kurz nennen. Weglassen, wenn leer.
3. **Gelöste Stolpersteine** — gelöste Schwierigkeiten, Risiken oder Besonderheiten. Wenn keine erkennbar sind, `-- keine --` schreiben.
4. **Offene Punkte** — offene Team-Entscheidungen, Nacharbeiten oder bekannte verbleibende Risiken. Wenn keine erkennbar sind, `-- keine --` schreiben.

Nicht erwähnen:

- Test-Inventar (Klassen, Anzahl, Assertions). Tests nur nennen, wenn der Test-Schnitt selbst eine Entscheidung ist.
- Trivialitäten wie Formatierung, Renames, Lombok.
- Floskeln wie „sauber umgesetzt“, „alle Tests grün“.
- Arbeitsverlauf/Zwischenstände. Finalen Zustand statisch begründen, nicht chronologisch erzählen.

Wenn danach kein sinnvoller Inhalt bleibt: nicht posten, kurz begründen und beenden. Schwerpunkt-Hinweis aus Argumenten berücksichtigen.

## 5. Vorschau und Bestätigung

Immer zuerst den fertigen Entwurf sichtbar in den Chat schreiben:

`Issue: <KEY> — <Summary>`

Dann den Entwurf als Markdown-Codeblock; bei enthaltenen Code-Fences längere Fences verwenden.

Die Vorschau darf nicht als abschließende `final`-Antwort gesendet werden. Sie muss im selben tool-fähigen Assistant-Turn ausgegeben werden, in dem unmittelbar danach `ask_user_question` aufgerufen wird. Zwischen Vorschau und Toolcall muss exakt folgender sichtbarer Abstandshalter ausgegeben werden, damit die Tool-UI die Vorschau nicht verdeckt:

```markdown
<!-- Vorschau-Ende: Abstand für Tool-UI -->
---
---
---
---
---
<!-- Vorschau-Ende: Abstand für Tool-UI -->
```

Nach der Vorschau ist ein normaler Chat-Reply verboten; der nächste Assistant-Schritt MUSS der `ask_user_question`-Toolcall sein.

Erst danach `ask_user_question` mit genau diesen Optionen:

1. **Nur posten** — Kommentar posten, Status nicht ändern.
2. **Posten + Review** — posten und nach `Review` transitionieren.
3. **Posten + Fertig** — posten und nach `Fertig` transitionieren.
4. **Abbrechen** — nichts posten, nichts ändern.

Frage: Posten, Status setzen, abbrechen, oder Anpassungen im Freitextfeld nennen? Keine separate Anpassungsoption.

Freitext → Entwurf überarbeiten, erneut Vorschau + gleiche Frage. Eindeutiger Abbruch-Freitext → abbrechen.

## 6. Posten und optional transitionieren

Posten per MCP:

- `contentFormat: "markdown"`
- `cloudId`
- `issueIdOrKey`
- `commentBody`

Ohne Zielstatus: nach erfolgreichem Post kurz mit Key bestätigen, keine URL erfinden.

Mit Zielstatus:

1. Nach dem Post aktuellen Status per MCP mit `fields: ["status"]`, `responseContentFormat: "markdown"` lesen.
2. Wenn Status bereits Zielstatus (case-insensitive): bestätigen, keine Transition.
3. Sonst MCP aufrufen.
4. Transition wählen, deren `to.name` exakt `Review`/`Fertig` matcht; Fallback `name`.
5. Keine passende Transition: Kommentar nicht zurückrollen; informieren und verfügbare Transition-Namen nennen, falls erkennbar.
6. Gefundene Transition per MCP mit `transition: {"id":"<transitionId>"}` ausführen.
7. Erfolg kurz mit Key und Zielstatus bestätigen, keine URL erfinden.

## Fehlerpfade

- Jira-Auth fehlt/Auth-Fehler → auf nötige Reauth hinweisen, abbrechen.
- Keine sipgate-Atlassian-Resource → hinweisen, abbrechen; CloudId nicht raten.
- Issue 404 → versuchten Key nennen; bei User-Key abbrechen, sonst zurück zur Key-Findung.
- Kein Key und User bricht ab/leere Antwort → beenden, nicht posten.
- Post-Fehler → Tool-Antwort wörtlich zeigen, nicht erneut probieren. Bei Timeout/Netzwerk: Kommentar könnte trotzdem angekommen sein; manuell prüfen.
- Transition-Fehler → Tool-Antwort wörtlich zeigen, nicht erneut probieren. Klar sagen: Kommentar ist gepostet, nur Statuswechsel fehlgeschlagen. Bei Timeout/Netzwerk: Transition könnte trotzdem erfolgt sein.
