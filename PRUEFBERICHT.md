# Doggy Style Workspace – GB363 Reparatur-Testfassung

Stand: 18. Oktober 2026. **Vollständige Testfassung; keine abschließende Live-Freigabe.**

Diese vollständige Test-ZIP wurde nach erfolgreichen lokalen Tests erstellt. Die vollständigen Tests im bestehenden Firebase-Projekt stehen noch aus.

## Korrektur des GB362-Speicherfehlers

Das iPad-Bild vom 18. Oktober, 20:48 Uhr, zeigt bei der bestätigten Sonja/Bello-Zuordnung „The quota has been exceeded“. Zuvor war der Reparaturdialog auf dem echten Gerät erreichbar; dessen Schaltflächen hatten unzureichenden Kontrast. Aus diesem Bild allein lässt sich nicht sicher feststellen, ob die Zuordnung im echten Firebase bereits gespeichert wurde. Die Konsole wurde für diesen Folgeschritt nicht erneut authentifiziert geprüft.

Der gleiche Ablauf wurde mit GB362, simuliertem Firebase und einem erzwungenen Safari-typischen `QuotaExceededError` ausgeführt: Die Zuordnung war im simulierten Server bereits gespeichert; erst danach scheiterte `applyRemoteState` am lokalen `setItem`. GB362 meldete diesen nachgelagerten Fehler als Fehler der gesamten Bestätigung. Das ist eine bestätigte Fehlerursache im Code, keine Messung des freien iPad-Speichers.

GB363 speichert neue Workspace-Kopien, Ausgangsstände, Konfliktsicherungen und Kundenwarteschlangen in einer eigenen IndexedDB-Ablage, mit localStorage als Rückfall. Die Ablage greift nicht in Firebase-Auth-Speicher ein. Bestehende lokale Schlüssel werden nicht pauschal gelöscht. Vorhandene eigene Werte werden weiterhin gelesen; ein neuerer Legacy-Workspace bleibt erhalten. Beim Kontowechsel wird der geladene Arbeitsspeicher geleert. Gleichzeitige Schreibvorgänge unter demselben Schlüssel werden in Reihenfolge abgeschlossen.

Wenn beide lokalen Speicher scheitern, bleiben die aktuellen Daten im Arbeitsspeicher und ein eigener Hinweis bietet „Lokale Sicherung herunterladen“ an. Diese Sicherung enthält aktuelle eigene Workspace-/Ausgangs-/Warteschlangenwerte und eigene Vertragsentwürfe; sie ist von der Server-Bestandssicherung getrennt. Ein automatischer Import ist für beide Sicherungsformate nicht implementiert. Alte gemeinsame Browserdaten und andere Konten werden nicht pauschal exportiert oder entfernt. Ohne funktionierenden dauerhaften Speicher besteht keine Offline-Garantie; der Benutzer muss ungesicherte Änderungen vor dem Schließen exportieren.

Eine Kundeneinreichung wird erst nach dauerhafter lokaler Vorbereitung an Firebase gesendet. Nach bestätigtem Firebase-Erfolg wird ein lokaler Aktualisierungsfehler nicht als fehlgeschlagener Server-Schreibzugriff gemeldet. Die erledigte Reparaturvorschau wird entfernt; ein erneutes Bestätigen desselben alten Vorgangs ist gesperrt. Beim neuen Öffnen werden aktuelle Profile erneut gelesen. Der Reparaturdialog hat explizite helle Hintergrund-/dunkle Textfarben, kontrastreiche Schaltflächen und mindestens 44 Pixel Schaltflächenhöhe. Der Kontrast wurde rechnerisch über jsdom geprüft; eine erneute visuelle Safari-Prüfung auf dem Gerät steht aus.

14 gezielte Speicherprüfungen bestehen: eine erwartete GB362-Fehlerreproduktion und 13 Prüfungen der korrigierten Abläufe. Zusätzlich wurden die echte Kunden-Übermittlungsfunktion mit voller localStorage-Ablage, der neuen IndexedDB-Ablage und den Firestore-Emulatorregeln gemeinsam getestet: Bei verfügbarem Speicher entsteht das vollständige Paar; bei Ausfall beider Speicher entstehen keine Eingangs-Dokumente.

