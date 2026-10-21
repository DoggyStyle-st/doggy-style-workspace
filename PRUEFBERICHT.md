# Doggy Style Workspace – GB375 Sync-Abgleich

Stand: 21. Oktober 2026. Build M50.9.9GB375_SYNC_REVIEW_TEST_20261021.

Die App unterscheidet jetzt echte Firebase-Fehler von lokalen Daten, die geprüft werden müssen. Der Vergleich steht sichtbar auf der Startseite und in jedem Workspace-Bereich bereit. Eine bereits abgeglichene ältere Gerätekopie wird nach Neuladen nicht erneut als ungesendet eingelesen. Alle 259 aktuellen Prüfungen bestehen. Es wurden keine produktiven Daten verändert. Die vollständige angemeldete Live-Abnahme und native Safari-/iOS-Prüfung bleiben offen.

## Befund zum Screenshot

Die Diagnose zeigt einen bestätigten Workspace-Serverstand und zugleich lokale Änderungen zur Prüfung. Der Screenshot allein zeigt nicht, welche privaten lokalen Angaben abweichen. Im GB374-Code wurden drei Probleme nachgestellt: eine allgemeine rote Fehlermeldung trotz bestätigtem Serverabruf, der nur innerhalb der ausgeblendeten Einstellungen verfügbare Vergleich und eine Konfliktmeldung allein aufgrund neuerer lokaler Zeitstempel.

Die drei ursprünglichen Verhaltensweisen wurden mit dem unveränderten, aus der ausgegebenen GB374-ZIP entpackten Stand reproduziert. gb374-sync-reproduction.json nennt die Quell-Hashes und den isolierten Prüfumfang. Diese Reproduktionen verwenden jsdom und kontrollierte Firebase-Antworten; sie sind kein Live-Test.

Der zusätzliche Test nach einem tatsächlichen Emulator-Abgleich zeigte außerdem: Eine ältere lokale Fallback-Kopie konnte wegen ihres höheren alten Zeitstempels wieder vor den bereits abgeglichenen IndexedDB-Stand gezogen werden. Die Sicherung vor dem Abgleich war dauerhaft vorhanden, wurde aber beim nächsten Start nicht in die herunterladbare lokale Sicherung geladen. Beide Fälle sind korrigiert und auf Neuladen geprüft.

## Repariertes Verhalten

- Gleiche Inhalte mit anderen Transportzeitstempeln lösen keinen Konflikt mehr aus. Bekannte Anzeigepräferenzen wie der Statistik-Unterpunkt oder Hygiene-/Medikationsfilter zählen nicht als fachliche Änderung. Kunden, Hunde, Fotos, Dokumente, Rechtstexte, Verträge, Freigaben, Unterschriften und unbekannte Datenfelder werden weiterhin verglichen. Die Ausgangsdaten werden durch den Vergleich nicht verändert.
- Ein bestätigter Serverabruf ohne ungesendete Fachänderung zeigt Firebase verbunden. Echte lokale Abweichungen bleiben erhalten und erscheinen gelb als Lokale Änderungen prüfen. Tatsächliche Netz-, Anmelde-, Speicher- und Berechtigungsfehler werden weiterhin als Fehler angezeigt. Der genaue Fehlertext steht zusätzlich in DIAG.
- Änderungen vergleichen ist außerhalb einzelner Bereiche sichtbar. Auch die Statusmeldung lässt sich anklicken oder mit der Tastatur öffnen. Eine aufklappbare Tabelle zeigt konkrete Unterschiede zwischen Gerät und Firebase; bei sehr vielen Unterschieden werden die ersten 60 aufgeführt. Vollständige Angaben bleiben in der lokalen Sicherung erhalten.
- Bei widersprüchlichen Änderungen muss weiterhin für jeden Konflikt eine konkrete Fassung ausgewählt werden. Verträge und Unterschriften bleiben als Gruppe zusammen. Vor dem Übernehmen wird der Serverstand erneut geprüft. Eine veraltete Auswahl überschreibt keine zwischenzeitlichen Änderungen.
- Ohne gespeicherten Ausgangsstand ist Zusammenführen gesperrt. Lokales sichern und Serverstand anzeigen schreibt nichts in Firebase. Zuerst wird die lokale Fassung dauerhaft gesichert. Schlägt das fehl, bleiben die Daten unverändert. Abbrechen verändert nichts. Automatisches und manuelles Cloud-Speichern umgehen eine ausstehende Prüfung nicht.
- Die normale lokale Sicherung ist unter Einstellungen > Cloud & Konto > Lokale Sicherung herunterladen zugänglich. Sie enthält auch ungesendete Daten und gesicherte Fassungen vor einem Abgleich. Diese Sicherungen werden nach Neuladen wieder aus IndexedDB geladen und sind erneut herunterladbar.
- Beim dauerhaften Speichern wird in derselben IndexedDB-Transaktion festgehalten, welche ursprüngliche Fallback-Fassung bereits berücksichtigt wurde. Die ursprüngliche Fallback-Kopie bleibt unverändert. Eine danach tatsächlich neue Fassung aus einem anderen älteren Tab wird weiterhin als Änderung erkannt. Daten werden weder gelöscht noch allein aufgrund eines Zeitstempels als erledigt behandelt.
- Ein laufender Speichervorgang und neue, während des Startabrufs oder Speicherns erfasste Angaben bleiben geschützt. Kontowechsel entfernt Hinweise, Vergleich, Ausgangsstand und alte Fehlermeldungen.

