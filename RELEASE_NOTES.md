# GB391 – Kompakte Startseite

- Tagesablauf mit Anreisen, Abholungen und freien Plätzen sowie direkte Links zu offenen Aufgaben.
- Logo, Originalspruch und Betreuungsgrafiken bleiben sichtbar.
- Sieben Tage als klickbare Belegungsvorschau, kompakte §11-Ampel und aufklappbare letzte Aktivitäten.

# GB390 – Steuerberater-Monatsexport

- PDF mit Monatsübersicht nach Zahlungsdatum, Brutto, Netto, Umsatzsteuer und den zugehörigen Rechnungsseiten.
- Der Compliance-Monatsnachweis bleibt unter Compliance.

# GB389 – Compliance und Monatsnachweis

- Ampel-Aktualisierung zeigt die Uhrzeit der letzten Prüfung.
- Monatsabschluss öffnet die Vorschau im Compliance-Archiv. Erneutes Öffnen erzeugt keinen weiteren Abschluss.
- Der Monatsnachweis enthält auch bestätigte Aufenthalte, die vor dem Berichtsmonat begonnen haben. Ampelstatus erscheinen auf Deutsch.

# GB388 – Einstellungen

- Vier Einstellungsbereiche mit eindeutigen Speicherrückmeldungen.
- Beispielrechnung mit ungespeicherten Preisen und Absenderdaten. Beim Ausstellen wird der Absender im Beleg gespeichert.
- Mitarbeiter können mit einem Klick hinzugefügt werden. Konten zeigen eine Erläuterung zur gewählten Rolle.
- Sicherungsvorschau vor Wiederherstellung, Monatsabschluss unter Compliance und PDF-Monatsexport unter Auswertungen.

# GB387 – Rechnungen filtern, öffnen und verbuchen

- Statusfilter mit Trefferzahlen, kombinierte Suche, offene Summe und Sortierung nach Rechnungsdatum.
- Rechner und breites iPad zeigen Liste und Beleg nebeneinander. Auf dem iPhone nimmt der Beleg die Ansicht ein. **Zur Liste** stellt die bisherige Position wieder her.
- Offene Rechnungen mit zugeordnetem Stammkunden zeigen den bestätigten Chat-Freigabestatus in der Liste. Die Freigabe erfolgt über die eigene Schaltfläche im Beleg.
- **Als bezahlt markieren** öffnet die Auswahl des Zahlungsdatums. Der Zahlungseingang erscheint im entsprechenden Monat der Auswertungen.

# GB386 – Terminantworten und Mitteilungen

- Zusagen und Ablehnungen erscheinen als Nachricht mit Ungelesen-Zähler im zugehörigen Team-Chat.
- Die Geräteanzeige prüft die aktuelle Firebase-Registrierung. Am Termin steht das Ergebnis des jeweiligen Erinnerungsversuchs.
- Der Dialog für E-Mail-Einladungen beschriftet die gespeicherten Empfänger und erklärt die separate Einrichtung des Absenders. Der SMTP-Zugang wird beim Veröffentlichen der Mailfunktion geprüft.

# GB385 – Termine und Rechnungen im Kundenchat

- Status **Offen** und Weitergabe im Chat sind getrennte Schritte. Mit **Rechnung an Kunden weitergeben** erhält das zugeordnete Kundenkonto einmalig die freigegebene Fassung als PDF. Beim Öffnen zeigt der Workspace den aktuellen Zahlungsstatus.
- Das ausgewählte Kundenkonto erhält Terminvorschläge zur Zusage oder Ablehnung. Der Workspace zeigt die Rückmeldung. Zugesagte Termine stehen im Kundenportal unter **Meine Termine**.
- Das Terminfenster passt Beschriftungen und Felder an die verfügbare Breite an. Die Schaltflächen zum Speichern und Schließen sind am unteren Rand erreichbar.
- Die Bankverbindung für Rechnungen lässt sich in den Einstellungen hinterlegen.

# GB384 – Ansichtsauswahl für Auswertungen

- **Ansicht** zeigt sofort den ausgewählten Bereich. **CSV speichern** verwendet dieselbe Auswahl und den eingestellten Zeitraum.
- Beträge in der Monatsübersicht und Kundennummern unter Top-Kunden öffnen die zugehörige Belegliste mit passendem Filter.

# GB383 – Auswertungen

- Monatsübersicht mit Zahlungseingängen, offenen Belegen und Stornos. Zahlungseingänge werden mit Brutto, enthaltener MwSt. und Netto ausgewiesen.
- Zeitraumfilter für Monat, Vormonat, Kalenderjahr und freie Datumswahl. CSV-Export aus denselben Daten wie die Anzeige.
- Belegsuche nach Kunden- und Rechnungsnummer sowie Name und Hund. Rechnungen und Tage über Kapazität lassen sich aus der Auswertung öffnen.
- Leistungsumsätze mit Zuschlägen und bestätigte Belegung aus derselben Aufenthaltslogik wie im Kalender.

# GB382 – Eigene Termine und Erinnerungen