Hintergrund zur Browser-Speicherbehandlung: https://webkit.org/blog/14403/updates-to-storage-policy/ . Auch IndexedDB kann begrenzt, gesperrt oder vom Browser verworfen werden; die neue Ablage verspricht keine unbegrenzte Speicherung.

## Korrektur des GB361-Startfehlers

Das iPad-Bild des Benutzers vom 18. Oktober, 20:16 Uhr, zeigt GB361 für HTML, JavaScript und Cache sowie eine gefüllte Eingangsliste, aber weiterhin „Firebase wird geprüft“ und keinen Reparaturzugang. Die zentralen öffentlich bereitgestellten App-Dateien wurden zuvor mit der Testfassung verglichen und stimmten bytegenau überein. Dieses Bild ist kein Nachweis einer erfolgreichen Workspace-Synchronisation.

Der vollständige Anmeldestart von GB361 wurde anschließend mit einer simulierten Administrator-Anmeldung und dem vorhandenen HTML ausgeführt. Er bricht reproduzierbar mit `ReferenceError: btnLogout is not defined` ab. Die optionale Abmelden-Schaltfläche war bereits aus dem HTML entfernt, wurde im Startablauf aber noch als globale Variable verwendet. Dadurch werden der Workspace-Listener und der initiale Serverabruf nicht erreicht. Die bisherigen 30 DOM-Prüfungen übersprangen den Auth-Start; ihr früheres Bestehen erfasste diesen Fehler nicht. Das war ein Fehler in der ausgelieferten Testfassung.

GB362 bindet die optionalen Elemente ausdrücklich, fängt asynchrone Startfehler sichtbar ab und zeigt den Reparaturzugang direkt über der Eingangsliste. Benutzerverwaltung und Vorlagendownload blockieren den Serverabruf nicht mehr. Der Start veröffentlicht keine Migration und setzt vorhandene ungesendete Änderungen nicht zurück. Fehlende oder ungültige Serverdokumente erhalten keine erfolgreiche Bestätigung. Serverabrufe erhalten eine Zeitgrenze. Der verifizierte Projektinhaber wird gemäß dem bereits vorgesehenen Eigentümerzugang behandelt; vorhandene Profile und Rollen werden nicht geändert. Die frühere pauschale Cache-Löschung und automatische Weiterleitung beim Versionswechsel entfallen; die reguläre Bereinigung alter eigener App-Caches durch den Service-Worker bleibt bestehen. Der frühere RESET-Knopf heißt „Neu laden“ und löscht keine lokalen Datensätze oder Entwürfe. DIAG enthält Rolle, Startphase und konkrete Startfehler.

17 neue lokale Prüfungen führen den vollständigen Start und den Auth-Callback aus, einschließlich fehlender Schaltfläche, wartender Vorlagen/Benutzerverwaltung, lokaler Änderungen, fehlender Rechte, ungültigem Serverbestand, Rollen, Kontowechsel und Zeitüberschreitung. Netzwerk, Auth und Firestore sind dabei simuliert; diese Tests ersetzen keinen iPad- oder Firebase-Live-Durchlauf.

## Ergebnis und tatsächliche Grenzen

Die bekannten Ursachen der fehlerhaften Kundenzuordnung, Vertragsanzeige und Eingangsübermittlung sind im Code konsolidiert. Hinzugekommen sind eine auf dem iPad bedienbare Bestandsprüfung, eine Sicherung zum Herunterladen, eine konkrete Änderungsvorschau und einzeln bestätigte Reparaturabläufe. Die Vorschau schreibt nichts. Es erfolgt keine automatische Übernahme unklarer Altverträge oder Zuordnung allein anhand von Hundenamen.

**Bei der Bearbeitung wurden keine bestehenden Firebase-Daten, Konten, Rollen, Regeln, Fotos oder Unterschriften geändert.** Das bestehende Projekt und dessen öffentliche App-Konfiguration bleiben unverändert. Die Quell-ZIP wurde nicht ersetzt. GB361 und GB362 wurden vom Benutzer auf GitHub Pages bereitgestellt; die hier erstellte GB363-Fassung wurde von uns nicht veröffentlicht oder gegen das echte Projekt ausgeführt.

