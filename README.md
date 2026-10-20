# Doggy Style Workspace - GB372 Ladefolge-Korrektur

Stand: 20. Oktober 2026. Vollständige Testfassung.

GB371 lud workforms-print.js vor workflow-core.js. Das Druckmodul speicherte dadurch eine fehlende Abhängigkeit und scheiterte später bei Core.dateISO. GB372 lädt das Grundmodul vor der Druck-Erweiterung. Eine tatsächlich fehlende Abhängigkeit erzeugt zusätzlich eine verständliche Meldung.

Die bisherigen Drucktests hatten die Module in einer manuell vorgegebenen Reihenfolge geladen. Sie prüften damit nicht die tatsächliche Reihenfolge der ausgelieferten HTML. Die neue Prüfung lädt die Original-Skript-Tags im Browser, führt die vollständigen lokalen App-Skripte aus und prüft den tatsächlichen Heute-drucken-Klick und die heruntergeladenen PDF-Bytes, auch bei langsamer Grundmodul-Antwort. Der Live-Auth-Bootstrap bleibt dabei isoliert; es werden keine echten Firebase-Zugangsdaten eingesetzt.

Doppelter Hygiene-Einstieg bleibt entfernt; alte Nachweise bleiben im Archiv. Tagesübersicht, Anreisen/Abreisen, Hundeblätter, Schichtblatt, PDF-Download und erreichbare Vorschau aus GB371 bleiben enthalten. Die PDF-Dateien werden lokal erstellt. Die mitgelieferten Dateien unter vendor bleiben erforderlich und unverändert.

Firebase-Projekt, Konfiguration und Regeln sind unverändert. Keine Bestandsreparatur und keine erneute Regelveröffentlichung erforderlich. PRUEFBERICHT.md unterscheidet neue Prüfungen, unverändert übernommene Backend-Nachweise und verbleibende native iOS-/Live-Prüfungen.
