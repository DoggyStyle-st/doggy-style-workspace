# GB369 – Reparatur-Testfassung vom 20. Oktober 2026

## Neu in GB369: Fotos sicher einreichen und prüfen

Die bisherige Fassung konnte einen Uploadfehler verschweigen oder eine Änderung schon vor dem Uploadende senden. GB369 verfolgt Profilfoto und Impfpassfoto getrennt. Speichern wartet auf beide Übertragungen; bei Fehlern bleibt der Versand gesperrt. Erneut versuchen oder Auswahl verwerfen sind direkt am Foto verfügbar. Ein verworfener fehlgeschlagener Upload bewahrt das bisherige Foto. Ein Hund- oder Kontowechsel übernimmt keine verspätete Fotoantwort.

Vom Browser lesbare Bilder werden vor dem Upload auf höchstens 2048 Pixel Kantenlänge verkleinert und in ein erlaubtes Bildformat umgewandelt. Originale über 25 MB werden mit einem verständlichen Hinweis abgewiesen. HEIC/HEIF funktioniert nur, wenn der Browser das Bild dekodieren kann; andernfalls wird JPEG/PNG angefordert. Echte Safari-Fotodekodierung bleibt zu prüfen.

Die offene Eingangsprüfung zeigt neue, ersetzte und zur Entfernung vorgeschlagene Fotos rot mit bisherigem und eingereichtem Bild. Foto ansehen vergrößert die Vorschau. Erst die administrative Übernahme aktualisiert das bestätigte Foto im eigenen Kundenportal und Workspace. Bestehende Dateien werden nicht automatisch gelöscht oder überschrieben.

Firestore-/Storage-Regeln und Firebase-Konfiguration sind gegenüber GB368 unverändert. Bereits veröffentlichte GB368-Regeln müssen für diese Fotoreparatur nicht erneut veröffentlicht werden. Die übrigen Reparaturen bleiben enthalten.

## Enthalten aus GB368

Alte offene Eingänge können einzeln oder gesammelt archiviert und wiederhergestellt werden. Eine separate Markierung bewahrt den unveränderten ursprünglichen Eingang samt Aufgabe und Unterschrift. Die Sammelaktion prüft die angezeigten Daten erneut und scheitert vollständig bei zwischenzeitlichen Änderungen. Archivierung und Prüfung können nicht denselben offenen Stand gleichzeitig übernehmen. Mitarbeiter sehen das Archiv, dürfen es nicht verwalten.

Auf Benutzerwunsch erfolgt Annahme/Ablehnung jetzt direkt als Nachricht im eigenen Kundenchat. Die Nachricht nutzt den vorhandenen Chat anhand der Firebase-UID und wird atomar mit der Entscheidung geschrieben. Derselbe Vorgang erzeugt bei Wiederholung keine Duplikate. Die zusätzliche Startseiten-Meldungsübersicht entfällt. Kunden können automatische Rückmeldungen persönlich entfernen; die Entscheidung und die Kopie des Administrators bleiben erhalten. Verlauf für mich leeren setzt auch den eigenen ungelesenen Zähler zurück.

Früher separat gespeicherte Rückmeldungen bleiben im standardmäßig eingeklappten Chatbereich Frühere Rückmeldungen erhalten. Gelesen verschiebt sie aus der ungelesenen Liste; anschließend lassen sie sich löschen. Fehler werden angezeigt und das Element bleibt bis zum bestätigten Speichern erhalten. Kontowechsel schließt Listener und entfernt den vorherigen privaten Inhalt.

Neue Firestore-Regeln sind erforderlich. Storage-Regeln und Firebase-Konfiguration bleiben unverändert. Es erfolgte keine Veröffentlichung oder Bestandsänderung im produktiven Projekt.

Enthalten bleiben die Reparaturen aus GB367: vollständige aufklappbare Bestätigungstexte, eigene Unterschrift pro Aufenthaltsanfrage, dauerhafter Textstand, lesbare Eingangsprüfung und tägliche Belegung, Kapazität maximal vier Hunde, sofortige Start-/Prognoseaktualisierung und rote Kennzeichnung geänderter Angaben. GB366 korrigierte Kundenstart, Pfoten-Rückweg, native Aufenthaltsanfrage, kanonische Chatziele, UID-basierten Versand und Dateifehler/Wiederholung. GB365 stellte die Entscheidungsschaltflächen nach Navigation wieder her und machte die Aufgabenverteilung optional. GB364 korrigierte historische doppelte Vertragsaliase. GB363 ergänzte IndexedDB und die Trennung von bestätigter Cloud-Speicherung und lokalem Anzeigefehler. GB362 reparierte den vollständigen Anmeldestart.

Alle Testergebnisse und offene Punkte: PRUEFBERICHT.md und pruefungen/. Diese vollständige ZIP bleibt eine TESTFASSUNG bis zum erfolgreichen Live-Durchlauf im vorhandenen Firebase und auf den Geräten.
