---
name: review
description: Review code changes for bugs, security issues, and code quality.
argument-hint: <scope in Prosa, z.B. "uncommitted", "branch", "letzten 3 commits", "seit 10.04.2026", "PR 42">
---

Review-Auftrag: Nutze die User-Argumente, die Pi nach dem Skill-Aufruf an diese Skill-Anweisung angehängt hat. Fehlen Argumente, gilt `uncommitted`.

## Vorgehen

Es kann davon ausgegangen werden, dass alle tests passen. Im Rahmen dieses skills sollen daher keine Tests lediglich mit dem Ziel ausgeführt werden, um herauszufinden, ob die Tests passen. Eine Ausführung der Tests ist erlaubt, wenn ihr Output relevant für die Beurteilung der Qualität von Code oder Tests ist.

1. Projekt-`AGENTS.md` und/oder `CLAUDE.md` lesen, falls vorhanden (Coding-Standards).
2. Die angehängten User-Argumente interpretieren und Diff holen — siehe Scope-Mapping unten. Bei leerem Input: `uncommitted` als Default.
3. Bei unklaren Diff-Hunks die betroffene Datei/Funktion mit dem `read`-Tool komplett nachladen. Nicht aus Diff-Ausschnitten raten.
4. Selbst reviewen.
5. **Nicht-Befunde herausfiltern** (Pflichtschritt vor Ausgabe). Gehe den Draft Zeile für Zeile durch und streiche ersatzlos alles, was eine Prüfung beschreibt, die keinen Befund ergeben hat. Nur Sätze/Zeilen, die ein konkretes Problem oder einen konkreten Fix benennen, bleiben stehen. Typische Muster, die gestrichen werden:
   - "Ich habe X geprüft / untersucht / betrachtet, ist aber okay."
   - "Keine Probleme bei Y gefunden."
   - "Null-Handling / Threading / Injection / ... sieht gut aus."
   - "Race Conditions sind hier nicht relevant."
   - "Tests decken den Happy Path ab." (außer es ist ein echter Befund — dann in "Positiv")
   - Aufzählungen geprüfter Aspekte in der Zusammenfassung ("Ich habe A, B, C geprüft ...").
   - **Validierungs-Prosa**: "X ist korrekt gesetzt, weil …", "Y wirkt, weil …", "Die Property Z ist der offizielle Name, weil …" — das dokumentiert Review-Arbeit, liefert aber keinen Befund. Komplett raus.
   - **Argumentierte Nicht-Befunde**: "Könnte X passieren, wenn Y. In der Praxis aber Z, daher hält das Argument.", "Theoretisch könnte …, praktisch aber …" — wenn am Ende kein konkreter Fix steht, komplett raus. Wenn ja, auf den Fix reduzieren.
   - **Entkräftungs-Abschlüsse**: "Kein Handlungsbedarf.", "Nicht zwingend.", "Akzeptabel, sollte aber bewusst sein." — samt der vorausgehenden Herleitung streichen.
   
   Zusammenfassung: **genau ein Satz**, nur am Anfang. Kein Intro-Absatz davor ("Die Änderungen zerfallen in zwei Themen …"), kein wiederholendes Fazit am Ende, kein zweites Summary. Wer die kritischen Punkte am Ende nochmal in Prosa wiederholt, hat den Filter nicht angewendet.

## Scope-Mapping

Der User tippt das natürlich ein — interpretiere flexibel:

| Input (Beispiele) | Kommando |
|---|---|
| `uncommitted`, `working tree`, `staged`, leer | `git diff` + `git diff --staged` |
| `branch`, `feature branch`, `vs main` | `git diff $(git merge-base HEAD main)..HEAD` (oder `master` falls kein `main`) |
| `letzten N commits`, `last N` | `git log -n N -p` |
| `seit DD.MM.YYYY`, `since DD.MM.YYYY` | `git log --since="YYYY-MM-DD" -p` |
| `commit <hash>`, `<hash>` | `git show <hash>` |
| `PR <nr>`, `pull request <nr>` | GitHub-MCP: PR-Diff holen |

