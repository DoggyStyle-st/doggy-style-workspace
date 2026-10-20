# Doggy Style Workspace – GB369 Reparatur-Testfassung

Stand: 20. Oktober 2026. **Vollständige Testfassung; Live-Freigabe steht aus.**

Die App verwendet weiterhin das vorhandene Projekt doggy-style-hundepension. Bei der Entwicklung wurden keine produktiven Daten, Konten, Rollen, Regeln oder Dateien geändert. Neue Abläufe wurden mit den vorhandenen Testkunden aus der unveränderten Sicherung in Firebase-Emulatoren geprüft.

## Neu in GB369: Fotos sicher einreichen und prüfen

Die bisherige Fassung konnte einen Uploadfehler verschweigen oder eine Änderung schon vor dem Uploadende senden. GB369 verfolgt Profilfoto und Impfpassfoto getrennt. Speichern wartet auf beide Übertragungen; bei Fehlern bleibt der Versand gesperrt. Erneut versuchen oder Auswahl verwerfen sind direkt am Foto verfügbar. Ein verworfener fehlgeschlagener Upload bewahrt das bisherige Foto. Ein Hund- oder Kontowechsel übernimmt keine verspätete Fotoantwort.

Vom Browser lesbare Bilder werden vor dem Upload auf höchstens 2048 Pixel Kantenlänge verkleinert und in ein erlaubtes Bildformat umgewandelt. Originale über 25 MB werden mit einem verständlichen Hinweis abgewiesen. HEIC/HEIF funktioniert nur, wenn der Browser das Bild dekodieren kann; andernfalls wird JPEG/PNG angefordert. Echte Safari-Fotodekodierung bleibt zu prüfen.

Die offene Eingangsprüfung zeigt neue, ersetzte und zur Entfernung vorgeschlagene Fotos rot mit bisherigem und eingereichtem Bild. Foto ansehen vergrößert die Vorschau. Erst die administrative Übernahme aktualisiert das bestätigte Foto im eigenen Kundenportal und Workspace. Bestehende Dateien werden nicht automatisch gelöscht oder überschrieben.

Firestore-/Storage-Regeln und Firebase-Konfiguration sind gegenüber GB368 unverändert. Bereits veröffentlichte GB368-Regeln müssen für diese Fotoreparatur nicht erneut veröffentlicht werden. Die übrigen Reparaturen bleiben enthalten.

## Enthalten aus GB368

- Alte offene Eingänge einzeln oder gesammelt archivieren. Unter Eingänge → Archiv lassen sie sich wiederherstellen. Die ursprünglichen Anfragen, Aufgaben, Verträge, Signaturen und Kundendaten bleiben erhalten. Höchstens 100 Eingänge pro Sammelaktion. Archivierte Eingänge müssen vor einer Entscheidung wiederhergestellt werden.
- Annahme und Ablehnung kommen direkt als automatische Nachricht im eigenen Kundenchat mit Raphael an. Entscheidung, bestätigte Daten und Chatnachricht werden zusammen gespeichert. Wiederholung erzeugt keine doppelte Nachricht; eine gescheiterte Übernahme erzeugt keine Erfolgsmeldung. Es gibt keine zusätzliche Meldungsübersicht auf der Startseite.
- Kunden können diese automatischen Chat-Rückmeldungen über Nachricht öffnen → Für mich entfernen aus ihrer eigenen Ansicht nehmen. Die Entscheidung und der Administratorverlauf bleiben erhalten. Gelesene Nachrichten bleiben als normaler Chatverlauf sichtbar. Verlauf für mich leeren entfernt den bisherigen Verlauf nur für das eigene Konto und setzt den eigenen ungelesenen Zähler zurück; neue Nachrichten erscheinen wieder.
- Früher separat gespeicherte Rückmeldungen bleiben ausschließlich unter Chat → Frühere Rückmeldungen aufklappbar. Als gelesen markieren verschiebt sie in Gelesen; dort sind sie löschbar. Fremde Kunden dürfen sie weder lesen noch ändern.

**GB369 verwendet unveränderte GB368-Regeln. Falls GB368 schon veröffentlicht ist, ist kein erneutes Veröffentlichen nötig.** Sie enthalten die Rechte für das Eingangsarchiv, die persönliche Entfernung automatischer Chatnachrichten und das Löschen eigener gelesener früherer Rückmeldungen. Storage-Regeln und Firebase-Konfiguration sind gegenüber GB367 unverändert. Das Hochladen der App-Dateien veröffentlicht keine Firebase-Regeln.

## Enthaltene frühere Reparaturen

Aufenthaltsanfrage für eigene Hunde mit lesbaren Bestätigungstexten, erforderlicher eigener Unterschrift und gespeichertem Textstand; lesbare Eingangsprüfung mit Belegung vor/nach Übernahme; maximal vier Hunde insgesamt mit erneuter Prüfung beim Speichern; sofortige Aktualisierung der Startkarten und 14-Tage-Prognose; rote Gegenüberstellung geänderter Kundendaten; UID-gebundene Kundentrennung; geprüfte Vertragsfassung und Signatur; kanonische Kundenliste im Chat; Pfoten-Rückweg; lokale Sicherung in IndexedDB; Konfliktvergleich und Bestandsreparatur mit Vorschau. Neue Einreichungen brauchen keine vorherige Aufgabenverteilung.

## Einspielen auf iPad/iPhone

Siehe INSTALLATION_IPAD.txt. ZIP entpacken und die Dateien am bisherigen GitHub-App-Ort aktualisieren. REGELN_ANZEIGEN.html auf der Website zeigt den exakten Regeltext zum Kopieren in die bestehende Firebase-Konsole. Die Website anschließend neu öffnen; DIAG muss HTML und JS als GB368_ARCHIVE_NOTICES_TEST_20261019 anzeigen. Safari-Website-Daten werden dafür nicht pauschal gelöscht. HTML aus der Dateien-App ist kein Ersatz für den bestehenden Webserver.

Sonja/Bello und Max/Rex sind laut Sicherung bereits korrekt getrennt zugeordnet. Ihre Zuordnung muss nicht erneut repariert werden. Die Bestandsprüfung bleibt bei tatsächlich fehlenden Zuordnungen optional. Ihre JSON-Sicherung enthält Workspace, Profile, Vorschläge, Aufgaben und Archivmarkierungen; Auth-Konten und Storage-Dateien sind nicht enthalten. Alte Anfragen müssen nicht übernommen oder repariert werden, bevor neue Vorgänge genutzt werden können.

## Prüfstand und offene Grenzen

PRUEFBERICHT.md und pruefungen/ dokumentieren die tatsächlichen Tests und verbleibenden Fehler. Emulatorprüfungen ersetzen keinen abgeschlossenen Durchlauf mit echten Kundensitzungen im bestehenden Firebase oder echte Safari-/iPad-Zeichnung. Medienabruf/CORS, PDF/Druck und Service-Worker-Update auf den Geräten sind noch zu bestätigen. Bestehende öffentliche Storage-Downloadlinks werden durch Regeln nicht widerrufen. Allgemeine Cloud-Speicherung und Freigaben bleiben administrativ; frühere Mitarbeiter-Schreibabläufe sind nicht vollständig wiederhergestellt. Die zentrale Firestore-Dokumentgröße bleibt begrenzt.

Das Paket enthält keine Passwörter, Sitzungstoken, privaten Firebase-Schlüssel oder produktiven Sicherungsdaten.
