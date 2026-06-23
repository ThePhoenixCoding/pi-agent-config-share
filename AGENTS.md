# Globale Arbeitsanweisungen

Diese Anweisungen gelten für alle pi-Sessions. Projektspezifische `AGENTS.md`-Dateien haben bei Widersprüchen vorrang.

## Workflow

Standard-Ablauf für jede nicht-triviale Aufgabe:

1. **Klären** — Fragen stellen (siehe `Klärung vor der Umsetzung`)
2. **Planen & selbst-reviewen** — konkreten Umsetzungsplan formulieren und kritisch hinterfragen; bei neuen Unklarheiten zurück zu Schritt 1.
3. **Failing Tests schreiben** — Happy Path, Unhappy Paths und Edge Cases; ausführen und sicherstellen, dass sie rot sind (Details: Verhalten).
4. **Produktionscode schreiben** — bis die Tests grün sind.
5. **Abschließen** — Tests, Doku, Review-Loop (Details: Abschluss-Checkliste).

## Klärung vor Umsetzung

- Bevor du mit der Umsetzung einer Aufgabe beginnst, identifiziere explizit offene Fragen, Mehrdeutigkeiten und implizite Annahmen in meinem Auftrag.
- Stelle diese Fragen über das `ask_user_question`-Tool, bevor du Code schreibst oder Tools zur Änderung aufrufst. Frage gebündelt, nicht in mehreren Runden. Stelle die Fragen mit der nötigen Erklärung — nicht immer kenne ich die Services, die wir bearbeiten.
- Formuliere pro Frage konkrete Antwortoptionen, damit ich schnell wählen kann.
- Falls meine Antworten neue Unklarheiten aufwerfen oder dir unlogisch oder nicht zueinander passend erscheinen, frage noch mal gezielt nach; vermute nicht implizit meine Intention.
- Nur wenn die Aufgabe trivial und eindeutig ist (z. B. Tippfehler, reine Formatierung, offensichtliches Refactoring), darfst du ohne Rückfrage starten.
- Nach meinen Antworten: erstelle einen konkreten Umsetzungsplan und hinterfrage ihn dann kritisch selbst. Prüfe auf Lücken, falsche Annahmen, übersehene Edge Cases, zu großen Scope und bessere Alternativen. Korrigiere den Plan entsprechend.
- Wenn bei dieser Selbstprüfung neue offene Fragen auftauchen, frage erneut per `ask_user_question` nach. Iteriere so lange, bis keine relevanten Fragen mehr offen sind.
- Erst danach mit der Implementierung beginnen (ohne weitere Autorisierung von mir).

## Verhalten

- Wenn ich dir eine Frage stelle, möchte ich lediglich eine Antwort haben. Interpretiere aus Fragen keine versteckten Arbeitsaufträge, auch wenn sie kritisch sind.
- Bevor du Code änderst oder einen Bug untersuchst, schreibe zuerst Tests für das gewünschte Verhalten. Decke Happy Path, Unhappy Paths und Edge Cases ab. Führe die Tests vor dem Schreiben des Codes aus, um zu verifizieren, dass sie noch nicht bestehen. Erst dann Produktionscode schreiben.
- Bei Bugs, Testfehlern oder unerwartetem Verhalten zuerst die Ursache verstehen, nicht das Symptom patchen. Wenn die Ursache nicht klar ist, mehr Evidenz sammeln, statt zu raten.
- Wenn ein Test fehlschlägt, bewerte explizit, ob der Test nicht korrekt ist oder ob der Produktionscode nicht wie beabsichtigt reagiert.
- Wenn du beim Schreiben eines Tests einen Bug entdeckst, behebe den Bug und erkläre mir Bug und Fix.
- Sorge immer für Test-Unabhängigkeit, indem du State zwischen den Tests zurücksetzt.
- Null Pointer Exceptions sind immer Bugs. Sie müssen gefixt werden.

- Für GitHub-Operationen nutze die `gh`-CLI.
- Für lesenden Zugriff auf ein Github-Projekt zuerst in `~/git/` schauen; falls vorhanden, dort pullen und lesen.
- Standardmäßig keine Kommentare im Code. Intentions-Beschreibungen sind erlaubt, falls die Absicht nicht trivial aus dem Code hervorgeht.
- Pushe nicht und committe nicht, außer ich fordere dich explizit dazu auf. Falls wir nicht auf main/master committen/pushen würden, warne mich immer explizit! Falls ich dich zum pushen aufgefordert habe, nutze niemals --force.
- Skippe niemals tests oder nutze --no-verify, außer ich fordere dich explizit dazu auf.

## Abschluss-Checkliste

Sobald die letzte Code-Änderung gemacht ist, führst du folgende Schritte selbstständig aus — auch bei vermeintlich trivialen Änderungen, ohne Rückfrage oder Ankündigung:

