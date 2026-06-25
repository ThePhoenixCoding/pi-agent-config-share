---
name: analyze-renovate-failure
description: Analysiert fehlgeschlagene Renovate-Build- und dadurch ausgelöste Deploy-Runs im aktuellen Projekt, rerunnt eindeutige CI-Infra-Probleme und fixt nachvollziehbare flaky Tests ohne Commit/Push.
argument-hint: <Zeitfenster, default "last 48h">
disable-model-invocation: true
---

Zeitfenster aus den von Pi angehängten User-Argumenten bestimmen; default `last 48h`. Kompakt arbeiten: GitHub-JSON und gefilterte Logs statt Voll-Logs im Kontext.

## 1. Runs finden und zuordnen

- Mit `gh run list --limit ... --json databaseId,number,workflowName,displayTitle,event,headBranch,headSha,status,conclusion,createdAt,updatedAt,url` Runs im Zeitfenster suchen.
- Renovate-Runs sind Runs mit Renovate-Titel, `renovate/*`-Branch, Renovate-Bot-Commit/PR oder `nautilus-renovate-*` Autor.
- Deploy-Runs (`repository_dispatch` auf `main`) Renovate zuordnen über `headSha`/Main-Commit/PR-Merge-Commit. Nicht offene PRs für Deploys verantwortlich machen, wenn `headSha` bereits auf `main` liegt.
- Für PRs `gh pr view <nr> --json title,state,mergedAt,headRefName,headRefOid,baseRefOid,mergeStateStatus,statusCheckRollup,url` nutzen.
- Immer zwischen `pull_request` Build-Runs und `repository_dispatch` Deploy-Runs unterscheiden.
- Bei erneuten Runs/Fragen zu "run #1" Attempts beachten: `gh run view <run> --attempt 1 ...`; sonst latest Attempt analysieren.

## 2. Fehler kompakt klassifizieren

Für fehlgeschlagene Jobs zuerst Metadaten, dann nur fehlgeschlagene Logs:

```bash
gh run view <run-id> --json number,status,conclusion,event,workflowName,displayTitle,jobs,url
gh run view <run-id> --job <job-id> --log-failed | rg -n "failed to connect|Docker pull failed|unexpected end|TimeoutException|ConditionTimeout|BUILD FAILURE|COMPILATION ERROR|ERROR|Process completed" | tail -n 80
```

Klassifikation:

1. **Eindeutiges CI-/Infra-Problem** — z. B. Docker-Socket fehlt, Docker pull/setup action scheitert vor Projektcode, `crane`/Download `gzip: unexpected end of file`, Proxy/Runner/Netzwerk transient, GitHub Actions Setup-Fehler.
2. **Flaky Test/Test-Harness** — z. B. Awaitility-/Future-Timeout, EmbeddedKafka Timing, Counter-Baseline nach `produce`, `producer.send()` ohne bounded `.get`, nicht-threadsafe Test-Listener, harte zu knappe Kafka-Timeouts.
3. **Dependency/Production-Code-Problem** — Compile-/Runtime-/Testfehler, der plausibel durch die neue Dependency und Production Code verursacht wird.

## 3. Aktionen

### Git-Branch-Hygiene bei Renovate-Branches

- Wenn für Analyse, Fix, Commit oder Push ein `renovate/*`-Branch ausgecheckt wird, den Ausgangsbranch merken und am Ende der Session **nach allen Pushes** zwingend wieder `main` auschecken. Das Zurückwechseln muss nicht direkt nach dem einzelnen Arbeitsschritt passieren, aber vor der finalen Antwort.
- Vor der finalen Antwort mit `git branch --show-current` prüfen und, falls noch auf einem Renovate-Branch, `git checkout main` ausführen. Wenn das fehlschlägt, explizit berichten.
- Falls Code oder Tests geändert wurden und dadurch ein neuer Commit auf dem Renovate-Branch gepusht wurde: den Nutzer in `## Ergebnis / nächster Schritt` ausdrücklich darauf hinweisen, dass der zugehörige Renovate-PR manuell gemerged werden muss.

### CI-/Infra-Problem

- Nur bei eindeutiger Infra-Signatur ohne Rückfrage den kompletten Workflow-Run neu starten:

```bash
gh run rerun <run-id>
```

- Danach kurz mit `gh run view`/`gh run list` prüfen, ob er queued/in_progress ist. Keine Codeänderung.

### Deploy-Workflow-Fehler

- Bei eindeutiger Infra-Signatur ganzen Deploy-Workflow per `gh run rerun <run-id>` neu starten.
- Nach Rerun berichten, welchen Pfad der Workflow genommen hat (`approve-live` läuft/erfolgreich/geskippt, `notify-renovate-auto-approval-blocked` gelaufen). Wenn außerhalb dieser Workflow-Logik manuelle Approval nötig wäre: nicht selbst approve, sondern Nutzer fragen.

### Flaky Test

- Ohne Rückfrage fixen, wenn der Test/Test-Harness selbst flaky ist und Production Code plausibel korrekt ist.
- Nicht nur den konkret gefallenen Test fixen: mit `rg` alle Tests im Projekt auf dieselbe Schwachstelle prüfen und konsistent beheben.
- Danach betroffene Tests und abschließend Projekt-Verify nach lokalen Regeln ausführen. Bei Maven Output in Datei umleiten und gefiltert lesen.
- Review-Loop nach Projektregeln ausführen. **Nicht committen oder pushen**, außer der Nutzer genehmigt es explizit.
- Wenn der Nutzer Commit/Push genehmigt und dafür der Renovate-Branch ausgecheckt wird: nach dem Push gemäß `Git-Branch-Hygiene bei Renovate-Branches` zurück auf `main` wechseln und auf den notwendigen manuellen PR-Merge hinweisen.

### Production-Code-/Dependency-Problem

- Nicht automatisch Production Code ändern.
- Root Cause belegen
- Dem Nutzer konkrete Optionen erklären und nachfragen, bevor Production Code geändert wird.

## 4. Kontextdisziplin

- Keine breiten Voll-Logs. Logs nach Fehlersignaturen filtern; vollständige Logs nur gezielt in temporäre Dateien speichern.
- Für viele Runs Tabellen mit `jq` erzeugen; nur Run-ID, Workflow, Event, Branch, SHA, Conclusion, URL in den Kontext übernehmen.
- Bei Deploy-Verwirrung immer `headSha`, `event`, `displayTitle` und `git show -s <sha>` vergleichen.
- Bei Renovate-Automerge auch `renovate/stability-days`, `mergeStateStatus`, failing checks und `autoMergeRequest` prüfen.

## Output

Deutsch, kurz, mit Aktionen. Leere Sektionen weglassen. Unsicherheit als Hypothese markieren.

```markdown
## Kontext
- Repo/Branch · Fenster · Renovate PRs/Runs · zugehörige Deploys

## Befunde
- `<run>` `<workflow>`: Ursache · Beleg · Klassifikation

## Aktionen
- Neu gestartet: ...
- Gefixt: Dateien + Tests
- Nicht automatisch geändert: Production-Code-/Dependency-Themen mit Begründung

## Ergebnis / nächster Schritt
Ein kurzer Satz, was jetzt noch vom Nutzer nötig ist.
```
