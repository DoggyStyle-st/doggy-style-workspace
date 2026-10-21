# Doggy Style Workspace – GB375

Stand: 21. Oktober 2026. Vollständige Testfassung.

Die Synchronisation unterscheidet jetzt zwischen Firebase-Fehlern und lokalen Daten, die geprüft werden müssen. Gleiche Daten mit lediglich anderen Transportzeitstempeln oder Anzeigepräferenzen verursachen keinen Konflikt. Tatsächliche ungesendete Änderungen bleiben erhalten. Der Knopf Änderungen vergleichen steht auf der Startseite und in jedem anderen Workspace-Bereich sichtbar zur Verfügung. Auch die gelbe Statusmeldung öffnet den Vergleich.

Bei echten Unterschieden wird nichts automatisch überschrieben oder gesendet. Eine konkrete Auswahl kann gemeinsam gespeichert werden. Ohne gespeicherten Ausgangsstand ist nur Lokales sichern und Serverstand anzeigen verfügbar; die lokale Fassung wird zuerst dauerhaft gesichert. Abbrechen lässt alles bestehen. Ein inzwischen neuer Serverstand verlangt einen aktualisierten Vergleich. Alte, bereits abgeglichene Gerätekopien werden beim Neuladen nicht wieder als ungesendet importiert. Tatsächlich neue Änderungen aus einem anderen älteren Tab bleiben geschützt.

Installation: vollständige App-Dateien am bisherigen Ort übernehmen und neu laden. Firestore- und Storage-Regeln sowie Firebase-Konfiguration sind bytegleich mit GB374. Bei bereits veröffentlichten GB374-Regeln keine Regeln erneut ändern. Kein Daten-Reset und keine Bestandsreparatur nötig.

Die Bewertungsbearbeitung, Löschung und kompakte Kontensuche aus GB374 sowie alle bisherigen Korrekturen sind enthalten. INSTALLATION_IPAD.txt erklärt den Ablauf; PRUEFBERICHT.md enthält Nachweise und offene Live-/iOS-Prüfungen.
