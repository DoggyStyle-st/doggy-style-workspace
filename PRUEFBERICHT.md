# Doggy Style Workspace – GB376 Sicherheitsdatenblätter

Stand: 21. Oktober 2026. Build M50.9.9GB376_SDS_STORAGE_TEST_20261021.

Der Speicherfehler durch eingebettete Sicherheitsdatenblätter ist in der Testfassung behoben. Alle 302 aktuellen Prüfungen bestehen. Die Tests nutzen echte isolierte Firebase-Emulatoren und den ausgelieferten App-Code. Produktive Daten und produktive Regeln wurden nicht verändert. Die angemeldete Live-Abnahme im bestehenden Projekt und native Safari-/iOS-Prüfungen bleiben offen.

## Ursache und Reparatur

Der Screenshot zeigt zwei vollständige PDFs im Feld compliance.hazards[].sds.dataUrl: 860.630 und 674.638 Byte. Zusammen sind das 1.535.268 Byte Rohdaten und durch Base64 mehr als 2 MB im Workspace. Das überschreitet dessen bewusst beibehaltene Schutzgrenze von 900.000 Byte. Ein erneutes Bestätigen oder eine Lockerung der Firestore-Regeln behebt das nicht.

Sicherheitsdatenblätter werden nun im vorhandenen privaten Firebase Storage unter orgs/doggystyle/safetyDataSheets/{sha256}.pdf gespeichert. Der Workspace enthält Dateipfad, Hash, Größe, Dateiname und Zeitpunkt. Die PDF-Originale werden nicht abgeschnitten oder gelöscht.

Beim normalen Speichern und beim ausdrücklich bestätigten Abgleich läuft dieselbe Vorbereitung: Serverrevision prüfen, lokale Fassung dauerhaft sichern, bekannte SDS-Anhänge auf einer Kopie prüfen und übertragen, anschließend die bestehende Firestore-Transaktion mit unverändertem Revisionsschutz ausführen. Erst nach erfolgreichem Abschluss ersetzt die Gerätekopie die eingebetteten PDFs durch Referenzen. Ein Quota-, Berechtigungs-, Netzwerk- oder Serverkonflikt lässt die lokale Fassung erhalten. Wiederholungen verwenden identische vorhandene Dateien, statt sie zu überschreiben.

Die normalen SDB-Öffnen-/Download-Knöpfe unterstützen beide Fassungen. Gespeicherte PDFs werden mit Anmeldung abgerufen und gegen den gespeicherten SHA-256-Hash geprüft. Das bestehende Dokumentfenster bietet PDF speichern, PDF öffnen, PDF teilen auf unterstützten Geräten und Drucken. Eine neue Anmeldung und ein Neuladen benötigen keine lokal zwischengespeicherte PDF. Die App ruft dafür kein getDownloadURL auf und speichert keine Token-Downloadlinks.

Beim Test einer gleichzeitigen Serveränderung fiel außerdem eine verzögerte Statusanzeige auf. Nach einem Revisionskonflikt zeigt die App jetzt unmittelbar Lokale Änderungen prüfen. Weitere lokale Bearbeitungen während eines Uploads bleiben erhalten und werden anschließend separat synchronisiert. Kontowechsel verhindern, dass eine verspätete Datei im nächsten Konto angezeigt wird.

## Berechtigungen und unveränderte Bereiche

Nur der neue Storage-Pfad ist ergänzt: Administratoren dürfen PDFs bis 8 MB anlegen; Administratoren und Mitarbeiter dürfen sie lesen. Kunden, Gäste und unangemeldete Nutzer haben keinen Zugriff. Organisation, Uploadkonto, Dateityp und Hash-Metadaten werden geprüft. Vorhandene Objekte können weder überschrieben noch gelöscht werden, auch nicht durch diese App als Administrator. Das Entfernen eines PDF-Verweises löscht deshalb keine Datei, auf die eine Sicherung noch verweisen könnte.

Die Firestore-Regeln, Firebase-Konfiguration und bisherigen Foto-/Chat-Storage-Pfade sind gegenüber GB375 unverändert. Workflow-Kern, Kundenportal, Kommunikation, Statistik, Kontosuche, Browser-Datenspeicher und Dokumentausgabe sind bytegleich erhalten. Bei HTML, Auth und Service Worker ändert sich nur die Buildkennung. Der Änderungsumfang ist zusätzlich mit GB375 verglichen und geprüft.

## Erfolgreiche aktuelle Tests

| Gruppe | Bestanden | Testzeit UTC |
| --- | ---: | --- |
| sds | 24 | 2026-10-21T09:16:52.297Z |
| media | 19 | 2026-10-21T09:16:56.694Z |
| sync-review | 16 | 2026-10-21T09:17:46.728Z |
| sync-content | 10 | 2026-10-21T09:17:52.228Z |
| management | 36 | 2026-10-21T09:18:29.008Z |
| statistics | 40 | 2026-10-21T09:18:53.591Z |
| ui | 30 | 2026-10-21T09:18:57.531Z |
| startup | 18 | 2026-10-21T09:19:08.412Z |
| quota | 14 | 2026-10-21T09:19:14.547Z |
| firebase | 66 | 2026-10-21T09:19:43.830Z |
| portal-features | 21 | 2026-10-21T09:20:04.852Z |
| script-load | 8 | 2026-10-21T09:20:10.172Z |

Gesamt: 302 Prüfungen in 12 Gruppen, ohne fehlgeschlagene aktuelle Prüfung.

