# Doggy Style Workspace – GB368 Reparatur-Testfassung

Stand: 19. Oktober 2026. **Vollständige Testfassung; Live-Freigabe steht aus.**

Die App verwendet weiterhin das vorhandene Projekt doggy-style-hundepension. Bei der Entwicklung wurden keine produktiven Daten, Konten, Rollen, Regeln oder Dateien geändert. Neue Abläufe wurden mit den vorhandenen Testkunden aus der unveränderten Sicherung in Firebase-Emulatoren geprüft.

## Neu in GB368

- Alte offene Eingänge einzeln oder gesammelt archivieren. Unter Eingänge → Archiv lassen sie sich wiederherstellen. Die ursprünglichen Anfragen, Aufgaben, Verträge, Signaturen und Kundendaten bleiben erhalten. Höchstens 100 Eingänge pro Sammelaktion. Archivierte Eingänge müssen vor einer Entscheidung wiederhergestellt werden.
- Annahme und Ablehnung kommen direkt als automatische Nachricht im eigenen Kundenchat mit Raphael an. Entscheidung, bestätigte Daten und Chatnachricht werden zusammen gespeichert. Wiederholung erzeugt keine doppelte Nachricht; eine gescheiterte Übernahme erzeugt keine Erfolgsmeldung. Es gibt keine zusätzliche Meldungsübersicht auf der Startseite.
- Kunden können diese automatischen Chat-Rückmeldungen über Nachricht öffnen → Für mich entfernen aus ihrer eigenen Ansicht nehmen. Die Entscheidung und der Administratorverlauf bleiben erhalten. Gelesene Nachrichten bleiben als normaler Chatverlauf sichtbar. Verlauf für mich leeren entfernt den bisherigen Verlauf nur für das eigene Konto und setzt den eigenen ungelesenen Zähler zurück; neue Nachrichten erscheinen wieder.
- Früher separat gespeicherte Rückmeldungen bleiben ausschließlich unter Chat → Frühere Rückmeldungen aufklappbar. Als gelesen markieren verschiebt sie in Gelesen; dort sind sie löschbar. Fremde Kunden dürfen sie weder lesen noch ändern.

**Die Firestore-Regeln aus GB368 müssen erneut im bestehenden Projekt veröffentlicht werden.** Sie enthalten die Rechte für das Eingangsarchiv, die persönliche Entfernung automatischer Chatnachrichten und das Löschen eigener gelesener früherer Rückmeldungen. Storage-Regeln und Firebase-Konfiguration sind gegenüber GB367 unverändert. Das Hochladen der App-Dateien veröffentlicht keine Firebase-Regeln.

## Enthaltene frühere Reparaturen

Aufenthaltsanfrage für eigene Hunde mit lesbaren Bestätigungstexten, erforderlicher eigener Unterschrift und gespeichertem Textstand; lesbare Eingangsprüfung mit Belegung vor/nach Übernahme; maximal vier Hunde insgesamt mit erneuter Prüfung beim Speichern; sofortige Aktualisierung der Startkarten und 14-Tage-Prognose; rote Gegenüberstellung geänderter Kundendaten; UID-gebundene Kundentrennung; geprüfte Vertragsfassung und Signatur; kanonische Kundenliste im Chat; Pfoten-Rückweg; lokale Sicherung in IndexedDB; Konfliktvergleich und Bestandsreparatur mit Vorschau. Neue Einreichungen brauchen keine vorherige Aufgabenverteilung.

## Einspielen auf iPad/iPhone

Siehe INSTALLATION_IPAD.txt. ZIP entpacken und die Dateien am bisherigen GitHub-App-Ort aktualisieren. REGELN_ANZEIGEN.html auf der Website zeigt den exakten Regeltext zum Kopieren in die bestehende Firebase-Konsole. Die Website anschließend neu öffnen; DIAG muss HTML und JS als GB368_ARCHIVE_NOTICES_TEST_20261019 anzeigen. Safari-Website-Daten werden dafür nicht pauschal gelöscht. HTML aus der Dateien-App ist kein Ersatz für den bestehenden Webserver.

Sonja/Bello und Max/Rex sind laut Sicherung bereits korrekt getrennt zugeordnet. Ihre Zuordnung muss nicht erneut repariert werden. Die Bestandsprüfung bleibt bei tatsächlich fehlenden Zuordnungen optional. Ihre JSON-Sicherung enthält Workspace, Profile, Vorschläge, Aufgaben und Archivmarkierungen; Auth-Konten und Storage-Dateien sind nicht enthalten. Alte Anfragen müssen nicht übernommen oder repariert werden, bevor neue Vorgänge genutzt werden können.

## Prüfstand und offene Grenzen

PRUEFBERICHT.md und pruefungen/ dokumentieren die tatsächlichen Tests und verbleibenden Fehler. Emulatorprüfungen ersetzen keinen abgeschlossenen Durchlauf mit echten Kundensitzungen im bestehenden Firebase oder echte Safari-/iPad-Zeichnung. Medienabruf/CORS, PDF/Druck und Service-Worker-Update auf den Geräten sind noch zu bestätigen. Bestehende öffentliche Storage-Downloadlinks werden durch Regeln nicht widerrufen. Allgemeine Cloud-Speicherung und Freigaben bleiben administrativ; frühere Mitarbeiter-Schreibabläufe sind nicht vollständig wiederhergestellt. Die zentrale Firestore-Dokumentgröße bleibt begrenzt.

Das Paket enthält keine Passwörter, Sitzungstoken, privaten Firebase-Schlüssel oder produktiven Sicherungsdaten.
