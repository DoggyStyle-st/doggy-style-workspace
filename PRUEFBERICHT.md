# Doggy Style Workspace – GB374

Stand: 21. Oktober 2026. Build M50.9.9GB374_RATINGS_EDIT_TEST_20261021.

Bewertungen können jetzt bearbeitet und nach Bestätigung aus dem Bewertungsbestand entfernt werden. Die Kontenliste unter Einstellungen ist durch Suche, Rollenfilter, Seiten und begrenzte Höhe kompakt. Alle 233 unten aufgeführten Prüfungen bestehen. Es wurden keine produktiven Daten verändert. Vollständige angemeldete Live- und native Safari-/iOS-Prüfungen bleiben offen.

## Bewertungsverwaltung

Die vorherige Fassung bot nur Ansehen. Bestehende Statistikdokumente waren absichtlich vor Überschreiben und Löschen geschützt. GB374 ergänzt eine ausdrücklich bedienbare Bewertungsverwaltung für neue Bewertungen, ältere Firebase-Einträge, ältere Workspace-Bewertungen sowie eindeutig dem angemeldeten Konto zugehörige lokale Altbewertungen.

- Unter Statistik > Bewertungen gibt es Ansehen, Bearbeiten und Löschen. Die Aktionen sind auch aus der Detailansicht erreichbar.
- Bearbeiten füllt die vorhandenen Angaben vor: Hund, Datum, Typ, Geschlecht, Rasse, Alter, Skalen, Kontext, Gruppe, qualitative Angaben und die vollständige Notiz. Speichern überträgt genau diese Korrektur; Abbrechen verändert nichts. Unbekannte ältere Skalen bleiben erhalten. Fehlende alte Werte werden nicht durch erfundene Skalen ergänzt.
- Der Löschdialog nennt Hund, Datum, Typ und Notiz der konkreten Bewertung. Erst Bewertung löschen bestätigt die Entfernung. Der Eintrag verschwindet aus Liste, Auswertungen und den regulären JSON-/CSV-Exporten; andere Bewertungen bleiben erhalten.
- Erfolg wird erst nach bestätigter Speicherung in Firebase gemeldet. Bei Schreibfehlern bleiben Eingaben bzw. Bewertung sichtbar und die Aktion ist wiederholbar. Eine veraltete zweite Bearbeitung überschreibt keine zwischenzeitliche Änderung.
- Korrekturen und Löschungen gelten nach Neuladen und in einer zweiten Browser-Sitzung. Importierte alte Kopien werden nicht erneut angezeigt. Ältere Bewertungen ohne ID erhalten stabile Zuordnungen; auch identische ältere Einträge sind einzeln entfernbar.

Technisch ist Löschen eine dauerhafte logische Löschung mit einem serverseitigen Löschvermerk. Die ursprünglichen Bewertungen bleiben intern in ihren bisherigen Quellen erhalten. Es erfolgt keine physische Löschung aller alten Firebase-/Workspace-/Geräte- oder Sicherungskopien. Die App berücksichtigt den Löschvermerk bei jeder Liste, Analyse und regulären Sicherung. So wird eine entfernte Bewertung nicht aus einer alten Kopie wiederhergestellt. Dieser Vorgang verändert keine Verträge oder Kundendaten.

Korrekturen liegen in orgs/doggystyle/statisticChanges. Für eine noch sichtbare Bewertung wird der korrigierte Stand verwendet. Gelöschte Bewertungen können über die normale App nicht wieder aktiviert werden. Die JSON-Sicherung unter Statistik > Bewertungen enthält den sichtbaren, bereinigten Stand; sie ist keine vollständige administrative Rohsicherung der ursprünglichen Quellen oder Löschvermerke. Die allgemeine Workspace-Sicherung allein erfasst die separaten Statistik-Sammlungen nicht.

## Kompakte Kontenliste

Unter Einstellungen > Benutzer & Rollen gibt es eine Suche nach Name oder E-Mail und Filter für alle Konten, fehlende Kundenzuordnung, Kunden, Mitarbeiter und Administratoren. Es werden jeweils zehn Konten pro Seite angezeigt. Die Liste ist zusätzlich auf höchstens 420 Pixel bzw. die halbe Ansichtshöhe begrenzt und innerhalb dieses Bereichs scrollbar. Ein Konto lässt sich zum Zuteilen aufklappen.