Unklar, welcher Scope gemeint ist? Einmal kurz nachfragen statt raten.

## Prüfkriterien (in dieser Reihenfolge)

1. **Alternative Lösungen** — Gibt es einen besseren Weg zum Ziel?
2. **Bugs** — Null-Handling, Race Conditions, Edge Cases, Logik.
3. **Security** — Injection, Auth, Datenlecks, Input-Validation.
4. **Test-Abdeckung** — Produktionscode geändert, aber keine Tests dazu? → **Kritisch**
5. **Geänderte Tests** — Tests geändert? → Wurde ihre Aussagekraft abgeschwächt? Inwiefern wird jetzt ein anderes Verhalten asserted als vorher?
6. **Projekt-Standards** — `AGENTS.md`-/`CLAUDE.md`-Regeln, Konventionen.
7. **Maintainability** — unklarer Code, fehlendes Error-Handling, Duplikate.
8. **Entfernungen** — Blieben nach Entfernungen irgendwelche Reste übrig?
9. **Performance** — N+1, unnötige Allokationen, Algorithmen.

## Output

Deutsch. Knapp. Jeder Befund: eine Zeile, Format `` `path:line` — Problem → Fix ``. Mehrzeilig nur wenn wirklich nötig (Code-Snippet).

```markdown
## Zusammenfassung
Ein Satz: was geändert wurde + Gesamteinschätzung.

## Kritisch
- `path/File.java:42` — NPE wenn `user` null → `Objects.requireNonNull(user)` am Methodeneinstieg
- `path/Other.java:10` — SQL-Injection in Raw-Query → `PreparedStatement` mit Bind-Param
- `path/NewFeature.java` — Produktionscode ohne Tests → Tests für Happy Path + Edge Cases ergänzen

## Empfehlungen
- `path/Foo.java:88` — Duplizierte Null-Checks → in Helper extrahieren
- `path/Bar.java:12` — N+1 in Schleife → Batch-Fetch via `findAllById`

## Positiv
- Nur wenn eine wirklich konkrete Einzelbeobachtung vorliegt (max. 1–2 Einträge).
```

Regeln:
- **Sektions-Whitelist**: Genau diese vier Sektionen sind erlaubt — `Zusammenfassung`, `Kritisch`, `Empfehlungen`, `Positiv`. Keine weiteren Sektionen, keine Sub-Sektionen ("Funktional korrekt", "Kleine Punkte", "Code-Qualität", "Test-Independence", "Dokumentations-Konsistenz" etc.), keine alternativen Überschriften, keine thematische Gruppierung innerhalb einer Sektion.
- Kein Befund in einer Sektion? Sektion komplett weglassen. `Positiv` ist **standardmäßig wegzulassen** — nur aufnehmen, wenn eine konkrete, benannte Beobachtung echten Mehrwert bringt (z. B. "gute Test-Abdeckung für Edge Case X"). "Sauber implementiert", "sinnvoll dokumentiert", "korrekt umgesetzt" sind Floskeln und gehören nicht rein.
- Keine leeren Floskeln ("sieht gut aus insgesamt"). Nur konkrete Beobachtungen.
- Keine Wiederholung des Diffs, keine Prosa-Erklärung der Änderung.
- Bei Code-Snippet im Fix: Fenced Code-Block direkt unter die Zeile, maximal ~5 Zeilen.

## Umrahmung

Gib deinen kompletten Review-Output umrahmt von diesen Markern aus — wortgleich, auf je einer eigenen Zeile, ohne Code-Block drumherum:

```
===BEGIN REVIEW===
<dein Review-Output nach obigem Template>
===END REVIEW===
```

Nichts außerhalb der Marker ausgeben. Keine Einleitung davor, keine Nachbemerkung dahinter.
