# Doggy Style Workspace – GB365 Reparatur-Testfassung

Stand: 19. Oktober 2026. **Testfassung; keine abschließende Live-Freigabe.**

Diese vollständige App-Fassung wurde auf Wunsch trotz noch ausstehender Firebase-Live-Ablauftests bereitgestellt. Die bestehenden Projekt- und Bucket-Angaben bleiben erhalten. Bei der Erstellung wurden keine Firebase-Bestandsdaten, Rollen, Konten, Regeln oder Dateien geändert.

GB365 korrigiert die verborgenen Schaltflächen zur Übernahme und Ablehnung. Beim Wechsel zu „Eingänge“ setzt die App den Prüfbereich eindeutig zurück; beim Öffnen eines neuen Eingangs werden beide Entscheidungsschaltflächen sichtbar. Während einer Speicherung sind beide gesperrt. Fehler erscheinen direkt am geöffneten Eingang, die erfolgreiche Übernahme unter der Eingangsliste. Der Abschnitt zum Senden einer zusätzlichen Formularaufgabe ist jetzt optional und standardmäßig zugeklappt. Neue Einreichungen brauchen keine Aufgabenverteilung. Kontowechsel entfernt auch den offenen Prüfbereich. Sieben zusätzliche Oberflächenprüfungen und die Bestandskopie prüfen ausdrücklich die Navigation und die sichtbaren Bedienelemente.

GB364 behebt anhand der Sicherung vom 19. Oktober einen Fehler bei neuen Vertragsfreigaben: Historische Alias-Einträge konnten denselben Vertrag mehrfach in das Kundenportal kopieren und die aktuelle Freigabe überlagern. Jetzt wird ausschließlich der geprüfte Eintrag unter der eindeutigen Vertragskennung synchronisiert. Die neue Unterschrift und die administrative Entscheidung bleiben exakt erhalten. Vorhandene alte Anfragen und Altverträge werden dabei nicht bearbeitet. Die Sicherung bestätigt inzwischen die korrekte getrennte Zuordnung Sonja/Bello und Max/Rex. Neue Abläufe wurden mit dieser Bestandskopie im Firebase-Emulator geprüft.

GB363 behebt den nach GB362 gemeldeten lokalen Quotenfehler. Workspace, Ausgangsstand, Konfliktsicherungen und Kundeneinreichungen können in IndexedDB gespeichert werden. Vorhandene Browserdaten werden nicht pauschal gelöscht. Eine bereits bestätigte Firebase-Reparatur wird bei späterem Anzeigefehler nicht als gescheiterte Speicherung gemeldet. Der Reparaturdialog hat deutlich lesbare Schaltflächen. Wenn beide lokalen Speicher ausfallen, bleiben Änderungen im Arbeitsspeicher und ein Hinweis bietet eine eigene lokale Sicherung an; Kundeneinreichungen werden dann vor dem Übermitteln gestoppt.

GB362 behebt den nach der GB361-Auslieferung gemeldeten Startabbruch: eine entfernte Abmelden-Schaltfläche wurde noch als globale Variable angesprochen. Der vollständige Anmeldestart ist jetzt zusätzlich geprüft. Die Reparatur-Schaltfläche steht direkt über der Eingangsliste. Starten führt keine automatische Migration oder Veröffentlichung aus; vorhandene ungesendete Änderungen bleiben erhalten. „Neu laden“ ersetzt den alten RESET-Knopf und löscht keine lokalen Daten. DIAG zeigt zusätzlich Rolle, Startphase und den konkreten Fehler.

Start: `index.html` bzw. `login.html` auf dem bisherigen Webserver. JavaScript, Firebase und Internetzugang sind für die Online-Abläufe erforderlich. Ein lokales Öffnen der HTML-Datei aus „Dateien“ ersetzt den Webserver nicht.

## iPad und iPhone