Die 24 neuen SDS-Prüfungen reproduzieren zunächst die alte Größenabweisung mit zwei synthetischen, gültigen PDFs in genau den gezeigten Dateigrößen. Danach prüfen sie den tatsächlichen Abgleich in der ausgelieferten HTML-Seite, reale Storage-Uploads, die atomare Firestore-Speicherung kompakter Referenzen, bytegleiche Downloads nach komplettem Neuladen und eine zweite Team-Anmeldung. Die heruntergeladene Gerätesicherung enthält weiterhin beide vollständigen Originaldateien. pdfinfo prüft die gespeicherten Test-PDFs als gültige einseitige Dokumente.

Zusätzlich geprüft: fehlgeschlagene lokale Sicherung; bisherige Storage-Regeln mit verständlicher Fehlermeldung; falsche Dateitypen und Metadaten; fremde Organisation; kunden-/gast-/anonymer Lesezugriff; Mitarbeiter-/Kundenschreiben; unveränderbare Dateien; beschädigte oder zu große PDF-Eingabe; manipulierte Verweise; tatsächlicher neuer Datei-Upload über den App-Knopf; weitere Bearbeitung während des Uploads; zwischenzeitlich geänderter Firebase-Stand und anschließende Wiederaufnahme ohne erneuten Datei-Upload; Kontowechsel während des Abrufs. Kundenportale enthalten keine Sicherheitsdatenblätter; Verträge, Unterschriften und vorhandene Stammdaten bleiben fachlich unverändert.

Die weiteren 278 Prüfungen decken bisherigen Abgleich, Gerätesicherungen, Kundentrennung, Einreichungen und Freigaben, Rollen, Chat, Aufenthalte, Kapazität, Statistik und Kontosuche, Startverhalten, Quota-Verhalten, Medienabruf und die tatsächliche HTML-Ladereihenfolge ab. Bei den Sicherheitsprüfungen gilt die erwartete Abweisung unsicherer Zugriffe als Erfolg.

Umgebung: Chromium 155 mit dem exakten ausgelieferten Firebase-Browser-SDK 10.12.5; Firestore-/Storage-Emulatoren, Node- und jsdom-Tests. Für die Browser-Dateiabrufe wird ausschließlich die Zieladresse auf den lokalen Storage-Emulator umgebogen. Kein Emulator-Test ist ein angemeldeter Live-Test im produktiven Firebase-Projekt oder ein Test in echtem iPad-Safari.

## Installation und Wiederaufnahme auf dem iPad

1. Eine lokale Gerätesicherung unter Einstellungen > Cloud & Konto > Lokale Sicherung herunterladen in Dateien behalten. Keine Safari-Websitedaten löschen und keinen Reset ausführen.
2. Vollständigen Inhalt aus DoggyStyle_Workspace_GB376_TEST am bisherigen Ort übernehmen, einschließlich assets, vendor und aller JavaScript-Dateien.
3. Die neue storage.rules in der bestehenden Firebase-Konsole unter Storage > Regeln prüfen und veröffentlichen. REGELN_ANZEIGEN.html zeigt unter Storage den exakten kopierbaren Text. Firestore-Regeln für diese Änderung unverändert lassen.
4. Neu laden und M50.9.9GB376_SDS_STORAGE_TEST_20261021 in DIAG prüfen.
5. Bei Lokale Änderungen prüfen den Vergleich öffnen und nach Prüfung Auswahl gemeinsam speichern verwenden. Damit werden die beiden lokal vorliegenden PDFs separat gespeichert. Widersprüchliche Angaben benötigen vorher eine ausdrückliche Auswahl. Anschließend Compliance > Gefahrstoffe > SDB öffnen und PDF speichern prüfen.

Lokales sichern und Serverstand anzeigen übernimmt den bisherigen Serverstand in die Anzeige; diese Option lädt lokale PDFs nicht in die Cloud. Für den gezeigten Fall ist nach Prüfung die gemeinsame Speicherung vorgesehen.

## Verbleibende Grenzen

- Die neuen Regeln müssen im bestehenden Projekt veröffentlicht und die Abläufe dort angemeldet abgenommen werden. Dies wurde nicht stellvertretend ausgeführt; Firebase-Plugin und produktive Anmeldedaten stehen nicht zur Verfügung.
- Native Safari-/iPad-/iPhone-Darstellung, Teilen-Menü und echter Drucker sind noch auf den Geräten zu prüfen.
- Die Übertragung betrifft bekannte Sicherheitsdatenblatt-Felder. Andere ungewöhnlich große eingebettete Inhalte werden nicht automatisch entfernt; das Workspace-Limit bleibt bestehen.
- Ein Firestore-Fehler nach bestätigtem Datei-Upload kann eine zunächst unreferenzierte Storage-Datei hinterlassen. Sie wird für eine sichere Wiederholung behalten. Es gibt keine automatische Löschbereinigung.
- Ein automatisches Zusammenführen bleibt ohne vertrauenswürdigen Ausgangsstand gesperrt. Bestehende öffentliche Token-Links werden nicht widerrufen; die App erzeugt und speichert für diese Funktion keine solchen Links.

Historische Prüfprotokolle unter pruefungen beschreiben ältere Fassungen; maßgeblich ist dieser Bericht. INSTALLATION_IPAD.txt enthält die kurzen Bedienungsschritte.

## Technische Referenzen

- Firebase: https://firebase.google.com/docs/storage/web/download-files (angemeldeter Dateiabruf, CORS und Fehlerbehandlung)
- Firebase: https://firebase.google.com/docs/storage/security/core-syntax (Pfadregeln und Zugriffsprüfung)