Die Rolle wird erst mit Rolle speichern geschrieben. Suchen, Filtern, Blättern und Aufklappen verändern keine Daten. Veraltete Rollenauswahlen werden vor dem Speichern geprüft. Die tatsächliche Firestore-Dokument-ID bestimmt das Zielkonto. Benutzer ohne Erstellungsdatum bleiben auffindbar; die frühere Begrenzung auf die neuesten 200 Konten ist entfernt. Der Test verwendet 109 Konten einschließlich Konten ohne Erstellungsdatum.

Eine Rolle als Kunde ersetzt nicht die geprüfte Zuordnung zum vorhandenen Kundendatensatz. Die bestehenden sicheren Zuordnungsabläufe bleiben erhalten. Die Suchfunktion vergibt keine Zugriffsrechte automatisch.

## Berechtigungen und unveränderte Bereiche

Der neue interne Pfad statisticChanges ist ausschließlich für Administratoren und Mitarbeiter les- und beschreibbar. Die Regeln prüfen Datenform, Autor, Serverzeit, zulässige Skalen, Gruppengröße und fortlaufende Revisionsnummern. Kunden, unangemeldete Konten und fremde Organisationen sind ausgeschlossen. Löschvermerke dürfen weder entfernt noch wieder aufgehoben werden. Die unveränderten ursprünglichen Statistikpfade bleiben als Quellen erhalten.

Alle vorherigen Firestore-Regeln außerhalb dieser zusätzlichen Sammlung bleiben unverändert. Firebase-Projekt und Konfiguration, Storage-Regeln, Workflow-Kern, Kundenportal, Chat-Kern, Fotos, Bestandsreparatur, Druckmodule und deren Bibliotheken bleiben bytegleich mit GB373. app.js ändert außerhalb der Statistik nur die Benutzerlistenfunktion und Buildkennung. workflow-ui.js ergänzt ausschließlich das Leeren der Kontenliste beim Kontowechsel. HTML ergänzt das Kontenlistenmodul und seine Beschreibung; der Service Worker nimmt das Modul in den Cache auf. Die Vergleiche sind in gb374-preservation.json dokumentiert.

## Aktuelle Prüfungen

233 Prüfungen mit dem endgültigen Quellstand bestehen:

| Gruppe | Bestanden | Ausgeführt (UTC) |
| --- | ---: | --- |
| management | 36 | 2026-10-21T08:06:53.168Z |
| statistics | 40 | 2026-10-21T08:07:15.589Z |
| ui | 30 | 2026-10-21T08:07:19.408Z |
| startup | 18 | 2026-10-21T08:07:29.731Z |
| quota | 14 | 2026-10-21T08:07:33.809Z |
| firebase | 66 | 2026-10-21T08:07:56.270Z |
| portal-features | 21 | 2026-10-21T08:08:14.488Z |
| script-load | 8 | 2026-10-21T08:08:18.763Z |

Die 36 neuen Verwaltungsprüfungen und 40 Statistikprüfungen laden die ausgelieferte app.html mit ihren tatsächlichen lokalen Skript-Tags und Klickhandlern. Die exakt referenzierte Firebase-Browser-SDK-Version 10.12.5 wird lokal bereitgestellt. Die Datenzugriffe sprechen tatsächlich mit isolierten Firestore-Emulatoren. Die Anmeldung ist eine kontrollierte Emulator-Testidentität; der automatische Live-Login ist deaktiviert. Produktive Datenzugriffe werden im Browser blockiert.

Geprüft sind unter anderem Korrektur und Löschung bei neuen und älteren Quellen, ganze und teilweise Bewertungen, Originale mit abweichender Dokument-ID, alte Bewertungen ohne ID, einzeln entfernbare identische Altbewertungen, Abbrechen, serverbestätigtes Speichern, Neuladen, zweite Sitzung, gleichzeitige Bearbeitung, neue Exportdateien, Auswertung nach Löschungen, erhaltene Eingaben bei Fehlern, dauerhafte Löschvermerke, gesperrte Kundenkonten, Mitarbeiterzugriff und Kontoabmeldung. Wenn der Löschindex nicht gelesen werden kann, werden alte Kopien nicht als wieder gültige Bewertungen angezeigt.

