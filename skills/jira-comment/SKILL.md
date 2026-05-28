---
name: jira-comment
description: Verfasst aus dem bisherigen Session-Kontext einen Diskussions-Kommentar zur bearbeiteten Jira-Story (Funktionsweise grob, getroffene Entscheidungen, Stolpersteine/offene Punkte) und postet ihn nach Vorschau und Bestätigung via MCP.
argument-hint: >-
  <optional: Issue-Key wie QF-123 und/oder Freitext-Hinweis; Reihenfolge beliebig>
disable-model-invocation: true
---

Ziel: einen kompakten Kommentar an die im aktuellen Workstream bearbeitete Jira-Story hängen, damit das Team über die Lösung sprechen kann. Der Kommentar entsteht aus dem bisherigen Session-Kontext — keine neue Recherche im Code.

## 1. Issue-Key ermitteln

Schwerpunkt-Hinweis: der Teil der von Pi angehängten User-Argumente, der nach Entfernen des erkannten Issue-Keys übrig bleibt, gilt **immer** als Schwerpunkt-Hinweis (z.B. "betone die Architektur") — unabhängig davon, über welchen Pfad der Key ermittelt wird. Ist der Rest leer, gibt es keinen Hinweis.

Reihenfolge, ohne zu fragen wenn eindeutig — bei mehreren Treffern in *einer* Quelle: nachfragen.

1. **Argument**: die angehängten User-Argumente nach Muster `\b[A-Z][A-Z0-9]+-\d+\b` parsen (Wortgrenzen). Genau ein Treffer → übernehmen; mehrere Treffer → nachfragen.
2. **Session-Kontext** (gleiche Regex): in dieser Priorität — (a) aktueller Branch (`git rev-parse --abbrev-ref HEAD`), (b) Commit-Subjects auf der Branch-Range gegen den Default-Branch (Default-Branch via `git symbolic-ref refs/remotes/origin/HEAD` oder `git remote show origin`; Fallback: ohne Range `git log -n 20 --pretty=%s`), (c) bisheriger Chatverlauf. Ist kein Git-Workdir oder schlagen `git`-Aufrufe fehl: Quellen (a)/(b) überspringen, nur (c) auswerten. Genau ein Treffer in (a) → übernehmen; mehrere in (a) → nachfragen. Sonst: ist genau ein Key in (b) und (c) zusammen ≥2× vertreten → übernehmen. Sonst → Schritt 3.
3. **Mehrdeutig oder keiner gefunden**: per `ask_user_question` mit den Top-Kandidaten als Optionen + Freitext nachfragen. **Keine** Jira-Suche (weder Bash noch MCP `jira_searchJiraIssuesUsingJql`) — nur lokale Quellen + Nachfrage.

## 2. CloudId besorgen

Falls noch nicht in der Session bekannt: MCP-Gateway-Tool `jira_getAccessibleAtlassianResources` aufrufen. Wenn genau eine Atlassian-Resource verfügbar ist, diese automatisch wählen. Bei mehreren Resources → per `ask_user_question` nachfragen; dabei die passende Site-URL aus den angezeigten Optionen wählen lassen.

## 2a. Vorbedingung "es gab Arbeit am Issue"

Vor den MCP-Calls in Schritt 3 prüfen, ob der bisherige Session-Kontext überhaupt erkennbar etwas zur Story enthält (Code-Änderungen, Diskussion, Tool-Calls mit Bezug zum Key). Wenn offensichtlich nichts vorliegt: User informieren ("Im Session-Kontext finde ich keine Arbeit zu \<KEY\>. Trotzdem fortfahren?") und nur auf explizite Bestätigung weitermachen. Spart MCP-Calls und verhindert Inhalts-Halluzinationen.

## 3. Issue + letzte Kommentare lesen

