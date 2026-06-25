---
name: review
description: Review code changes for bugs, security issues, and code quality.
argument-hint: <scope in Prosa, z.B. "uncommitted", "branch", "letzten 3 commits", "seit 10.04.2026", "PR 42">
---

Review-Auftrag: Nutze die User-Argumente, die Pi nach dem Skill-Aufruf an diese Skill-Anweisung angehängt hat. Fehlen Argumente, gilt `uncommitted`.

## Vorgehen

Es kann davon ausgegangen werden, dass alle tests passen. Im Rahmen dieses skills sollen daher keine Tests lediglich mit dem Ziel ausgeführt werden, um herauszufinden, ob die Tests passen. Eine Ausführung der Tests ist erlaubt, wenn ihr Output relevant für die Beurteilung der Qualität von Code oder Tests ist.

1. Projekt-`AGENTS.md` und/oder `CLAUDE.md` lesen, falls vorhanden — Standards, Verträge, Datenmodell.
2. Die angehängten User-Argumente interpretieren und Diff holen — siehe Scope-Mapping unten. Bei leerem Input: `uncommitted` als Default.
3. Bei unklaren Diff-Hunks die betroffene Datei/Funktion mit dem `read`-Tool komplett nachladen. Nicht aus Diff-Ausschnitten raten.
4. Selbst reviewen — methodisch. *Bevor* du urteilst: pro geänderter Einheit Hypothesen aufstellen, wie sie kaputtgehen könnte (welcher Input/Zustand führt zu welchem falschen Outcome?), diese erst dann am Code verifizieren/widerlegen. Verhindert das Ankern auf „sieht okay aus":
   - **Verträge:** Jedes geänderte Verhalten gegen dokumentierte Verträge/Datenmodell/Zod-Schemas in `AGENTS.md`/`CLAUDE.md` kreuzprüfen; Vertrags-/Spec-Aussagen vor Meldung am echten Code verifizieren, nicht auf Doku allein.
   - **Backward-Compat:** Ändert sich ein Schema, Typ, Vertrag oder ein gespeicherter Wert? → Was passiert mit Alt-Daten, die noch in alter Form liegen, und mit Clients/Calls, die die alte Form erwarten? Migration/Parsing für den Alt-Bestand prüfen, nicht nur für Neuschreibungen.
   - **Aufrufkontext:** Default: pro geänderte Funktion mindestens einen Caller und einen Callee lesen und die Änderung im Integrationskontext prüfen — Diff-only verpasst Integrationsfehler. Bei public/exportierten Funktionen oder geänderter Signatur/Semantik: *alle* Caller via projektweiter Suche (`grep`/`rg`) ermitteln — Integrationsbrüche sitzen oft im einzigen nicht gelesenen Aufrufer.
   - **Edge Cases:** Pro geänderte Verzweigung/reine Funktion ein Edge-Set *durchlaufen* (nicht nur auflisten) mit 2–3 konkreten Inputs incl. Grenze/leer: leer, 0, negativ, Overflow/Grenze, null/undefined, Nebenläufigkeit/Re-Entranz. Liste nicht erschöpfend — weitere domänenrelevante Klassen bewusst prüfen (z. B. Stale-Data/Caching, Partial-Failure/Resource-Leak, Determinismus/Float-Gleichheit, Zeit/Timezone, unbounded Growth/DoS).
   - **Failure-Path-Vollständigkeit:** Jeder neue/geänderte `catch`, early-return, Exception oder async-reject → Cleanup bei vorzeitigem Ausstieg, Partial State, geschluckter/verschluckter Fehler, Resource-Leak. Fehlerpfade werden systematisch unterschätzt — einzeln durchgehen, nicht als „nur Error-Handling" überspringen.
   - **Repro:** Bei nicht-trivialem vermutetem Bug ein kleines Repro/Test schreiben und ausführen, bevor gemeldet wird — bestätigt echte Funde, dämpft Fehlalarme (zielgerichtet, keine Suite-Re-Verifikation).
   - **Security/Rules/Auth:** Berührt der Diff Security Rules, Auth oder Access Control → eigene Audit-Runde Rules-vs-Datenmodell-vs-Bedrohungsmodell: Cross-User-Zugriff? Jede Access-Control-Entscheidung vertraut auf ein Signal (Identität, Verifizierung, Rolle, Besitz) — kann es gefälscht/fehlen/umgangen werden? Ist der Owner korrekt verknüpft? Können gelöschte/gesperrte Objekte reaktiviert oder mutiert werden? Projektspezifische Signale (z. B. `email_verified`, Soft-Delete) stehen in der Projekt-`AGENTS.md` — dort nachschlagen, nicht hier als fest eingebaut annehmen.