## Ausgangsstand

- Original: `DoggyStyle_Workspace_GB359_Vertragszugriff_Fix.zip`.
- Original-SHA-256: `d71fd33f60677d6aa7efd977c60caea1fde6080fc176ff2a0c4f53c1923b5036`.
- Bestehendes Projekt: `doggy-style-hundepension`.
- Organisation: `orgs/doggystyle`.
- Bucket: `doggy-style-hundepension.firebasestorage.app`.
- Fassung: `M50.9.9GB363_STORAGE_TEST_20261018`.
- Die maximale Gesamtkapazität von vier Hunden bleibt bestehen.

## Direkt im bestehenden Firebase gelesene Befunde

Die Anmeldung in der Firebase-Konsole war am 18. Oktober zeitweise erfolgreich. Regeln, Auth-Identitäten, ausgewählte Profile, Workspace und ein konkreter Eingang wurden lesend geprüft. Dies war ein administrativer Konsolenblick, kein Kundentest mit dem Firebase-SDK.

1. Die aktive Firestore-Regelversion war mit 10. Oktober 2026, 19:44 markiert. Eigentum wurde über UID oder E-Mail geprüft; Selbstanlage ließ zusätzliche Profilfelder zu; Einreichungen erzwangen weder gültige Kunden-/Hundeziele noch ein atomisches Gegenstück. Die aktiven Storage-Regeln erlaubten Fotoanlage ohne zugewiesene Hunde-ID, allein anhand eigener Upload-Metadaten. Die entscheidenden Bedingungen entsprechen den im Emulator geprüften Originalregeln; Storage war anders formatiert.
2. Authentication zeigte fünf vorhandene Konten. Die beiden unten genannten Profile hatten Rolle `customer`, aber keine festen Felder `customerId`, `petIds`, `portalData` oder `accessSchemaVersion`.
3. Im Workspace stand Sonja/Bello in den aktiven Listen. Max/Rex war in `customerRecords` bzw. `petRecords` und den gespeicherten Legacy-Verknüpfungen vorhanden, fehlte aber in `customers` bzw. `pets`. Zusätzliche Kopien standen teilweise außerhalb von `payload`.
4. Ein als angenommen gespeicherter Vertrag für Sonja/Bello enthielt unter `contractAdoptedRecords/0/signatureRec/dataUrl` ein bei direkter Bildansicht visuell leeres PNG; Herkunft `gb340-cloud-canonical`. Der Feld-Dialog wurde nach Lesen mit Abbrechen geschlossen. Geprüft wurde dieser eine Bildwert, nicht jede gespeicherte Kopie. Die ursprüngliche Ursache ist nicht nachgewiesen.
5. `proposals/c9ae9c422311919ebbff160c` war als `pending`/`submitted` gespeichert und verwies als `taskId` auf dieselbe ID. Der direkte Aufruf von `tasks/c9ae9c422311919ebbff160c` meldete „Dieses Dokument ist nicht vorhanden.“ Es wurde keine Aufgabe nachträglich angelegt oder übernommen.

| Vorhandener Testbestand | Auth-/Profil-UID | Kunden-ID | Hunde-ID |
| --- | --- | --- | --- |
| Sonja Sonnenschein / Bello, Konto sieglinde@boch-plan.de | `D9VE5w84GgTIRDfEtGg2dVa5mmk2` | `b62bec2a457e9819d6c896992` | `94da2ab9569b4819d6c896992` |
| Max Mustermann / Rex, Konto info@wild-westallgaeu-alpaka.de | `CxFlGgx7qCZFcFrK9zdc2jEnkrQ2` | `52901abad1c1919ce6c21818` | `052f916e2a40f819ce6c21819` |

Diese Tabelle dokumentiert den gelesenen Bestand. Die neue App enthält keine fest eingebauten Kunden-UIDs. Eine Zuordnung wird anhand der jeweils aktuell aus Firebase gelesenen Daten vorgeschlagen und muss vom Administrator geprüft werden.