Die Datei `INSTALLATION_IPAD.txt` beschreibt das Einspielen und die Reihenfolge. `REGELN_ANZEIGEN.html` zeigt die in diesem Paket enthaltenen Firestore-/Storage-Regeln mit einer Kopierfunktion. Die Regeln werden durch das Hochladen der App nicht automatisch in Firebase veröffentlicht.

Für den nächsten Test den Reparaturdialog schließen und einen neuen Vorschlag mit Sonja/Bello einreichen. Nach der administrativen Übernahme im Kundenkonto neu laden. Danach mit Max/Rex die Trennung prüfen und einen neuen Vertrag unterschreiben, einreichen und freigeben. Alte Eingänge müssen dafür nicht repariert werden.

Optional bei tatsächlich fehlenden Zuordnungen: **Eingänge → Bestand prüfen und reparieren**. Die Prüfung liest zunächst nur den Bestand. Vor jeder angebotenen Änderung muss eine JSON-Sicherung heruntergeladen, in „Dateien“ gespeichert und die konkrete Vorschau bestätigt werden. Sie enthält Workspace, Profile, Vorschläge und Aufgaben; Auth-Konten und Storage-Dateien sind nicht enthalten.

## Reparaturabläufe

- Kundenportal: feste Firebase-UID sowie administrativ gespeicherte Kunden-/Hundezuordnung; kein Zuordnen über Hundenamen oder lokale Übergabedaten.
- Kundeneinreichung: vollständiges, atomar gespeichertes Paar aus Vorschlag und Aufgabe. Erst die administrative Übernahme aktualisiert die freigegebenen Daten.
- Verträge: exakte Kunden-, Hunde- und Versionsbindung; erfasste PNG-Datei und tatsächliche Bildpixel werden in der Oberfläche geprüft. Leere Bilder erhalten keine Freigabe über diesen Ablauf. Die Freigabe setzt eine administrative Prüfung voraus; die Pixelprüfung stellt keine Identitäts- oder Rechtsgültigkeitsprüfung dar.
- Bestandsreparatur: fehlende Listen-Einträge aus vorhandenen Datensatz-Tabellen nach Vorschau ergänzen; eindeutige bestehende Konten zuordnen; fehlende Gegenstücke offener Kundeneingänge prüfen und ergänzen. Widersprüche und alte Vertrags-/Aufenthaltsformate bleiben gesperrt.
- Synchronisation: keine automatische Veröffentlichung als Ersatz für einen fehlgeschlagenen Serverabruf; ungesendete Änderungen bleiben auch bei gleicher Serverrevision erhalten. Entfernte Map-Einträge werden nicht durch rekursives Speichern wiederhergestellt. Antworten eines früheren Kontos verändern das neue Konto nicht.
- Kapazität: maximal vier Hunde insgesamt bleibt bestehen.

## Vor Live-Freigabe offen

Der Benutzer hat beide Firebase-Regeln nach eigener Angabe aktualisiert. Die Sicherung bestätigt die Zuordnungen für Sonja und Max. Der vollständige Ablauf mit zwei getrennten Kundenkonten im echten Projekt und auf den Geräten ist noch zu bestätigen. Bereits ausgegebene öffentliche Storage-Downloadlinks sind nicht widerrufen. Allgemeines Cloud-Speichern und Freigeben ist in dieser Fassung administrativ; die bisherigen Mitarbeiter-Schreibabläufe sind nicht vollständig wiederhergestellt. Echte Safari-/iPad-Zeichnung, Druck/PDF, Medienabruf, Service-Worker-Update und vollständige Abläufe im echten Firebase sind noch nicht durchgehend geprüft. Die zentrale Firestore-Dokumentgröße bleibt begrenzt; zu große Schreibvorgänge brechen ab.

Details und tatsächliche Testergebnisse stehen in `PRUEFBERICHT.md` und `pruefungen/`. Das Paket enthält keine gespeicherten Passwörter, Sitzungstoken oder privaten Firebase-Schlüssel.
