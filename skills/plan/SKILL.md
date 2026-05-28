---
name: plan
description: Erstellt einen Plan in ./plan-<slug>.md, der in neuer Session mit sauberem Kontext ausgeführt wird.
disable-model-invocation: true
---

# plan

1. Klärung gemäß AGENTS.md.
2. Plan nach `./plan-<slug>.md` schreiben (`<slug>` selbst wählen). Inhalt:
   - **Intention:** Ziel, Motivation, Erfolgskriterien — bleibt nach der Umsetzung für die Einordnung der Review-Ergebnisse relevant.
   - **Änderungen:** so detailliert, dass der ausführende Agent ohne erneutes Nachdenken umsetzen kann (Dateien, Funktionen/Methoden, Tests, Edge Cases).
   - **Abschluss-Block am Ende:** Hinweis an den ausführenden Agent: Nach Umsetzung Abschluss-Checkliste aus AGENTS.md (Tests, Doku, cleanreview-Loop). Danach diese Plan-Datei löschen.
3. Plan von Subagent mit sauberem Kontext (`context: "fresh"`) kritisch hinterfragen lassen. Auftrag: tragende Annahmen, Lücken, Edge Cases, Risiken identifizieren — pro Punkt mit Empfehlung. Ergebnis als Liste zurück.
4. Empfehlungen einarbeiten, soweit sinnvoll und ohne User-Wissen möglich. Nur Punkte, die User-Klärung brauchen, gebündelt einmal nachfragen. Schritt 3+4 wiederholen, bis keine relevant neuen Punkte mehr kommen.
5. Plan-Pfad mitteilen und auf neue Session zum Ausführen hinweisen.