Die Kontentests prüfen 109 Konten, fehlende Erstellungsdaten, Suche nach Name/E-Mail, Kombination mit Rollenfilter, Seitenwechsel, begrenzte Höhe, ausdrücklich gespeicherte Rolle, verweigerte und veraltete Rollenzuteilung sowie das Leeren beim Kontowechsel. Die Suche und tatsächlichen Bewertungsaktionen werden in Browser-Bildgrößen von iPad und iPhone bedient. Dies sind Chromium-Prüfungen, keine nativen Safari-Tests.

Die übrigen Gruppen prüfen Syntax, Abhängigkeiten, Start, Gerätespeicherfehler, sichere Kunden-/Vertrags-/Eingangsabläufe und tatsächliche HTML-Ladefolge einschließlich Druckklick und PDF-Download. Die 66 allgemeinen Firebase-Prüfungen enthalten vier ausdrücklich erwartete Reproduktionen des ursprünglichen unsicheren Standes. Die DOM-Gruppen verwenden jsdom; die echten HTML-Prüfungen verwenden Chromium 155. gb374-regression-run.json enthält die geprüften Quell-Hashes und die erfolgreichen Gruppenläufe.

Vorhandene Testkunden Max Mustermann/Rex und Sonja Sonnenschein/Bello werden ausschließlich als isolierte Kopien verwendet. Zusätzliche Konten und Bewertungen sind synthetische Emulator-Testdaten. Die hochgeladene Kundensicherung und ursprünglichen Workspace-/Statistikquellen werden auf unveränderte Inhalte geprüft. Kein produktiver Kunde und keine produktive Rolle wurden bearbeitet.

Frühere Spezialprüfungen für Fotos, Chatarchiv und umfangreiche Druck-/PDF-Layouts wurden in diesem Update nicht vollständig wiederholt. Ihre ursprünglichen Ergebnisse und Zeitpunkte bleiben als historische Nachweise enthalten. Die zugehörigen Module sind unverändert. Neue Bildschirmbilder und Testexporte bleiben interne Prüfdaten und sind nicht im Paket enthalten.

## Verbleibende Grenzen

- In den 233 aktuellen Prüfungen ist kein Test fehlgeschlagen.
- Ein vollständiger angemeldeter Zwei-Kunden-Live-Durchlauf im vorhandenen Firebase-Projekt sowie native Safari-/iPad-/iPhone-Bedienung und ein physischer Ausdruck bleiben offen. Diese Testfassung ist keine vollständige Live-Freigabe.
- Alte lokale Bewertungen sind zunächst auf ihrem ursprünglichen Gerät mit demselben Konto sichtbar. Erst eine ausdrückliche Übertragung oder Korrektur macht sie geräteübergreifend verfügbar. Nicht eindeutig zuordenbare Konten und unklare historische Skalen werden nicht automatisch umgedeutet.
- Bewertungslöschungen sind logische Löschungen. Ursprüngliche Quellen und ältere Sicherungen werden nicht physisch bereinigt. Eine administrative Rohsicherung müsste die separaten Statistik-Sammlungen einschließlich statisticChanges umfassen.
- Das zentrale Workspace-Dokument und die dokumentierten früheren Bestands-/Migrationsgrenzen bleiben bestehen. Dieses Update migriert oder repariert keine bestehenden Kunden, Verträge, Unterschriften, Aufenthalte oder Anfragen automatisch.

## Installation auf dem iPad

1. Vollständige Dateien aus DoggyStyle_Workspace_GB374_TEST am bisherigen Ort einspielen, einschließlich assets, vendor, statistics-store.js und account-directory.js.
2. Bisherige Firestore-Regeln sichern. REGELN_ANZEIGEN.html öffnen, Firestore auswählen und den vollständigen Regeltext dieses Pakets im vorhandenen Projekt doggy-style-hundepension veröffentlichen. Storage-Regeln bleiben unverändert.
3. Neu laden und M50.9.9GB374_RATINGS_EDIT_TEST_20261021 in Login und DIAG prüfen. Keine Safari-Websitedaten löschen und keinen Daten-Reset ausführen.
4. Statistik > Bewertungen für Bearbeiten/Löschen verwenden. Einstellungen > Benutzer & Rollen für Kontensuche, Rollenfilter und kompakte Liste öffnen. Eine Bestandsreparatur ist für diese neuen Funktionen nicht nötig.

INSTALLATION_IPAD.txt enthält diese Schritte. Historische Berichte unter pruefungen beschreiben frühere Fassungen; dieser Bericht beschreibt GB374.