- Eigene Termine stehen im Kalender und im Tagesablauf neben Bring- und Abholzeiten.
- Firebase übernimmt Erinnerungen für angemeldete, aktivierte Geräte. Kalendereinladungen per E-Mail unterstützen Änderungen und Absagen zum selben Termin.
- Die Belegung zeigt das gemeinsame Vier-Hunde-Limit. Die Tagesansicht nutzt dieselben bestätigten Aufenthalte wie die Monatsansicht. Beim Monatswechsel schließt sie den vormals gewählten Tag.

# GB381 – Freie Rechnungen und Kundennummern

Bei freien Rechnungen lässt sich die Anschrift direkt im Beleg erfassen. Die Wahl eines Stammkunden mit optionaler Hundezuordnung ist weiterhin möglich.

Die Workspace-Synchronisierung vergibt feste Kundennummern. Kundenprofile, Rechnungen und die Suche in Kunden-, Aufenthalts- und Rechnungslisten verwenden diese Nummern. Beim Ausstellen einer Rechnung speichert der Beleg Empfängername, Anschrift und eine vorhandene Kundennummer.

# GB380 – Kundenanschrift und Rechnungsdruck

Freie Rechnungen und Rechnungen aus Aufenthalten übernehmen Straße, Hausnummer, PLZ und Ort aus dem zugeordneten Kundendatensatz. Ältere gespeicherte Adressformate werden ebenfalls gelesen.

Die Druckansicht setzt Zahlungsangaben und Dankzeile in den normalen Dokumentfluss. Über PDF speichern steht eine fertig gesetzte A4-Datei mit Seitennummern und reserviertem Platz für die Fußzeile bereit.

# GB379 – Abrechnung von Aufenthalten

An- und Abreise zählen jeweils als voller Betreuungstag. Der Workspace berechnet je Sonntag oder bayerischem Feiertag am Standort Stiefenhofen einen Zuschlag. Bei einer Überschneidung steht der Tag ausschließlich beim Feiertagszuschlag.

Zusatz-Spaziergänge können im Kundenportal mit einer Stückzahl angefragt werden. Die Auswahl wird zusammen mit der Anfrage übernommen. Bei einem neuen Aufenthalt beginnt die Option ohne Auswahl.

Die korrigierten Beträge erscheinen in der Preisvorschau, der Rechnung und der Druckansicht. Alte automatische Entwürfe lassen sich durch Öffnen auf die korrigierte Berechnung bringen. Weitere Angaben stehen in PRUEFBERICHT.md.

# GB370 – Reparatur-Testfassung vom 20. Oktober 2026

## Neu in GB370: private Dateien wieder abrufen und Fehler unterscheiden

Das Foto wird im zuletzt gemeldeten Stand erfolgreich hochgeladen und als Änderung erkannt. Die Anzeige scheitert danach beim privaten Dateiabruf. Die veröffentlichte workflow-ui.js entsprach bei der Untersuchung exakt GB369. Dessen Loader verbarg den tatsächlichen HTTP-Status und zeigte denselben allgemeinen Fehler für fehlende Datei und fehlende Berechtigung.

GB370 ersetzt den Fetch-Abruf mit no-store durch einen authentifizierten XMLHttpRequest mit Blob-Antwort. Die Anfrage setzt ausschließlich den erforderlichen Authorization-Header; eine eigene Anfragekennung verhindert die Wiederverwendung einer alten HTTP-Antwort. Anmeldung erneuern bei 401 wird einmal versucht. 403, 404, 429, Serverfehler, Netz/CORS, Zeitüberschreitung, leere Datei und nicht darstellbarer Inhalt haben unterschiedliche Hinweise an der Datei und in DIAG. Kein anonymer oder öffentlicher Token-Fallback wurde eingeführt.

Vorschau und vergrößertes Bild teilen sich einen laufenden Abruf. Kontowechsel bricht Downloads ab; eine verspätete Antwort oder Anmeldung derselben UID kann keinen alten Abruf fortsetzen. Private Blob-Adressen werden beim Kontoreset widerrufen. Ältere Fehler dürfen nicht an einem inzwischen ersetzten Bild erscheinen. Die Login-Seite verwendet nun dieselbe Buildnummer und neue Versionsverweise wie die App.

19 gezielte Transportprüfungen verwenden den nativen XMLHttpRequest aus jsdom mit echten HTTP-Anfragen und CORS-Vorabprüfungen gegen einen strengen lokalen Testserver. Die 26 Fotoprüfungen verwenden bei der Vorschau ebenfalls nativen XMLHttpRequest gegen den echten Firebase-Storage-Emulator. Auth-Identitäten, Grafik und Bilddekodierung bleiben simuliert. Das ist kein bestandener Live-Firebase- oder Safari-Test.

Firestore-/Storage-Regeln und Firebase-Konfiguration bleiben gegenüber GB369 unverändert. Bereits gespeicherte gültige Fotopfade sind weiterverwendbar. Fehlende Dateien oder historische Eingänge ohne Pfad können nicht durch diese Reparatur wiederhergestellt werden. Alle übrigen Reparaturen bleiben enthalten.

## Enthaltene frühere Änderungen

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