## Unveränderte Bereiche

Firestore-Regeln, Storage-Regeln und Firebase-Konfiguration sind bytegleich mit GB374. Es gibt keine neue Firebase-Sammlung, keine zusätzliche Freigabe und keine automatische Bestandsmigration. Nach bereits veröffentlichter GB374-Regelfassung müssen für dieses Update keine Regeln geändert werden.

Die Module für Statistik, Bewertungsbearbeitung/-löschung, Kontensuche, Kundenportal, Chat, Workflow-Kern, Bestandsreparatur, Dokumentausgabe und Tages-Sammeldruck bleiben bytegleich. Die Foto-Funktionen bleiben unverändert. app.js und workflow-ui.js ändern gezielt die Sync-Funktionen, Diagnose und die lokale Sicherung. browser-store.js ergänzt die sichere Erkennung alter Fallback-Kopien und das erneute Laden der Abgleichsicherungen. Die bisherigen Styles werden nur um Regeln für den neuen Hinweis und Vergleich ergänzt. HTML, Auth-Datei und Service Worker ändern ausschließlich die Buildkennung. gb375-preservation.json enthält die Vergleiche.

## Aktuelle Prüfungen

259 Prüfungen mit dem endgültigen Quellstand bestehen:

| Gruppe | Bestanden | Ausgeführt (UTC) |
| --- | ---: | --- |
| sync-review | 16 | 2026-10-21T08:45:37.412Z |
| sync-content | 10 | 2026-10-21T08:45:44.860Z |
| management | 36 | 2026-10-21T08:46:33.574Z |
| statistics | 40 | 2026-10-21T08:46:58.797Z |
| ui | 30 | 2026-10-21T08:47:03.018Z |
| startup | 18 | 2026-10-21T08:47:14.610Z |
| quota | 14 | 2026-10-21T08:47:18.195Z |
| firebase | 66 | 2026-10-21T08:47:41.827Z |
| portal-features | 21 | 2026-10-21T08:48:03.801Z |
| script-load | 8 | 2026-10-21T08:48:08.284Z |

Die 16 neuen Sync-Browserprüfungen laden die ausgelieferte app.html mit ihren tatsächlichen Skript-Tags und führen den vollständigen startApp-/Anmelde-Callback aus. Die exakt referenzierte Firebase-Browser-SDK-Version 10.12.5 spricht mit einem tatsächlichen isolierten Firestore-Emulator. Die Anmeldung bleibt eine kontrollierte Emulator-Testidentität. Nicht lokale Datenzugriffe sind blockiert; es wird kein Live-Konto verwendet.

Geprüft sind bestätigter Start, gleiche Daten mit neuerem lokalem Zeitstempel, erhaltene echte Änderungen, auf der Startseite sichtbarer Hinweis, Tastaturbedienung, konkrete Datenanzeige, Abbrechen, gesperrtes Umgehen der Prüfung, Sicherung vor dem Anzeigen des Servers ohne Firebase-Schreibzugriff, Download der Sicherung, Neuladen ohne Wiederkehr der alten Warnung, Drei-Wege-Vergleich, tatsächliche Übernahme der ausgewählten Änderung im Emulator und die Abweisung einer inzwischen veralteten Auswahl. Browser-Bildgrößen von iPad und iPhone sowie Kontowechsel werden ebenfalls geprüft.

Die zehn zusätzlichen jsdom-/fake-indexeddb-Prüfungen schützen den Inhaltsvergleich, Fach- und Vertragsdaten, neue Änderungen während des Abrufs, laufende Veröffentlichungen, echte rote Fehler, fehlgeschlagene Sicherungen und unbekannte Ausgangsstände. Die ursprüngliche Fallback-Kopie bleibt bytegleich. Eine nachträglich neu geänderte Kopie aus einem anderen Tab wird weiterhin erhalten und zur Prüfung angeboten.

