# Doggy Style Workspace - GB372 Ladefolge-Korrektur

Stand: 20. Oktober 2026. Vollständige korrigierte Testfassung. Native Safari-/iOS- und vollständige Live-Firebase-Prüfungen bleiben offen.

## Gemeldeter Fehler und bestätigte Ursache

Der Benutzer meldet auf dem iPad mit GB371 für HTML und JavaScript beim Klick auf Heute drucken: undefined is not an object (evaluating Core.dateISO). Firebase ist verbunden und der Workspace vom Server bestätigt.

Die ausgelieferte GB371-HTML lädt workforms-print.js vor workflow-core.js. Das Druckmodul übernimmt beim Laden root.DSWorkflowCore in seine lokale Factory. Zu diesem Zeitpunkt ist der Wert undefined. Dass das Grundmodul danach erfolgreich geladen wird, ändert diesen bereits übernommenen Wert nicht. Beim späteren Drucken scheitert deshalb Core.dateISO. Der Integrationsgenerator setzte den Druckblock vor die übrigen Workflow-Abhängigkeiten.

Der Fehler wurde mit der unveränderten GB371-HTML und ihren tatsächlichen lokalen Skript-Tags in Chromium reproduziert. Die reproduzierte Browsermeldung nennt ebenfalls dateISO. Der getrennte Nachweis gb371-load-reproduction.json enthält zwei erwartete Fehlerreproduktionen.

## Lücke der bisherigen Tests

Die vorherigen 301 lokalen Prüfungen bestanden. Der Drucktest entfernte jedoch die Skript-Tags aus der HTML und lud ausgewählte Module selbst in einer funktionierenden Reihenfolge. Die eigentliche Ladefolge des ausgelieferten Pakets war dadurch nicht geprüft. Deshalb konnte GB371 trotz dieser Prüfergebnisse beim tatsächlichen Browseraufruf scheitern. Die damalige Ausgabe bleibt als historischer Nachweis erhalten und ist durch diese Korrektur überholt.

## Reparatur

Der Generator ordnet die Skripte jetzt anhand ihrer Abhängigkeiten an: browser-store, workflow-core, workflow-ui, workspace-repair-ui, communication-core, customer-portal, PDF-Bibliothek und Schrift, document-output, workforms-print, app.js. Die bestehende defer-Ausführung bleibt erhalten. Das Grundmodul ist beim Erzeugen des Druckmoduls verfügbar. Fehlt eine benötigte Grundfunktion tatsächlich, gibt build eine verständliche Meldung über fehlende App-Dateien aus.

Alle betroffenen Build- und Cacheverweise verwenden M50.9.9GB372_LOAD_ORDER_TEST_20261020. Die vorhandenen vendor-Dateien bleiben unverändert. Die in GB371 bereinigten Arbeitsblätter, die erreichbare Dokumentvorschau, die aktuelle Aufenthaltsquelle und die echte PDF-Ausgabe bleiben enthalten. Frühere Nachweise werden nicht verändert oder entfernt.

Firebase-Konfiguration, Firestore- und Storage-Regeln sowie die sechs unveränderten Workflow-/Speichermodule sind bytegleich mit GB371. Auch Dokumentdialog, dessen CSS und die beiden PDF-/Schriftdateien sind unverändert. app.js, auth.js, customer.html, login.html, index.html, manifest.json und sw.js unterscheiden sich ausschließlich durch die Buildkennung. gb372-backend-preservation.json protokolliert diese Vergleiche. Es wird kein Bestand repariert und keine Regelveröffentlichung benötigt.

## Neue Prüfung mit tatsächlichen HTML-Skripten

script-load-workflow.cjs lädt die ausgelieferte app.html über einen lokalen HTTP-Server. Der Browser führt deren lokale Skript-Tags in der angegebenen Reihenfolge aus. Die vollständigen lokalen App-Skripte und ihre echten Klickhandler werden verwendet. Bei einem zweiten Durchlauf wird die Antwort des Grundmoduls verzögert, während andere Dateien früher fertig werden können.

Geprüft werden Reihenfolge, fehlende unbehandelte JavaScript-Fehler, der echte Heute-drucken-Klick, die geladene Vorschau, eine heruntergeladene echte PDF und wiederholtes Öffnen. Auch der verzögerte Abruf besteht. Die automatisierte Live-Anmeldung ist kontrolliert deaktiviert, Firebase-SDK/Authentifizierung sind isoliert, und sämtliche nichtlokalen Datenanfragen werden blockiert. Dieser Test bestätigt die Browser-Ladefolge und Druckbedienung; er führt keine echte Firebase-Anmeldung aus.

