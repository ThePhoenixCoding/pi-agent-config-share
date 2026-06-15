---
name: cleanreview
description: Start two clean-context review subagents in parallel and return both reviews
argument-hint: <scope in Prosa, z.B. "uncommitted", "branch", "letzten 3 commits", "seit 10.04.2026", "PR 42">
---

Starte über Pi zwei frische Subagenten parallel mit dem `subagent`-Tool. Beide führen denselben Review-Auftrag aus: den Pi-Skill `/skill:review <scope>`.

- `<scope>` sind die User-Argumente, die Pi nach dem Skill-Aufruf an diese Skill-Anweisung angehängt hat.
- Leere Argumente → `uncommitted` als Default.
- Nutze für beide Subagenten `context: "fresh"`. Die Subagenten erhalten keinerlei Zusatzkontext: weder Ziel oder Motivation der Änderungen, noch Begründungen, Vorannahmen oder Hinweise auf erwartete Ergebnisse. Das Review soll unvoreingenommen auf Basis des Codes selbst erfolgen.
- Nutze das `subagent`-Tool im Parallel-Modus mit genau zwei Tasks und `concurrency: 2`.
- Verwende als Agent jeweils `delegate`.
- Nutze einen Timeout von 10 Minuten.
- Wähle vor dem Start genau ein Thinking-Level für beide Review-Agenten. Nutze den Modell-Suffix `:<thinking>` mit folgender Auswahl:
  - `medium`: Bei trivialen Änderungen, z. B. nur Dokumentation, reine Formatierung oder geänderte Werte in Konfigurationsdateien.
  - `high`: Standardfall für normale Code- und Teständerungen.
  - `xhigh`: Bei komplexen, risikoreichen oder sicherheitsrelevanten Änderungen.
- Verwende diese Modell-Overrides mit dem gewählten Thinking-Level:
  - GPT-Review: `model: "openai-codex/gpt-5.5:<thinking>"`
  - Opus-Review: `model: "claude-bridge/claude-opus-4-7:<thinking>"`
- Beispiel: `model: "openai-codex/gpt-5.5:high"`

Ersetze `<scope>` jeweils durch den ermittelten Scope-Text (`uncommitted`, falls leer).

## Ausgabe an den User

Jeder `/skill:review`-Subagent rahmt seinen Output mit `===BEGIN REVIEW===` / `===END REVIEW===` ein.

Gib dem Aufrufer eine einzige zusammengeführte Antwort zurück. Die Antwort besteht aus den beiden Reviews klar getrennt hintereinander, in dieser Reihenfolge:

1. GPT-Review (`openai-codex/gpt-5.5:<thinking>`)
2. Opus-Review (`claude-bridge/claude-opus-4-7:<thinking>`)

Format:

```markdown
## Review 1 — GPT-5.5 <thinking> (`openai-codex/gpt-5.5:<thinking>`)
<kompletter Output des GPT-Subagenten inklusive ===BEGIN REVIEW=== und ===END REVIEW===, byte-genau kopiert>

## Review 2 — Opus 4.7 Bridge <thinking> (`claude-bridge/claude-opus-4-7:<thinking>`)
<kompletter Output des Opus-Subagenten inklusive ===BEGIN REVIEW=== und ===END REVIEW===, byte-genau kopiert>
```

Kopiere die Subagent-Outputs byte-genau: Whitespace, Markdown, Code-Blöcke, Backticks, Umlaute — alles exakt wie vom jeweiligen Subagenten geliefert. Nur die beiden Überschriften und die Leerzeile zwischen den Reviews werden ergänzt.

## Fehlerbehandlung

Wenn ein Subagent fehlschlägt, Marker fehlen oder der Bereich zwischen den Markern leer ist, gib trotzdem das Ergebnis des anderen Subagenten zurück. Ersetze nur den betroffenen Review-Block durch einen klar markierten Fehlerblock:

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
- Die Aufgabe von `/cleanreview` endet mit der Rückgabe der zwei getrennten Review-Blöcke.