Die übrigen acht Gruppen wiederholen die bisherigen 233 Prüfungen für Bewertungsverwaltung, Kontensuche mit 109 Konten, Statistik, Syntax und Abhängigkeiten, Start, Gerätespeicherfehler, sichere Kunden-/Vertrags-/Eingangsabläufe und die tatsächliche HTML-Ladefolge samt Druckklick und PDF-Download. DOM-Gruppen verwenden jsdom, echte HTML-Prüfungen Chromium 155. Die 66 allgemeinen Firebase-Prüfungen enthalten vier ausdrücklich erwartete Reproduktionen des ursprünglichen unsicheren Standes. gb375-regression-run.json enthält Quell-Hashes, Gruppenläufe und deren Abschluss.

Die vorhandenen Testkunden Max Mustermann/Rex und Sonja Sonnenschein/Bello werden ausschließlich als isolierte Kopien verwendet. Zusätzliche Beobachtungen und Rollen sind synthetische Emulator-Testdaten. Die hochgeladene Sicherung bleibt unverändert. Neue Prüfbilder und Downloads bleiben interne Prüfdaten und werden nicht im Paket ausgegeben.

Frühere Spezialprüfungen für Fotos, Chatarchiv und umfangreiche Druck-/PDF-Layouts wurden nicht vollständig wiederholt. Die zugehörigen Module bleiben unverändert; deren ursprüngliche Ergebnisse und Zeitpunkte sind als historische Nachweise enthalten. Die tatsächliche HTML-Ladefolge samt Druckklick wird aktuell erneut geprüft.

## Verbleibende Grenzen

- In den 259 aktuellen Prüfungen ist kein Test fehlgeschlagen.
- Ein vollständiger angemeldeter Zwei-Kunden-Live-Durchlauf im vorhandenen Firebase-Projekt, native Safari-/iPad-/iPhone-Bedienung und ein physischer Ausdruck bleiben offen. Diese Fassung ist keine vollständige Live-Freigabe.
- Eine gelbe Meldung kann bei tatsächlich ungesendeten Angaben oder einem nicht eindeutig belegbaren alten Ausgangsstand weiterhin erscheinen. Dann ist eine ausdrückliche Prüfung erforderlich. Die App veröffentlicht oder verwirft solche Angaben nicht automatisch.
- Ist der Gerätespeicher ausgefallen, muss zuerst eine verfügbare Sicherung heruntergeladen werden. Website-Daten löschen oder Reset entfernt keine Ursache und kann lokale Angaben gefährden.
- Die separate Statistik bleibt wie in GB374 logisch löschbar. Ursprüngliche Quellen und Sicherungen werden nicht physisch bereinigt. Die allgemeine Workspace-Sicherung erfasst nicht alle separaten Statistik-Sammlungen.
- Das zentrale Workspace-Dokument und frühere Bestands-/Migrationsgrenzen bleiben bestehen. Dieses Update migriert oder repariert keine vorhandenen Firebase-Kunden, Verträge, Unterschriften, Aufenthalte oder Anfragen automatisch.

## Installation auf dem iPad

1. Vollständige Dateien aus DoggyStyle_Workspace_GB375_TEST am bisherigen Ort übernehmen, einschließlich assets, vendor und aller JavaScript-Dateien.
2. Von GB374 kommend keine Firestore- oder Storage-Regeln erneut ändern. Beide Regeldateien und die Firebase-Konfiguration sind unverändert.
3. Neu laden und M50.9.9GB375_SYNC_REVIEW_TEST_20261021 in Login und DIAG prüfen. Keine Safari-Websitedaten löschen und keinen Daten-Reset ausführen.
4. Bei Lokale Änderungen prüfen den sichtbaren Knopf Änderungen vergleichen verwenden. Konkrete Angaben prüfen. Lokales sichern und Serverstand anzeigen erstellt zuerst eine dauerhafte Gerätesicherung und überschreibt nichts in Firebase. Mit gültigem Ausgangsstand kann eine ausdrücklich geprüfte Auswahl gemeinsam gespeichert werden.
5. Lokale Sicherungen einschließlich Abgleichkopien lassen sich unter Einstellungen > Cloud & Konto herunterladen.

INSTALLATION_IPAD.txt enthält die Bedienung. Die historischen Vorberichte unter pruefungen beschreiben ihre jeweiligen älteren Fassungen; dieser Bericht beschreibt GB375.