Story-Felder selbst (Summary, Description, Custom-Fields) sind unkritisch im Token-Budget. Das `comment`-Feld dagegen blast die Response massiv auf: Comment-Bodies kommen unabhängig vom `responseContentFormat` als ADF zurück, *zusätzlich* wird die ganze Antwort pretty-printed (~3.5× größer als nötig). Selbst wenn die Harness das als persisted-output ablegt, leakt der 2-KB-Preview in den Hauptagent-Kontext. Konsequenz: **den Comment-Fetch komplett in einen Subagenten verlagern.**

### 3a. Summary holen

MCP-Gateway-Tool `jira_getJiraIssue` mit `fields: ["summary"]`, `responseContentFormat: "markdown"`. Liefert ~400 Bytes — Anker für die Vorschau-Headerzeile.

### 3b. Comment-Zusammenfassung via Subagent

Pi-`subagent`-Tool mit einem frischen, leichten Agenten verwenden. Auftrag:

- Selbst MCP-Gateway-Tool `jira_getJiraIssue` mit `fields: ["comment"]`, `responseContentFormat: "markdown"` aufrufen (cloudId und issueKey im Prompt mitgeben).
- Die fünf jüngsten Kommentare (nach `created` desc) extrahieren.
- Bei persisted-output: die persisted-Datei via `read` öffnen. Bei direkter Response: in-place verarbeiten.
- ADF-Bodies zu kurzem Markdown rendern (nur Klartext und sinnvolle Strukturen — keine Mentions, keine Avatar-URLs, keine `self`-Links).
- Pro Kommentar: Autor-Displayname, Datum (YYYY-MM-DD), Markdown-Body. Bei sehr langen Bodies kürzen und auf Themenblöcke konzentrieren, die für eine Doppelungs-Erkennung relevant sind.
- Gesamtoutput unter ~400 Wörter, deutsch. Keine Erläuterungen, kein Vorspann.

Output des Subagenten ist die Basis für:
- **Eigene Recent-Posts erkennen**: Wenn der neueste Kommentar inhaltlich substanziell mit dem geplanten Entwurf überlappt (gleiche Themenblöcke, gleiche Begriffe) — typisch nach einem gerade in dieser Session geposteten Kommentar — vor der Vorschau in Schritt 5 nachfragen: Soll der neue Kommentar als _explizite Ergänzung_ zu dem bestehenden gerahmt werden ("Ergänzend zur Umsetzungsnotiz oben: …"), oder ist das eine ungewollte Doppelung und der Skill soll abbrechen?
- **Bezug auf fremde Kommentare**: ggf. Klartext-Bezug nehmen ("anknüpfend an die Frage zu X von letzter Woche …"). Auf bereits beantwortete Punkte nicht erneut eingehen. **Keine** Jira-Mentions (`[~accountid:…]`) — nur Klartext.

## 4. Entwurf erzeugen

**Sprache**: Deutsch. **Format**: Markdown (`contentFormat: "markdown"` beim Posten).

**Stil**:
- Kompakt. Bulletpoints statt Prosa.
- Überschriften (`###`) nur wo sie sinnvoll trennen — bei sehr kurzen Kommentaren weglassen.
- Pro Bullet ein Gedanke. Keine Fülltexte.

**Inhalte** (in dieser Reihenfolge, Abschnitte weglassen wenn leer):

1. **Was das Feature tut** — fachlich/technisch auf High-Level. Keine Klassen-/Methodennamen auflisten, keine Datei-Pfade. Lesbar für jemanden, der den Code nicht offen hat.
2. **Entscheidungen** — getroffene Designentscheidungen *mit Begründung*. Wenn relevant: verworfene Alternative kurz nennen.
3. **Stolpersteine & offene Punkte** — Probleme während der Umsetzung, ungeklärte Fragen, Punkte die das Team noch entscheiden sollte. Klar markieren, was *offen* ist vs. was *gelöst aber erwähnenswert* ist.