5. **Blindspot-Pass** (vor dem Filtern, gegen die eigenen blinden Flecken). Leg den Befund-Draft kurz beiseite und frag dich offen — ohne feste Checkliste —, was du noch nicht betrachtet hast: Was tut der Code *nicht*, was er müsste? Was passiert bei Teilausfall, ungewöhnlicher Reihenfolge, gleichzeitiger Nutzung, leerer/maximaler Eingabe? Welche geänderte Datei/Funktion hast du noch gar nicht angesehen? Geh jedem so entstandenen Verdacht konkret im Code nach. Der Pass erzeugt **keinen eigenen Output**: Bestätigte Funde wandern in die normalen Sektionen, alles Übrige verfällt im nächsten Schritt.
6. **Nicht-Befunde herausfiltern** (Pflichtschritt vor Ausgabe). Gehe den Draft Zeile für Zeile durch und streiche ersatzlos alles, was eine Prüfung beschreibt, die keinen Befund ergeben hat. Nur Sätze/Zeilen, die ein konkretes Problem oder einen konkreten Fix benennen, bleiben stehen. Typische Muster, die gestrichen werden:
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
4. **Test-Abdeckung & -Assertion** — Produktionscode geändert, aber keine Tests dazu? → **Kritisch**. Bestehende Tests: asserten sie die echte Invariante (Wert, Reihenfolge, Zustand) statt nur „wurde aufgerufen"? Schwache/duplikative Assertions markieren; Tests benennen, die bei kaputtem Verhalten trotzdem grün blieben.
5. **Geänderte Tests** — Tests geändert? → Wurde ihre Aussagekraft abgeschwächt? Inwiefern wird jetzt ein anderes Verhalten asserted als vorher?
6. **Projekt-Standards & Verträge** — `AGENTS.md`-/`CLAUDE.md`-Regeln, Verträge, Datenmodell, Schemas.
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
- **„Kritisch" braucht ein Trigger-Szenario**: bei Verhaltens-Bugs konkreter Input/Zustand → konkretes falsches/schädliches Outcome. Lässt sich keines benennen → Empfehlung oder streichen. Ausnahme: strukturelle Befunde ohne Trigger (z. B. Produktionscode ohne Tests, fehlende Validation) bleiben „Kritisch" — siehe Prüfkriterium Test-Abdeckung. Dämpft Fehlalarme und hält „Kritisch" vertrauenswürdig.
- **Sektions-Whitelist**: Genau diese vier Sektionen sind erlaubt — `Zusammenfassung`, `Kritisch`, `Empfehlungen`, `Positiv`. Keine weiteren Sektionen, keine Sub-Sektionen ("Funktional korrekt", "Kleine Punkte", "Code-Qualität", "Test-Independence", "Dokumentations-Konsistenz" etc.), keine alternativen Überschriften, keine thematische Gruppierung innerhalb einer Sektion.
- Kein Befund in einer Sektion? Sektion komplett weglassen. `Positiv` ist **standardmäßig wegzulassen** — nur aufnehmen, wenn eine konkrete, benannte Beobachtung echten Mehrwert bringt (z. B. "gute Test-Abdeckung für Edge Case X"). "Sauber implementiert", "sinnvoll dokumentiert", "korrekt umgesetzt" sind Floskeln und gehören nicht rein.
- Keine leeren Floskeln ("sieht gut aus insgesamt"). Nur konkrete Beobachtungen.
- Keine Wiederholung des Diffs, keine Prosa-Erklärung der Änderung.
- Findung verletzt einen dokumentierten Vertrag/eine Regel? Diese(n) benennen/zitieren — macht den Befund verlässlich und schneller triagierbar.
- Bei Code-Snippet im Fix: Fenced Code-Block direkt unter die Zeile, maximal ~5 Zeilen.

## Umrahmung

Gib deinen kompletten Review-Output umrahmt von diesen Markern aus — wortgleich, auf je einer eigenen Zeile, ohne Code-Block drumherum:

```
===BEGIN REVIEW===
<dein Review-Output nach obigem Template>
===END REVIEW===
```

Nichts außerhalb der Marker ausgeben. Keine Einleitung davor, keine Nachbemerkung dahinter.