## Änderungen in der Testfassung

**Kundentrennung:** Maßgeblich sind Firebase-UID und administrativ gespeicherte Zuordnung mit `accessSchemaVersion: 3`, Kunden-ID und Hunde-IDs. Fremde, doppelte oder widersprüchliche Ziele verhindern die Freigabe. Kunden laden ausschließlich ihren eigenen Portalbestand. Kontowechsel entfernt vorherige Ansichten, Medien und vorbereitete Reparaturen.

**Eingänge:** Vollständige neue Einreichungen werden als identisches Paar aus Vorschlag und Aufgabe atomar gespeichert. Bestätigte Übertragung und Freigabe sind getrennte Zustände. Wiederholtes Einreichen überschreibt keine Entscheidung. Die administrative Übernahme aktualisiert Workspace, Kundenportal und beide Eingangsstatus in einer Transaktion. Die Ablehnung ändert keine freigegebenen Stammdaten.

**Bestehende verwaiste Eingänge:** Im Reparaturbereich werden offene Einreichungen ohne Gegenstück angezeigt. Nach Sicherung und Vorschau kann ausschließlich das fehlende Gegenstück ergänzt werden. Der vorhandene Inhalt bleibt unverändert. Vorher werden aktueller Inhalt, Konto, Kundenzuordnung, Ziel-IDs und Status nochmals geprüft. Widersprüchliche Gegenstücke werden nicht überschrieben. Unbekannte alte Vertrags-/Aufenthaltsformate bleiben gesperrt.

**Verträge und Unterschriften:** Entwürfe sind nach Konto, Kunde, Hund und Vertragsfassung getrennt. Ein leeres Feld, eine bloße Zeigerbewegung, ein künstlicher Platzhalter oder ein abgeschnittenes PNG genügt nicht. Vor Einreichung und administrativer Vertragsfreigabe prüft die Oberfläche die tatsächlich dekodierten Bildpixel. Die Zeichnung erfolgt kontrastreich ohne eine als Unterschrift verwechselbare Hilfslinie. Unterschrift und Zustimmung werden erst nach Prüfung freigegeben; ein Versionswechsel verhindert die Übernahme einer alten Einreichung. Freigegebene frühere Fassungen bleiben im eigenen Portal erhalten. Die Bildprüfung bestätigt keine Identität, Willenserklärung oder rechtliche Gültigkeit. Firestore-Regeln können den PNG-Inhalt nicht selbst dekodieren; die administrative Sichtprüfung bleibt erforderlich.

**Fehlende Listen-Einträge und Profile:** Der Reparaturbereich liest aktuelle Datensatz-Tabellen und Profile aus Firebase. Er kann fehlende Kunden-/Hunde-Einträge aus vorhandenen Datensätzen unter bestehenden IDs ergänzen und eindeutige Kundenkonten verknüpfen. Bestehende aktive Einträge, Rollen, Konten, Unterschriften und Vertragszustimmungen werden dabei nicht automatisch ersetzt. Kundenzuordnung allein ist ohne zusätzliche Aufgabe möglich. Bei seit der Vorschau geändertem Konto oder Workspace wird abgebrochen.

**Sicherung und Zustimmung:** Vor jeder Reparatur muss der Administrator den gelesenen Workspace-/Profil-/Eingangsstand herunterladen, selbst in Dateien speichern und die konkrete Vorschau bestätigen. Die App meldet nur den gestarteten Download; sie kann die Speicherung in Apples Dateien-App nicht nachweisen. Die JSON-Sicherung enthält Workspace, Profile, Aufgaben und Vorschläge, keine Firebase-Auth-Konten und keine Storage-Dateien. Ein automatisches Zurückspielen einer Sicherung ist nicht implementiert.

