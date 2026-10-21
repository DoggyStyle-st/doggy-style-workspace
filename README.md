# Doggy Style Workspace – GB376 Testfassung

Reparatur der Sicherheitsdatenblatt-Speicherung vom 21. Oktober 2026.
PDFs werden vor der gemeinsamen Speicherung separat im vorhandenen Firebase Storage abgelegt. Der Workspace speichert Dateiverweise. Lokale Originale bleiben bis zur bestätigten Übernahme erhalten; zuvor wird eine dauerhafte Gerätesicherung erstellt. Öffnen und PDF-Speichern funktionieren auch nach Neuladen über angemeldete Dateiabrufe.

INSTALLATION_IPAD.txt enthält die Schritte. PRUEFBERICHT.md nennt Testergebnisse und offene Live-/Safari-Prüfungen. Die vollständigen Dateien einschließlich assets und vendor übernehmen. Die Storage-Regeln sind für den neuen PDF-Pfad ergänzt; die Firestore-Regeln sind unverändert. Keine Websitedaten löschen und keinen Daten-Reset verwenden.

Produktive Daten wurden bei der Entwicklung nicht verändert. Historische Prüfungen unter pruefungen beschreiben ältere Fassungen; maßgeblich ist der aktuelle Prüfbericht.
