---
name: analyze-exception-alert
description: Correlates exception-alert metrics from `.sipgate/nautilus.yaml` with "Exception:" Loki logs, traces the cause into code, and proposes fixes such as whitelisting or resilience patterns.
argument-hint: <Zeitfenster oder Umgebung>
disable-model-invocation: true
---

Cwd muss das Service-Repo mit `.sipgate/nautilus.yaml` sein — sonst nachfragen. Grafana/Loki-Grundregeln stehen in der globalen `AGENTS.md`.

**Kontextsparend arbeiten**
- Schlanker Pfad: Metrik → Top-Exception-Typen → enge Loki-Belege → gezielte Codezeilen; erst danach erweitern.
- Nur Exception-Typen mit Count > 0 vertiefen;
- `rg`, Log-Queries und Line-Ranges eng filtern; große Rohoutputs vermeiden.

1. **Kontext**
   - Aus `.sipgate/nautilus.yaml` den Exception-Alert-Metriknamen auslesen.
   - Umgebung aus den von Pi angehängten User-Argumenten bestimmen: `dev` prüft nur Dev, `live` prüft nur Live; default `live`.
   - Zeitfenster aus den übrigen User-Argumenten bestimmen; default `last 48h`.
   - Prometheus: `queryType="instant"`, `endTime="now"`, Fenster als PromQL-Range (`increase(...[<window>])`) bevorzugen.
   - Loki: `startRfc3339`/`endRfc3339` ohne Subsekunden berechnen, z. B. `YYYY-MM-DDTHH:mm:ssZ`.
2. **Prometheus**
   - Datasources mit `grafana_list_datasources(type="prometheus")`; UID verwenden.
   - Zuerst Default-Prometheus verwenden; nur wechseln, wenn die Metrik dort fehlt.
   - Top-Exceptions:
     ```
     topk(10, sum by (exception_type) (increase(<metric>{cluster_nautilus_sipgate_cloud_environment="<env>"}[<window>])))
     ```
3. **Loki-Datasource und Service-Labels**
   - Default: Loki erst bei mindestens einem Prometheus-Exception-Count > 0 prüfen.
   - Loki trotzdem minimal gegenprüfen, wenn Prometheus 0 liefert, Metrik/Labels unplausibel sind oder Alert und Prometheus-Ergebnis widersprechen.
   - Datasources mit `grafana_list_datasources(type="loki")`; Label-Schema mit `grafana_list_loki_label_names` im Zeitfenster prüfen.
   - Verwende nur Datasources mit `environment` plus `service` oder `service_name`. Datasources mit nur `deployment_environment`/`app_id` verwerfen, außer eine enge Existenzquery findet den Service dort.
   - Keine breiten `grafana_list_loki_label_values` über alle Services/Pods. Service-Selector nur mit engen Count-/Existenzqueries validieren, z. B. `{service="<name>",environment="<env>"}` oder `{service_name="<name>",environment="<env>"}`.
4. **Logs pro Exception-Typ**
   - Setze `<sel>` auf `{<service-label>="<name>",environment="<env>"}`.
   - Analysiere Typen mit Prometheus-Count > 0; bei Prometheus-0/Inkonsistenz nur Loki-Gegencheck-Treffer aus `<sel> |= "Exception:"`.
   - Erst Count/Existenz, dann Raw-Logs. Für Counts `grafana_query_loki_stats` oder klein bleibende Queries nutzen; aus Range-Counts nur finalen Count/Existenzbefund übernehmen.
   - Message-Beispiele, `limit: 3`: `<sel> |= "Exception: <type>" | json msg="message" | line_format "{{.msg}}"`
   - Erste/letzte Logzeile mit `direction: forward`/`backward`, je `limit: 1`.
   - Ein vollständiges Trace-Sample, `limit: 1`: `<sel> |= "Exception: <type>" | json msg="message", thread="thread", stack_trace="stack_trace" | line_format "{{.msg}}\nthread={{.thread}}\n{{.stack_trace}}"`
5. **Code-Pfad belegen**
   - Mit `rg -n` suchen; relevante Stellen mit Line-Ranges belegen, z. B. `nl -ba <file> | awk 'NR>=x && NR<=y {print}'`.
   - Wenn Line-Ranges nicht reichen: Kontext gezielt erweitern auf vollständige Klasse, Caller/Callee, Tests, Konfiguration, Retry-/Transaktionsgrenzen.
   - App-eigene Exceptions: nach `<Type>` greppen.
   - Framework-/Library-Exceptions: obersten Repo-Frame des reduzierten Sample-Stacktraces öffnen; zusätzlich nach verwandten Typen greppen, z. B. Spring-DB: `PessimisticLockingFailureException`, `DeadlockLoserDataAccessException`, `CannotAcquireLockException`.
   - `ExceptionMetricsAspect` prüfen: hätte der Typ als Client-Fehler zählen müssen?
   - Wenn Stacktrace-Zeilennummern nicht zum aktuellen Code passen oder aktueller Code bereits eine plausible Gegenmaßnahme enthält: `git log --oneline -5 -- <betroffene Dateien>` prüfen; als Deployment-Hypothese formulieren, nicht als sicheren Root Cause.
6. **Doppelzählung nur bei Indizien**
   - Zuerst tatsächlichen `ExceptionMetricsAspect`-Pointcut prüfen.
   - Indizien: mehrere `AspectJAfterThrowingAdvice`-Frames, Logs/Metriken mehrfach pro fachlichem Fehler oder identische Message + Thread + Node innerhalb weniger Millisekunden.
   - Nur dann in engem Sekundenfenster mit `limit <= 20` identische Message + Thread + Node nachzählen und Inflationsfaktor nennen.
   - Filter ohne `OncePerRequestFilter` können denselben Fehler zusätzlich als `ServletException` liefern; nur prüfen, wenn Stacktrace/Exception-Typ darauf hinweist.

## Output

Deutsch, knapp, ausreichend belegt. Leere Sektionen weglassen. Jeder Befund braucht Beleg (Logzeile, Zahl, `file:line`). Unsicherheit als Hypothese markieren. Keine „geprüft, sieht ok aus"-Sätze.

```
===BEGIN ALERT ANALYSIS===
## Kontext
Service · Alert(s) · Fenster · Gesamt-Count.

## Top Exceptions
| exception_type | Count | Erste | Letzte |

## Pro Exception-Typ
### `<type>` (<count>×)
- Message-Beispiele
- Wurfstelle: `file:line`
- Trigger-Pfad
- Root Cause (oder "Hypothese: …" bei dünnen Belegen)
- Lösungsvorschläge (nur zutreffende): Code-Fix · Whitelisting im Aspect · Retry/Circuit-Breaker · Test-Lücke

## Empfehlung
Ein Satz, nächster Schritt + Priorität.
===END ALERT ANALYSIS===
```

Rein analytisch: Ursachen und konkrete Fix-Vorschläge liefern, aber nichts umsetzen.