**Strikt nicht erwähnen**:
- Test-Inventar-Listen (welche Test-Klasse, wieviele Tests, welche Assertions). Tests _dürfen_ erwähnt werden, wenn der Test-Schnitt selbst eine Entscheidung ist (z. B. "IT mit WireMock statt Staging-Roundtrip, weil …") — aber nicht als Aufzählung „was wurde getestet".
- Trivialitäten (Formatierung, Renames, Lombok-Annotations).
- Generische Floskeln ("sauber umgesetzt", "alle Tests grün").
- Zwischen-Iterationen / Arbeitsverlauf ("erst war X, dann Y", "ursprünglich/initial 16/256 geplant, dann auf 4/64 reduziert", "erste Test-Iteration leakte …"). Nur den finalen Zustand beschreiben. Falls eine Begründung wertvoll ist (warum etwas jetzt so ist, wie es ist), als statische Eigenschaft formulieren ("Pool 4/64 abgeleitet aus …"), nicht als Verlauf ("wurde von 16 auf 4 angepasst, weil …").

Wenn nach Anwendung der Verbote *alle drei* Abschnitte leer wären (z.B. frische Session ohne erkennbare Arbeit am Issue): nicht posten. Stattdessen User mit kurzer Begründung informieren und Skill beenden.

Falls aus dem Argument ein Schwerpunkt-Hinweis kam, diesen beim Verfassen berücksichtigen.

## 5. Vorschau zeigen

Den Entwurf als Code-Block (` ```markdown … ``` `) in den Chat schreiben. Davor eine Zeile: `Issue: <KEY> — <Summary>`. Enthält der Entwurf selbst Code-Fences, längere Fences (` ```` `) für die Vorschau verwenden, damit das Fencing nicht bricht.

Dann per `ask_user_question` mit genau zwei expliziten Optionen, **Posten** und **Abbrechen** (in dieser Reihenfolge — sicherer Default zuerst, die "schreibende" Aktion bewusst nicht als erste Option). Die Frage selbst weist auf das automatische Freitextfeld hin, das der User für Anpassungswünsche nutzen soll (z. B.: "Posten, abbrechen, oder Anpassungen direkt im Freitextfeld nennen?"). Keine separate "Anpassen"-Option — die `ask_user_question`-UI hängt die Freitext-Variante bei Single-Select-Fragen automatisch an.

Auswertung der Antwort:

- **Posten** → Schritt 6.
- **Abbrechen** → nichts tun, kurz bestätigen.
- **Freitext** (egal ob "Sonstiges" oder vom Tool als `Other`/`answer` zurückgegeben) → als Feedback nutzen, neuen Entwurf bauen, neue Vorschau anzeigen, erneut `ask_user_question` mit denselben zwei Optionen. Loop bis Posten oder Abbrechen. Klingt der Freitext eindeutig nach Abbruch ("vergiss es", "stop", "abbrechen", o. ä.) → wie **Abbrechen** behandeln.

## 6. Posten

MCP-Gateway-Tool `jira_addCommentToJiraIssue` mit `contentFormat: "markdown"`, `cloudId`, `issueIdOrKey`, `commentBody`.

Nach erfolgreichem Post: einzeilige Bestätigung mit Issue-Key. Keine URL erfinden (weder aus Issue-Key noch aus Cloud-Hostname).

## Fehlerpfade

- MCP-Tool nicht authentifiziert / liefert Auth-Fehler → User darauf hinweisen, dass die Jira-MCP-Verbindung neu authentifiziert werden muss, und abbrechen.
- `jira_getAccessibleAtlassianResources` liefert keine passende Resource → User darauf hinweisen und abbrechen (kein Raten welche CloudId zu nehmen ist).
- `jira_getJiraIssue` liefert 404 / Issue existiert nicht → User mit dem versuchten Key informieren und zurück zu Schritt 1 (oder abbrechen, wenn der Key vom User kam).
- Kein Issue-Key auffindbar und User wählt im `ask_user_question` "Abbrechen"/leer → Skill beenden, kein Posten.
- Beim Posten Fehler → Antwort des MCP-Tools wörtlich zeigen, nicht erneut probieren. Bei Timeout/Netzwerkfehler den User darauf hinweisen, dass der Kommentar trotzdem durchgegangen sein könnte und manuell in Jira geprüft werden sollte.