**Synchronisation:** Alte zusätzliche Serverkopien werden nicht mehr automatisch in den Payload gemischt. Beim fehlgeschlagenen initialen Serverlesen wird kein lokaler Ersatzstand veröffentlicht. Ungesendete Änderungen bleiben auch bei gleicher Serverrevision erhalten. Während einer Speicherung erfasste neue Änderungen bleiben ausstehend. Eine späte Antwort nach Kontowechsel verändert das neue Konto nicht. Konflikte werden mit gespeicherter Ausgangsfassung verglichen; bei fehlender Ausgangsfassung bleibt automatisches Zusammenführen gesperrt. Lokale Sicherung erfolgt vor Anwendung des gewählten Stands. Gelöschte Map-Einträge werden nicht durch rekursives Schreiben wiederhergestellt; unabhängige Dokumentfelder bleiben erhalten. Die Größenprüfung berücksichtigt auch erhaltene Felder außerhalb des Payloads.

**Medien und Start:** Fotoverweise verwenden den eigenen Storage-Pfad und einen authentifizierten Abruf. Fotos werden nicht aus Einreichungen entfernt; Fotoentfernung bleibt eine Änderung. Neue Hunde verwenden verkleinerte Bilder im Vorschlag. Die frühere Klartext-Passwortübergabe wurde entfernt. Die neuen Dateien sind im Service-Worker berücksichtigt. Alte widersprüchliche Setup-/Sicherheitsnotizen wurden durch die aktuelle Anleitung ersetzt.

## Tatsächlich ausgeführte Prüfungen

| Prüfgruppe | Letzter erfolgreicher Lauf | Ergebnis | Grenze |
| --- | --- | --- | --- |
| Vier ursprüngliche Schwachstellen mit Originalregeln reproduziert | 2026-10-18T18:57:00.817Z | 4/4 bestätigt | Erwartete Fehlerreproduktion im Emulator; kein ausgeführter Angriff auf das echte Projekt. |
| Reparaturregeln und Workflow | 2026-10-18T18:57:00.817Z | 62/62 bestanden | Echte Firestore-/Storage-Emulatorzugriffe, Transaktionen, Listener und Regelentscheidungen mit synthetischen Daten; Auth-Identitäten in der Regeltestumgebung simuliert. |
| Oberfläche, Syntax, lokale Ressourcen, Regel-Kopierseite und Reparaturdialog | 2026-10-18T18:58:56.969Z | 30/30 bestanden | jsdom; Canvas-/Bilddekodierung, Downloads, Netzwerk und Firebase-Anbindung teilweise simuliert. Kein Safari-/iPad-Durchlauf. |
| Vollständiger Anmeldestart und Fehlerfälle | 2026-10-18T18:56:01.539Z | 18/18 bestanden | startApp und Auth-Callback laufen in jsdom; Firebase, Netzwerk und Canvas simuliert. Keine echten Konten verwendet. |
| Speicherfehler und Dialoglesbarkeit | 2026-10-18T18:58:57.814Z | 14/14 bestanden | Eine GB362-Fehlerreproduktion und 13 Reparaturprüfungen; jsdom und fake-indexeddb mit simulierten Quotenfehlern. |
| Vollständige Abläufe mit vorhandenen Testkonten im bestehenden Firebase | Nicht abgeschlossen | Offen | Kein bestätigter Kunden-SDK-Durchlauf der Testfassung. |

Die UTC-Zeitstempel stammen aus den gespeicherten Testergebnissen. Die Browser-App verwendet Firebase Compat 10.12.5, die Emulator-API-Prüfungen Firebase 13.0.0. Das ersetzt keine Prüfung der ausgelieferten SDK-Version auf dem iPad. Echte PNG-Dateien werden als synthetische Testzeichnungen erzeugt; es wurden keine echten Unterschriften als Testdaten kopiert.

Die Tests umfassen fremde/verschachtelte Ziel-IDs, gefälschte UID, unvollständige Einreichungen, verbotene Selbstzuordnung, Administrator-/Mitarbeitergrenzen, Annahme und Ablehnung, unveränderte Signaturübernahme, neue Hunde, Aufenthalte, parallele Freigaben, veraltete Serverstände, echte Listener-Rückmeldung, eigene/fremde Storage-Pfade, Kontakt-E-Mail-Änderungen, frühere Vertragsfassungen, unvollständige Bestandsdaten, unveränderte Vorschau, Wiederherstellung bestehender IDs, Zuordnung ohne zusätzliche Aufgabe, Reparatur eines verwaisten Eingangs, Sicherungs-/Prüfbestätigung, Größenfehler und Kontowechsel während einer Speicherung.

