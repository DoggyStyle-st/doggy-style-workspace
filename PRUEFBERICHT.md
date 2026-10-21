# Doggy Style Workspace - GB373 Statistik-Reparatur

Stand: 21. Oktober 2026. Build M50.9.9GB373_STATISTICS_TEST_20261021.

Vollständige Testfassung. Die unten genannten Emulator- und Browserprüfungen bestehen. Ein vollständiger angemeldeter Live-Durchlauf im bestehenden Projekt und die native Safari-/iOS-Prüfung bleiben offen. Es wurden keine produktiven Daten verändert.

## Nachgestellte Ursachen

Die bisherige Statistik meldete Gespeichert, obwohl die Firestore-Regeln den separaten Statistikpfad sperrten. Der Fehler wurde abgefangen und verschwiegen; die Bewertung blieb nur unter einem gemeinsamen lokalen Browserschlüssel. Andere Geräte konnten sie daher nicht finden. Außerdem fehlten ältere Bewertungen aus dem Workspace in der neuen Liste.

Die Datumsinitialisierung rief eine nicht vorhandene Funktion toISODate statt toISODateLocal auf. Der Fehler wurde ebenfalls verschwiegen. Gruppenanalysen erwarteten gespeicherte Gruppenmitglieder, die im Formular überhaupt nicht erfasst werden konnten. Teilweise unbekannte ältere Skalen konnten als günstiger Nullwert in Mittelwerten erscheinen. Die Hauptnavigation enthielt zusätzlich einen nicht geschlossenen Pfoten-Knopf und erzeugte auf schmalen Geräten Überbreite.

Sechs erwartete Fehlerreproduktionen mit unveränderter GB372 sind separat in gb372-statistics-reproduction.json dokumentiert. Sie stammen vom vorangegangenen isolierten Durchlauf mit Browser-SDK 13. Der aktuelle Abschlusstest verwendet die tatsächlich referenzierte SDK-Version 10.12.5.

## Repariertes Verhalten

- Neue Bewertungen erhalten eigene IDs und werden erst nach serverseitig bestätigtem Speichern als gespeichert gemeldet. Bestehende Bewertungen werden weder überschrieben noch gelöscht. Wiederholungen desselben fehlgeschlagenen Sendeversuchs verwenden dieselbe ID.
- Statistik > Bewertungen zeigt ohne voreingestellte Datumsgrenze neue Firebase-Bewertungen, ältere Einträge unter orgs/doggystyle/stats, Workspace-Bewertungen und eindeutig zum angemeldeten Konto und vorhandenen Hund passende lokale Altbewertungen. Speicherorte sind gekennzeichnet. Ansehen öffnet sämtliche Skalen, Kontext, qualitative Angaben, Gruppenmitglieder und die vollständige Notiz.
- Lokale Altbewertungen werden ausschließlich nach ausdrücklichem Übertragen und Bestätigen ergänzt. Die alten lokalen Originale bleiben erhalten. Andere Browserkonten werden nicht mit eingelesen. Neue Entwürfe verwenden einen nach Projekt, Organisation und UID getrennten Gerätespeicher; sie sind auch in der lokalen Sicherung enthalten.
- Analyse, Rassenvergleich, Heatmap, Gruppenvergleich, CSV und JSON-Sicherung verwenden denselben zusammengeführten Bestand. Datumsgrenzen sind gültig, Hundwechsel leert unbekannte Metadaten, leere Zahlen bleiben unbekannt. Gruppenmitglieder sind jetzt ausdrücklich erfassbar. Der Gruppenvergleich beschreibt Beobachtungen und enthält keine KI-Prognose.
- Neue und ältere erkennbare Skalen werden für Index B mit dem im Methodik-Menü angezeigten Modell ausgewertet. Unbekannte alte Skalen werden nicht erfunden, umgedeutet oder als Null gewertet. Sie bleiben im Original nachlesbar und in der JSON-Sicherung enthalten. Vergleiche aus unterschiedlich vollständigen Altbewertungen sind entsprechend vorsichtig zu interpretieren.
- Serverfehler bleiben sichtbar, auch wenn lokale Daten angezeigt werden können. Kontowechsel schließt Details und entfernt vorherige Statistikansichten. Navigation und Statistikbedienung bleiben in schmalen Browser-Bildgrößen ohne Seitenüberbreite erreichbar.

## Firestore-Ergänzung

Die bestehenden Regeln bleiben außerhalb zweier zusätzlicher Statistikpfade unverändert. orgs/doggystyle/statistics erlaubt nur Administratoren und Mitarbeitern das Lesen und Anlegen gültiger neuer Bewertungen. Kunden und unangemeldete Konten sind gesperrt. Autor, Datum, zehn ganzzahlige Skalen von 1 bis 10, Gruppenangaben und Serverzeit werden geprüft. Bestehende Statistikdokumente sind nicht überschreibbar oder löschbar. Der ältere Pfad orgs/doggystyle/stats ist für Mitarbeiter nur lesbar.

Firebase-Projekt, öffentliche Browserkonfiguration, Storage-Regeln, Workflow-Core, Chat-/Kundenportal-Kern, Bestandsreparatur und Druckmodule bleiben bytegleich mit GB372. workflow-ui.js ergänzt ausschließlich den Statistikreset beim Kontowechsel. app.js bleibt außerhalb des Statistikblocks bis auf die Buildkennung unverändert. gb373-preservation.json enthält die Vergleiche. Das bestehende Projekt wird weiterverwendet.

## Aktuelle Prüfungen

197 gezielte Prüfungen wurden mit dem aktuellen Quellstand ausgeführt und bestehen:

| Gruppe | Bestanden | Ausgeführt (UTC) |
| --- | ---: | --- |
| statistics | 40 | 2026-10-21T07:32:46.632Z |
| ui | 30 | 2026-10-21T07:32:52.218Z |
| startup | 18 | 2026-10-21T07:33:04.301Z |
| quota | 14 | 2026-10-21T07:33:08.476Z |
| firebase | 66 | 2026-10-21T07:33:32.605Z |
| portal-features | 21 | 2026-10-21T07:33:52.250Z |
| script-load | 8 | 2026-10-21T07:33:57.145Z |

Die 40 Statistikprüfungen laden die ausgelieferte app.html mit ihren tatsächlichen lokalen Skript-Tags und Klickhandlern. Die exakt referenzierten öffentlichen Firebase-10.12.5-Browserdateien werden lokal bereitgestellt; Firestore spricht tatsächlich mit dem isolierten demo-doggy-statistics-Emulator. Die Anmeldung ist als Emulator-Testidentität kontrolliert, der automatische Live-Login ist deaktiviert. Produktive Anfragen werden blockiert.

Geprüft sind echte serverbestätigte Speicherung, Wiederfinden nach Neuladen und in einer zweiten Browser-Sitzung ohne lokalen Bestand, Altbestand, Details, Filter, JSON/CSV-Dateien, jede Auswertung, Übertragen lokaler Altbewertungen ohne Duplikate, verweigerte Schreib-/Lesezugriffe, anschließendes erneutes Senden, Mitarbeiterzugriff, zwei gesperrte Kundenkonten, unangemeldete und fremde Organisationen sowie das Verhindern von Überschreiben und Löschen. Fehlende historische Skalen werden ausdrücklich geprüft.

Die vorhandenen Testkunden Max Mustermann/Rex und Sonja Sonnenschein/Bello werden als isolierte Kopien verwendet. Workspace, ältere Cloud-Daten und die hochgeladene Sicherung bleiben dabei unverändert. Zusätzliche Beobachtungen sind ausdrücklich synthetische Emulator-Testdaten. Es wurde kein Kundenbestand im bestehenden Firebase-Projekt bearbeitet.

Die übrigen Gruppen prüfen Syntax und Abhängigkeiten, Anmeldestart, Gerätespeicherfehler, die bestehenden sicheren Kunden-/Vertrags-/Eingangsabläufe und die tatsächliche HTML-Ladefolge samt Druckklick und PDF-Download. Die 66 allgemeinen Firebase-Prüfungen enthalten auch vier ausdrücklich erwartete Reproduktionen des ursprünglichen unsicheren Standes. DOM-Prüfungen verwenden jsdom; die tatsächlichen HTML-/Statistikprüfungen verwenden Chromium 155. Die Quell-Hashes des geprüften Standes stehen in gb373-regression-run.json.

Die früheren Spezialprüfungen für Fotos, Chatarchiv und umfangreiche Druck-/PDF-Layouts wurden in diesem Statistikupdate nicht vollständig neu ausgeführt. Ihre ursprünglichen Ergebnisse und Zeitpunkte bleiben als historische Nachweise enthalten. Der vorherige Druckfix GB372 ist enthalten. Neue Bildschirmbilder und Test-PDFs bleiben interne Prüfdaten und sind nicht im Paket.

## Verbleibende Grenzen

- In den 197 aktuellen Prüfungen ist kein Test fehlgeschlagen. Nachprüfungen in nativer Safari auf dem eigenen iPad/iPhone stehen weiterhin aus; Chromium in gleicher Bildgröße ersetzt sie nicht.
- Ein vollständiger angemeldeter Zwei-Kunden-Live-Test im vorhandenen Firebase-Projekt, direkte fremde Dokument-/Dateipfade, parallele Sitzungen und echte Netzunterbrechungen stehen weiterhin aus. Die neue Fassung ist daher keine vollständige Live-Freigabe.
- Alte lokale Daten müssen auf dem ursprünglichen Gerät mit demselben Konto geprüft werden. Nicht eindeutig zuordenbare Konten, beschädigte lokale JSON-Daten oder inhaltlich unklare alte Skalen werden nicht automatisch repariert. Originale bleiben erhalten. Historische Angaben werden nicht nachträglich bestätigt.
- Die neue Statistik-Sammlung ist in der zusätzlichen JSON-Sicherung unter Statistik > Bewertungen enthalten. Die bisherige allgemeine Workspace-Sicherung allein erfasst diese separate Sammlung nicht.
- Das zentrale Workspace-Dokument und die bereits dokumentierten Altanfragen-/Migrationsgrenzen bleiben bestehen. Dieses Update führt keine Bestandsmigration aus.

## Installation

1. Vollständige Dateien aus DoggyStyle_Workspace_GB373_TEST am bisherigen Ort einspielen, einschließlich assets, vendor und statistics-store.js.
2. Die bisherige Firestore-Regelfassung sichern. REGELN_ANZEIGEN.html öffnen, Firestore wählen und den vollständigen GB373-Regeltext in der eigenen Konsole im vorhandenen Projekt doggy-style-hundepension veröffentlichen. Storage-Regeln bleiben unverändert.
3. Neu laden und GB373_STATISTICS_TEST_20261021 in Login und DIAG prüfen. Statistik > Erfassung > Bewertung speichern > Bewertungen > Ansehen prüfen und anschließend neu laden.
4. Für lokale Altbewertungen zuerst Bewertungen sichern (JSON) und dann bei Bedarf Lokale Bewertungen in Firebase sichern verwenden. Keine Safari-Websitedaten löschen und keinen Daten-Reset ausführen.

INSTALLATION_IPAD.txt enthält diese Schritte. Die Vorberichte unter pruefungen sind historisch; dieser Bericht beschreibt die aktuelle Fassung und ihre Grenzen.
