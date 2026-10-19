# Doggy Style Workspace – GB363 Reparatur-Testfassung

Stand: 18. Oktober 2026. **Testfassung; keine abschließende Live-Freigabe.**

Diese vollständige App-Fassung wurde auf Wunsch trotz noch ausstehender Firebase-Live-Ablauftests bereitgestellt. Die bestehenden Projekt- und Bucket-Angaben bleiben erhalten. Bei der Erstellung wurden keine Firebase-Bestandsdaten, Rollen, Konten, Regeln oder Dateien geändert.

GB363 behebt den nach GB362 gemeldeten lokalen Quotenfehler. Workspace, Ausgangsstand, Konfliktsicherungen und Kundeneinreichungen können in IndexedDB gespeichert werden. Vorhandene Browserdaten werden nicht pauschal gelöscht. Eine bereits bestätigte Firebase-Reparatur wird bei späterem Anzeigefehler nicht als gescheiterte Speicherung gemeldet. Der Reparaturdialog hat deutlich lesbare Schaltflächen. Wenn beide lokalen Speicher ausfallen, bleiben Änderungen im Arbeitsspeicher und ein Hinweis bietet eine eigene lokale Sicherung an; Kundeneinreichungen werden dann vor dem Übermitteln gestoppt.

GB362 behebt den nach der GB361-Auslieferung gemeldeten Startabbruch: eine entfernte Abmelden-Schaltfläche wurde noch als globale Variable angesprochen. Der vollständige Anmeldestart ist jetzt zusätzlich geprüft. Die Reparatur-Schaltfläche steht direkt über der Eingangsliste. Starten führt keine automatische Migration oder Veröffentlichung aus; vorhandene ungesendete Änderungen bleiben erhalten. „Neu laden“ ersetzt den alten RESET-Knopf und löscht keine lokalen Daten. DIAG zeigt zusätzlich Rolle, Startphase und den konkreten Fehler.

Start: `index.html` bzw. `login.html` auf dem bisherigen Webserver. JavaScript, Firebase und Internetzugang sind für die Online-Abläufe erforderlich. Ein lokales Öffnen der HTML-Datei aus „Dateien“ ersetzt den Webserver nicht.

## iPad und iPhone

Die Datei `INSTALLATION_IPAD.txt` beschreibt das Einspielen und die Reihenfolge. `REGELN_ANZEIGEN.html` zeigt die in diesem Paket enthaltenen Firestore-/Storage-Regeln mit einer Kopierfunktion. Die Regeln werden durch das Hochladen der App nicht automatisch in Firebase veröffentlicht.

Nach administrativer Anmeldung: **Eingänge → Bestand prüfen und reparieren**. Die Prüfung liest zunächst nur den Bestand. Vor jeder angebotenen Änderung muss eine JSON-Sicherung heruntergeladen, in „Dateien“ gespeichert und die konkrete Vorschau bestätigt werden. Sie enthält Workspace, Profile, Vorschläge und Aufgaben; Auth-Konten und Storage-Dateien sind nicht enthalten.

## Reparaturabläufe

- Kundenportal: feste Firebase-UID sowie administrativ gespeicherte Kunden-/Hundezuordnung; kein Zuordnen über Hundenamen oder lokale Übergabedaten.
- Kundeneinreichung: vollständiges, atomar gespeichertes Paar aus Vorschlag und Aufgabe. Erst die administrative Übernahme aktualisiert die freigegebenen Daten.
- Verträge: exakte Kunden-, Hunde- und Versionsbindung; erfasste PNG-Datei und tatsächliche Bildpixel werden in der Oberfläche geprüft. Leere Bilder erhalten keine Freigabe über diesen Ablauf. Die Freigabe setzt eine administrative Prüfung voraus; die Pixelprüfung stellt keine Identitäts- oder Rechtsgültigkeitsprüfung dar.
- Bestandsreparatur: fehlende Listen-Einträge aus vorhandenen Datensatz-Tabellen nach Vorschau ergänzen; eindeutige bestehende Konten zuordnen; fehlende Gegenstücke offener Kundeneingänge prüfen und ergänzen. Widersprüche und alte Vertrags-/Aufenthaltsformate bleiben gesperrt.
- Synchronisation: keine automatische Veröffentlichung als Ersatz für einen fehlgeschlagenen Serverabruf; ungesendete Änderungen bleiben auch bei gleicher Serverrevision erhalten. Entfernte Map-Einträge werden nicht durch rekursives Speichern wiederhergestellt. Antworten eines früheren Kontos verändern das neue Konto nicht.
- Kapazität: maximal vier Hunde insgesamt bleibt bestehen.

## Vor Live-Freigabe offen

Die Regeln und Zuordnungen müssen im bestehenden Projekt aktiviert und mit zwei echten Kundenkonten geprüft werden. Bereits ausgegebene öffentliche Storage-Downloadlinks sind nicht widerrufen. Allgemeines Cloud-Speichern und Freigeben ist in dieser Fassung administrativ; die bisherigen Mitarbeiter-Schreibabläufe sind nicht vollständig wiederhergestellt. Echte Safari-/iPad-Zeichnung, Druck/PDF, Medienabruf, Service-Worker-Update und vollständige Abläufe im echten Firebase sind noch nicht durchgehend geprüft. Die zentrale Firestore-Dokumentgröße bleibt begrenzt; zu große Schreibvorgänge brechen ab.

Details und tatsächliche Testergebnisse stehen in `PRUEFBERICHT.md` und `pruefungen/`. Das Paket enthält keine gespeicherten Passwörter, Sitzungstoken oder privaten Firebase-Schlüssel.