85 gezielte Prüfungen wurden mit dem aktuellen Quellstand neu ausgeführt und bestehen:

| Gruppe | Bestanden | Ausgeführt (UTC) |
| --- | ---: | --- |
| ui | 30 | 2026-10-20T21:22:21.276Z |
| startup | 18 | 2026-10-20T21:22:40.758Z |
| script-load | 8 | 2026-10-20T21:22:52.669Z |
| workforms-print | 24 | 2026-10-20T21:23:24.841Z |
| pdf-output | 5 | 2026-10-20T21:23:26.700352+00:00 |

Die 24 Druckabläufe verwenden erneut den echten Firestore-Emulator und die vorhandenen Testkunden in einer isolierten demo-Projektkopie. Der globale Workspace-Zugriff eines Kunden bleibt gesperrt. Die hochgeladene Sicherung und produktive Daten werden nicht verändert. Die 18 Anmeldestart-Prüfungen verwenden den bestehenden jsdom-Testaufbau mit simulierten Firebase-Callbacks. Die 30 UI-Prüfungen enthalten Syntax, lokale Abhängigkeiten, Kunden-/Vertragsansichten und Reparaturgrenzen.

Die PDF-Ausgabe wird zusätzlich auf A4, vollständige Inhalte, Umlaute, lange Texte, leere Tage und Seitenränder geprüft. Die 15 Seiten der vier Druckbeispiele wurden gerendert und visuell geprüft. Die aus der tatsächlichen App-HTML heruntergeladene PDF enthält den Testhund Rex und wurde ebenfalls gerendert und kontrolliert. Interne Beispiel-PDFs und Bildschirmbilder werden nicht in die ZIP aufgenommen.

Die unveränderten allgemeinen Backend-, Storage-, Chat-, Kapazitäts- und Konfliktprüfungen aus dem unmittelbar vorherigen GB371-Durchlauf wurden für diese gezielte Ladefolge-Korrektur nicht noch einmal vollständig ausgeführt. Ihre ursprünglichen Zeitpunkte und Ergebnisse bleiben erhalten. Der aktuelle Bericht trennt diese übernommenen Nachweise von den 85 neuen Prüfungen. Die geprüften aktuellen Quell-Hashes stehen in gb372-regression-run.json.

## Verbleibende Prüfungen und Fehlerstand

- Der gemeldete GB371-Ladefehler ist reproduziert und in den neuen Browserprüfungen behoben. In den 85 aktuellen Prüfungen bleibt kein fehlgeschlagener Test.
- Native Safari-/iOS-Druck-, Teilen- und Dateien-Dialoge sowie ein physischer Drucker sind weiterhin auf dem eigenen Gerät zu prüfen. Chromium mit iPad-/iPhone-Bildgröße ist kein echter Safari-Test.
- Ein vollständiger angemeldeter Live-Durchlauf im bestehenden Firebase mit zwei getrennten Kundenkonten, direkten fremden Dokument-/Dateipfaden, parallelen Sitzungen und Netzunterbrechung steht weiterhin aus. Frühere vom Benutzer bestätigte Fotoanzeige und Neukundenzuordnung sind separate Einzelfunktionsbeobachtungen.
- Alte unvollständige Anfragen, historische Signaturen und das zentrale Workspace-Dokument behalten die bisher dokumentierten Grenzen. Diese Reparatur ändert das Datenmodell nicht.

## Update

Die vollständigen Dateien aus DoggyStyle_Workspace_GB372_TEST am bisherigen Ort einspielen, einschließlich assets und vendor. Danach neu laden und GB372_LOAD_ORDER_TEST_20261020 in Login und DIAG prüfen. Arbeitsblätter > Heute drucken > PDF speichern testen. Firebase-Regeln und Kundenzuordnungen brauchen keine Änderung. Kein Daten-Reset. INSTALLATION_IPAD.txt enthält den Ablauf.

Der historische GB371-Prüfbericht liegt unter pruefungen/historischer-pruefbericht-gb371.md. Seine positiven Druckprüfungen hatten die oben erklärte Lücke bei der HTML-Ladereihenfolge. Der aktuelle Bericht dokumentiert deren Korrektur und die neuen Grenzen.
