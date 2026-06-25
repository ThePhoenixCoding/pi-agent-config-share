---
name: cleanreview
description: Start three clean-context review subagents in parallel and return all reviews
argument-hint: <scope in Prosa, z.B. "uncommitted", "branch", "letzten 3 commits", "seit 10.04.2026", "PR 42">
---

Starte über Pi drei frische Subagenten parallel mit dem `subagent`-Tool. Alle drei führen denselben Review-Auftrag aus: den Pi-Skill `review`.

- `<scope>` sind die User-Argumente, die Pi nach dem Skill-Aufruf an diese Skill-Anweisung angehängt hat.
- Leere Argumente → `uncommitted` als Default.
- Injiziere den Review-Skill an jedem Task über den `skill`-Parameter: setze `skill: "review"`. Schreibe **nicht** `/skill:review` in den `task`-String — `/skill:`-Kommandos werden nur in der interaktiven Chat-Eingabe geparsed, nicht im programmatischen Task-String des `subagent`-Tools, und der Skill gelangt sonst nicht in den Kind-Kontext (die Review-Output-Vorschrift fehlt dann).
- Der `task`-String jedes Subagenten enthält ausschließlich den ermittelten Scope-Text (z. B. `uncommitted`, `branch`, `letzten 3 commits`, `seit 10.04.2026`, `PR 42`); leer → `uncommitted`. Die Scope-Interpretation, das Diff-Holen und das gesamte Output-Template (Marker `===BEGIN REVIEW===` / `===END REVIEW===`, Sektionen `Zusammenfassung` / `Kritisch` / `Empfehlungen` / `Positiv`) liefert die injizierte `review`-SKILL.md — hier nichts davon eigenständig vorgeben oder wiederholen.
- Nutze für alle drei Subagenten `context: "fresh"`. Die Subagenten erhalten keinerlei Zusatzkontext: weder Ziel oder Motivation der Änderungen, noch Begründungen, Vorannahmen oder Hinweise auf erwartete Ergebnisse. Das Review soll unvoreingenommen auf Basis des Codes selbst erfolgen.
- Nutze das `subagent`-Tool im Parallel-Modus mit genau drei Tasks und `concurrency: 3`.
- Verwende als Agent jeweils `delegate`.
- Setze **kein** `progress` (und auch kein `output` auf das cwd).
- Wähle vor dem Start genau ein Thinking-Level für die Review-Agenten, die Thinking unterstützen (GPT und Opus). GLM-5.2 unterstützt kein Thinking-Level und wird ohne Suffix verwendet. Nutze den Modell-Suffix `:<thinking>` mit folgender Auswahl:
  - `medium`: Bei trivialen Änderungen, z. B. nur Dokumentation, reine Formatierung oder geänderte Werte in Konfigurationsdateien.
  - `high`: Standardfall für normale Code- und Teständerungen.
  - `xhigh`: Bei komplexen, risikoreichen oder sicherheitsrelevanten Änderungen.
- Verwende diese Modell-Overrides (GPT und Opus mit dem gewählten Thinking-Level, GLM-5.2 ohne):
  - GPT-Review: `model: "openai-codex/gpt-5.5:<thinking>"`
  - Opus-Review: `model: "anthropic/claude-opus-4-8:<thinking>"`
  - GLM-Review: `model: "coding-sipgate-ai/zai-org/GLM-5.2-FP8"`
- Beispiel: `model: "openai-codex/gpt-5.5:high"`

Setze je Task `skill: "review"` und als `task` den ermittelten Scope-Text (`uncommitted`, falls leer).
Setze je Task explizit `acceptance: false`.

## Ausgabe an den User

Jeder Review-Subagent rahmt seinen Output mit `===BEGIN REVIEW===` / `===END REVIEW===` ein.

Gib dem Aufrufer eine einzige zusammengeführte Antwort zurück. Die Antwort besteht aus den drei Reviews klar getrennt hintereinander, in dieser Reihenfolge:

1. GPT-Review (`openai-codex/gpt-5.5:<thinking>`)
2. Opus-Review (`anthropic/claude-opus-4-8:<thinking>`)
3. GLM-Review (`coding-sipgate-ai/zai-org/GLM-5.2-FP8`)

Format:

```markdown
## Review 1 — GPT-5.5 <thinking> (`openai-codex/gpt-5.5:<thinking>`)
<kompletter Output des GPT-Subagenten inklusive ===BEGIN REVIEW=== und ===END REVIEW===, byte-genau kopiert>

## Review 2 — Opus 4.8 (`anthropic/claude-opus-4-8:<thinking>`)
<kompletter Output des Opus-Subagenten inklusive ===BEGIN REVIEW=== und ===END REVIEW===, byte-genau kopiert>

## Review 3 — GLM-5.2 (`coding-sipgate-ai/zai-org/GLM-5.2-FP8`)
<kompletter Output des GLM-Subagenten inklusive ===BEGIN REVIEW=== und ===END REVIEW===, byte-genau kopiert>
```

Kopiere die Subagent-Outputs byte-genau: Whitespace, Markdown, Code-Blöcke, Backticks, Umlaute — alles exakt wie vom jeweiligen Subagenten geliefert. Nur die drei Überschriften und die Leerzeilen zwischen den Reviews werden ergänzt.

## Fehlerbehandlung

Wenn ein Subagent fehlschlägt, Marker fehlen oder der Bereich zwischen den Markern leer ist, gib trotzdem die Ergebnisse der anderen Subagenten zurück. Ersetze nur den betroffenen Review-Block durch einen klar markierten Fehlerblock:

```markdown
## Review N — <Modellname> (`<Modell-ID>`)
FEHLER: <kurze Beschreibung>

Raw-Output, falls vorhanden:
<vollständiger verfügbarer Subagent-Output>
```

Frage in diesem Fall nicht nach, sondern liefere das Teilergebnis direkt zurück.

## Keine Nachbearbeitung

- Keine eigene Einschätzung, Priorisierung oder Zusammenfassung ergänzen.
- Keine Review-Befunde zusammenführen, deduplizieren oder umformulieren.
- Keine Fixes eigenständig umsetzen.
- Die Aufgabe von `/cleanreview` endet mit der Rückgabe der drei getrennten Review-Blöcke.