1. **Tests ausführen.** Alle Tests im Projekt müssen grün sein. Wenn nicht, den Code fixen. Tests werden nie angepasst, damit sie grün werden — Ausnahme: das Verhalten wurde absichtlich geändert und die Tests müssen das widerspiegeln.
2. **Doku prüfen.** Wenn Verhalten, Architektur oder Verträge geändert wurden, `AGENTS.md`, `CLAUDE.md` und `README.md` prüfen und ggf. aktualisieren. Dokumentiere nur, was Menschen/Agenten wissen müssen und was nicht sowieso aus dem Code/den Tests eindeutig hervorgeht, die für die Arbeit an einer Aufgabe ohnehin eingelesen werden müssen.
    - Dokumentiere Architektur, Konventionen, Verträge, Policies
    - Nicht offensichtliche Nebenwirkungen/Gotchas auf als Kommentare am Code.
    - Dokumentiere keine Code-Paraphrasen, Methodennamen, Konstanten oder Details, die bei kleinen Codeänderungen mitwandern müssten.
    - Wenn besserer Code oder bessere Tests die Erklärung ersetzen können, bevorzuge Code/Test gegenüber Doku.
3. **Review.**
    - Maximal zwei Review-Zyklen ausführen: initialer `/cleanreview`, danach höchstens ein erneuter `/cleanreview`.
    - Nach jedem Review alle Vorschläge, die du für sinnvoll hältst, selbstständig einarbeiten.
    - Nach dem zweiten Review keine weitere Review-Runde starten, auch wenn du danach noch Vorschläge einarbeitest.

## Kontext-Disziplin

- Halte große Rohdaten aus dem Kontext: filtere Tool-Output an der Quelle (`grep`/`head`/`wc`/`jq`/`awk` in `bash`, `read` mit `offset`/`limit`, `fetch_content` statt `curl`, `subagent` mit `context: "fresh"` für umfangreiche Recherche) und liefere mir nur das abgeleitete Ergebnis.

## Grafana/Loki

- Service-Logs in dev/live über Grafana/Loki lesen, nicht über Kubernetes.
- Datasources über `grafana_list_datasources(type=...)` bestimmen und UIDs verwenden.
- Loki-Label-Schema mit `grafana_list_loki_label_names` verifizieren; Queries eng filtern: `environment`, `service`/`service_name`, kurzes Zeitfenster.
- Für Checks zuerst Count-/Existenzqueries nutzen; Raw-Logs nur bei Bedarf und mit kleinem `limit`; Stacktraces nur einzeln laden.
- Keine breiten Regexe oder Label-Value-Queries ohne enge Label-Filter.

## Build- und Test-Output

- Maven über `~/.pi/bin/sdk-mvnw` (mit Wrapper) bzw. `~/.pi/bin/sdk-mvn` (ohne) aufrufen. Die Wrapper sourcen SDKMAN intern, sodass `mvn`/`java` ohne weitere Shell-Vorbereitung verfügbar sind.
- Test-Output in Datei umleiten, z. B. `~/.pi/bin/sdk-mvnw clean verify > /tmp/pi/build-output-<slug>.txt 2>&1`. `<slug>` zu Session-Beginn selbst wählen und für alle Test-Läufe der Session wiederverwenden.
- Die gespeicherte Datei mit gefilterten `bash`-Kommandos und dem `read`-Tool analysieren (nicht `cat`/ungefilterte Ausgabe), statt Kontext während des Test-Laufs zu holen.
- Nach Code-Änderungen Tests erneut laufen lassen.

## Testen im Dev/Live

- Für REST API-Requests im Dev nutze die folgenden Credentials:
  - mit Admin-Rechten (webuser w0; diesen standardmäßig benutzen): `-u "$duser0:$decret0"`
  - ohne Admin-Rechte (webuser w1): `-u "$duser1:$decret1"`
- Für REST API-Requests im Live nutze die folgenden Testaccount-Credentials:
  - mit Admin-Rechten (webuser w0, masterSipId 3880238; diesen standardmäßig benutzen): `-u "$luser0:$lecret0"`
  - mit Admin-Rechten (webuser w0, masterSipId 3809504): `-u "$luser1:$lecret1"`
  - ohne Admin-Rechte (webuser w4, masterSipId 3880238): `-u "$luser2:$lecret2"`
- Du darfst schreibende Operationen ausführen, musst sie aber nach deinen Tests wieder rückgängig machen

### Push API testen

- Für echte Push-API-Tests immer einen eigenen Kunden-Server aufsetzen, der HTTPS-erreichbar ist (z. B. lokaler Python/Node-Server hinter ngrok) und alle Requests mit Headern, Pfad und form-urlencoded Body protokolliert.
- Der Kunden-Server muss innerhalb von 1 Sekunde mit `application/xml` antworten; für Followups bei `newCall` z. B. `<Response onAnswer="https://.../answer" onHangup="https://.../hangup" />`, sonst `<Response />`.
- Webhook-URLs über `PUT /v2/settings/sipgateio` auf den Testserver setzen. Anschließende Wiederherstellung ist nicht nötig.
- Header-Namen case-insensitiv prüfen: Dev/ngrok/Python können z. B. `X-Sipgate-Pushapi-Version` statt exakt `X-Sipgate-PushApi-Version` anzeigen.
- Bei REST-API-Problemen zusätzlich Grafana/Loki prüfen: Gateway-Fehler können im `rest-api-v2-service` liegen, während `sipgateio-frontend-api-service` oder `hi-iti-push-api-service` bereits korrekt arbeiten.

## Informationsquellen (vor dem Lesen immer erst pullen!)
- [REST API (v2, pulsar)](~/git/sipgateio-llms-docs/docs/rest-api.md)
- [Push API](~/git/sipgateio-llms-docs/docs/push-api.md)
- [CI Webhooks](~/git/sipgateio-llms-docs/docs/ci-webhooks.md)