## Offene Fehler und Freigabesperren

| Priorität | Offener Punkt | Erforderlicher Abschluss |
| --- | --- | --- |
| P0 | Die reparierten Regeln sind im echten Projekt noch nicht veröffentlicht; bestehende Profile/Listen sind noch nicht repariert. | Vorherige Regeln und Bestand sichern, neue Regeln prüfen/veröffentlichen, angebotene Ergänzungen und exakte Kundenzuordnungen einzeln bestätigen. |
| P0 | Alte unklare Vertragsfreigaben und das visuell leere Signaturbild bestehen im echten Bestand fort. | Jedes betroffene Dokument prüfen; keine automatische Nachbestätigung oder Löschung. |
| P0 | Öffentliche Storage-Downloadtokens können bestehende Links weiterhin gültig halten. | Dateien/Links inventarisieren und konkrete Tokenänderungen nach Zustimmung durchführen. Die Testfassung widerruft sie nicht. |
| P1 | Allgemeine Cloud-Speicherung und Vertragsfreigabe sind administrativ. Frühere Mitarbeiter-Schreibabläufe sind nicht vollständig wiederhergestellt. | Sichere Mitarbeiter-Schreibabläufe mit Portal-Synchronisation abschließen und live prüfen. Vorhandene Rollen wurden nicht erweitert. |
| P1 | Auth-Anmeldung, Firestore-/Storage-Regelzusammenspiel, CORS, Dienstberechtigungen und App Check sind nicht mit dieser Testfassung im echten Projekt geprüft. | Zwei echte getrennte Kundenkonten und den Administrator verwenden, einschließlich direkter fremder Pfade und Medienabruf. |
| P1 | Echte iPad-/Safari-Zeichnung, Fotoverkleinerung, PDF/Druck, Aktualisierung des Service-Workers und Netzunterbrechung sind offen. | Reale Gerätetests mit Neuladen und Kontowechsel durchführen. |
| P1 | Konfliktabgleich wurde lokal, aber nicht mit zwei echten Firebase-Sitzungen geprüft. | Parallele Änderungen und erneute Serveränderung mit realen Sitzungen testen. |
| P1 | Workspace bleibt ein zentrales Firestore-Dokument mit sicherer Schreibgrenze von 900.000 Bytes. | Tatsächliche Größe prüfen; große Bestände benötigen eine andere Datenaufteilung. Fehler brechen ohne Teilübernahme ab. |
| P1 | Alte gemeinsame Browserdaten wurden nicht pauschal gelöscht. | Ungesicherte lokale Änderungen vor einer Bereinigung sichern und prüfen. |

## Zugangshürde und nächster Testweg

Die Google-Konsolenanmeldung war zeitweise erfolgreich. Für die anschließend ausdrücklich erlaubte Firebase-CLI konnte die erneute Geräte-/Passkey-Bestätigung in diesem Browser nicht abgeschlossen werden. Der Benutzer erhielt Geräteanfragen nicht; zuletzt bot Google nur den Passkey an. Es gibt keinen bestätigten CLI-Zugang und keine nachgewiesene Bot-Sperrmeldung. Keine Sicherheitsvorkehrung wurde umgangen oder abgeschaltet. Das abgelehnte Firebase-Plugin wird nicht vorausgesetzt; es werden keine Kennwörter oder Autorisierungscodes im Chat verlangt.

Weil nur iPad und iPhone verfügbar sind, ist der Reparaturbereich für die Ausführung durch den angemeldeten Administrator im Workspace vorgesehen. Die App-Dateien und Regeltexte müssen zunächst auf dem bisherigen Webserver bzw. im bestehenden Firebase-Projekt aktiviert werden. Die Anleitung liegt als `INSTALLATION_IPAD.txt` im Paket. Erst nach den noch offenen Live-Prüfungen kann eine endgültige Freigabe erfolgen.
