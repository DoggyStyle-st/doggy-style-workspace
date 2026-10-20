# Doggy Style Workspace - GB371 Druck-Testfassung

Stand: 20. Oktober 2026. Vollständige aktualisierte Testfassung. Keine pauschale Zusage einer vollständig geprüften produktiven Freigabe.

## Aktueller Befund

Der Benutzer bestätigt inzwischen die Fotoanzeige im Kundenbereich auf dem echten iPad (GB370) und die zuvor erklärte Neukundenregistrierung mit anschließender administrativer Zuordnung. Zuvor zeigte der Bucket-Screenshot CORS als Nicht aktiviert. Der Benutzer hat diese Einstellung selbst angepasst. Diese Angaben sind Benutzerbeobachtungen im bestehenden Projekt; die Entwicklung hat weder einen neuen authentifizierten Live-Durchlauf durchgeführt noch produktive CORS-Einstellungen verändert.

Neu gemeldet wurden ein zweiter, nicht mehr benötigter Hygiene-Erfassungsbereich unter Arbeitsblätter und ein fehlerhafter Tages-Sammeldruck mit verdeckten Bedienelementen und fehlender Druck-/Speichermöglichkeit.

## Behobene Ursachen und Verhalten

**Doppelter Hygiene-Bereich:** Die Erfassungskarte Hygiene-Nachweis entfällt unter Arbeitsblätter. Die übrigen vier Karten besitzen korrekt geschlossene Schaltflächen. Der eigenständige Bereich Hygiene bleibt erhalten. Frühere Arbeitsblatt-Hygienenachweise bleiben unverändert im Archiv lesbar und über ihre bisherige Dokumentansicht druckbar. Es werden keine alten Nachweise gelöscht, migriert oder nachträglich abgeschlossen.

**Verdeckte Dokumentvorschau:** Im unveränderten GB370 ließ sich reproduzieren, dass die Druckschaltfläche unter der App-Kopfzeile liegt. Die Vorschau befand sich innerhalb des Inhaltsbereichs mit eigenem Stapelkontext; ein höherer z-index allein innerhalb dieses Bereichs genügte nicht. Der neue Dokumentdialog liegt direkt unter body und verwendet auf unterstützten Browsern die native Dialogebene. Die Kopfzeile kann ihn dort nicht überlagern. Die Toolbar ist bei iPad quer/hoch und iPhone-Bildgrößen erreichbar; die Vorschau erhält die verbleibende Höhe. Schließen stellt Scrollzustand und Fokus wieder her. Vor einem Dokumentwechsel wird altes srcdoc entfernt; frühere HTML-Dokumente werden dadurch nicht vom zuletzt geöffneten Inhalt verdeckt.

**Falsche Aufenthaltsquelle:** GB370 las ausschließlich alte state.stays-Einträge mit fromDate/toDate und druckte bei aktuellen bestätigten state.docs-Aufenthalten Keine Aufenthalte gefunden. Dieser Fehler ist getrennt im unveränderten GB370 reproduziert. GB371 verwendet dieselbe bestätigte Aufenthalts- und Belegungsberechnung wie die Startseite. Abreisetage zählen mit; offene und stornierte Anfragen zählen nicht. Spiegel-Datensätze werden durch die bestehende gemeinsame Berechnung behandelt. Die Druckfunktion schreibt keine neue Belegung und verändert keinen Aufenthalt.

**Vollständiger Tages-Sammeldruck:** Enthalten sind Tagesübersicht, Belegungszahlen, Anreisen und Abreisen mit angegebenen Uhrzeiten, je ein Hundeblatt mit Kontakt-, Notfall-, Futter-, Gesundheits-, Tierarzt- und Betreuungshinweisen sowie die archivierten Schichtblätter des Tages. Fehlt ein archiviertes Schichtblatt, erscheinen beschriftete Notizfelder mit entsprechendem Hinweis. Aktuelle Medikationspläne werden nicht als vermeintlich vollständiger Bestandteil dupliziert; das Hundeblatt verweist ausdrücklich auf den Bereich Medikamente. Handschriftliche Ergänzungen auf Papier werden nicht automatisch gespeichert.

**Tatsächliche PDF-Datei:** PDF speichern lädt echte application/pdf-Bytes mit dem Datum im Dateinamen herunter. PDF öffnen bietet dieselbe Datei separat an. PDF teilen übergibt auf unterstützten Geräten eine File-Datei und nicht nur einen Titel. Die Datei entsteht lokal mit der mitgelieferten Browserfassung jsPDF 4.2.1 und einer mitgelieferten DejaVu-Schrift; kein zusätzlicher externer PDF-Dienst erhält Kundendaten. Lange Texte werden mit wiederholten Tabellenköpfen über weitere A4-Seiten verteilt. Umlaut- und Langtext-Endmarkierungen sind in der erzeugten PDF nachgewiesen. Ein leerer Tag erzeugt ebenfalls ein gültiges Dokument.

**Drucken und Kontowechsel:** Drucken wird erst nach Laden des Vorschau-Dokuments und seiner Bilder freigegeben und ruft den Dokumentrahmen auf. Ein Kontoreset schließt den Dialog und widerruft seine temporären Datei-Adressen. Der Serverzugriff auf den gemeinsamen Workspace bleibt für Kunden gesperrt. Die neue Druckfunktion erweitert keine Firestore- oder Storage-Berechtigung.

**Foto-Vorschau:** Enthalten ist zusätzlich der bereits vorbereitete Schutz der lokalen Uploadvorschau. Ein erfolgreich hochgeladenes, aufbereitetes Bild bleibt pro UID im privaten Vorschaucache, statt bei einem anschließenden Abrufproblem sofort aus der Kundenansicht zu verschwinden. Der tatsächlich auf das Gerät geladene Blob wird verwendet. Es entsteht kein öffentlicher Downloadlink und keine pauschale Leseberechtigung. Kontoreset widerruft die Vorschau. Der reale erfolgreiche Fotoabruf wurde vom Benutzer noch mit GB370 bestätigt; der zusätzliche Schutz selbst wurde in isolierten Emulatoren geprüft.

## Nachweise

301 Prüfungen bestehen in den unten aufgeführten Gruppen. Erwartete Reproduktionen früherer Fehler sind in den ursprünglichen Gruppen entsprechend gekennzeichnet; sie sind keine bestandenen Live-Tests. Die zwei neuen GB370-Druckfehler stehen zusätzlich getrennt in gb370-print-reproduction.json und werden nicht als bestandene Reparaturprüfungen gezählt.

| Gruppe | Bestandene Prüfungen | Ausgeführt (UTC) |
| --- | ---: | --- |
| firebase | 66 | 2026-10-20T19:13:16.133Z |
| ui | 30 | 2026-10-20T19:09:42.943Z |
| startup | 18 | 2026-10-20T19:10:03.851Z |
| quota | 14 | 2026-10-20T19:10:13.036Z |
| backup-forward | 12 | 2026-10-20T19:13:53.454Z |
| inbox-review | 7 | 2026-10-20T19:10:19.334Z |
| portal-features | 21 | 2026-10-20T19:14:27.469Z |
| stay-review | 23 | 2026-10-20T19:15:15.459Z |
| inbox-chat | 30 | 2026-10-20T19:15:57.096Z |
| photo | 26 | 2026-10-20T19:16:52.873Z |
| media | 19 | 2026-10-20T19:10:24.407Z |
| photo-preview | 6 | 2026-10-20T19:17:23.936Z |
| workforms-print | 24 | 2026-10-20T19:11:20.919Z |
| pdf-output | 5 | 2026-10-20T19:15:19.757789+00:00 |

Die Druckgruppe verwendet den echten Firestore-Emulator mit den vorhandenen Testkunden als Ausgangspunkt. Zusätzliche Aufenthalte und Druckfälle entstehen ausschließlich in einer isolierten demo-Projektkopie. Die hochgeladene Sicherung wird nicht verändert. Die Dokumentansicht und ihr tatsächlicher Download laufen in Chromium 155 mit iPad-Querformat, iPad-Hochformat und iPhone-Bildgröße. Der Dateidownload wird als PDF eingelesen. Der Teilentest prüft den Aufruf mit tatsächlichen Dateibytes über einen simulierten OS-Endpunkt; der Drucktest prüft den Aufruf des richtigen Dokumentfensters. Zusätzlich erzeugt der Browser eine eigene mehrseitige PDF aus dem HTML-Drucklayout.

Vier erzeugte Dokumente mit insgesamt 15 Seiten wurden gerendert und visuell geprüft. Ergänzende PyMuPDF-Prüfungen bestätigen vollständigen Text, Umlaute, das Ende langer Notizen, A4-Seiten und Textbegrenzungen innerhalb der Seitenränder. Die internen Beispiel-PDFs und Bildschirmbilder werden wegen der Testkundendaten nicht in die App-ZIP aufgenommen.

Die bisherigen Firestore-/Storage-Prüfungen, Rollen- und Kundengrenzen, Vertrags-/Signaturabläufe, atomare Eingänge und Entscheidungen, Chat, Archiv, Aufenthalte, Kapazität, Konflikte, Start, lokaler Speichermangel sowie Fotoabläufe wurden mit dem aktuellen Quellstand erneut ausgeführt. Die Gesamtprüfung zeichnet die geprüften Quell-Hashes auf. Firebase-Konfiguration und beide Regeldateien sind bytegleich mit GB370; keine neuen Regeln veröffentlichen.

## Verbleibende Prüfgrenzen

- Native Safari-/iOS-Druck- und Teilen-Dialoge, In Dateien sichern, ein physischer Drucker und echtes Hintergrund-/PWA-Verhalten wurden nicht durch die Entwicklungsumgebung bedient. Nach dem Update diese Schritte einmal auf dem vorhandenen iPad/iPhone durchführen.
- Die vollständige angemeldete Live-Prüfung mit zwei getrennten Kundenkonten, direkten fremden Firebase-/Storage-Pfaden, parallelen Sitzungen und Netzunterbrechung steht weiterhin aus. Benutzerbestätigte Einzelfunktionen ersetzen diese negative Zugriffsprüfung nicht.
- Der Workspace bleibt ein zentrales Firestore-Dokument mit der bisherigen sicheren JSON-Schreibgrenze. Diese Reparatur ändert das Datenmodell und seine Größenbegrenzung nicht.
- Alte unvollständige Anfragen und historische Unterschriften werden weder erfunden noch automatisch repariert. Für den normalen weiteren Betrieb sind keine alten Anfragen zu beantworten. Archivierung bleibt optional.

Es gibt in den aufgeführten aktuellen Prüfungen keinen verbleibenden fehlgeschlagenen Test. Das ist keine Behauptung, alle denkbaren Geräte- und Livefehler ausgeschlossen zu haben.

## Installation und Rückweg

Die vollständigen Dateien aus DoggyStyle_Workspace_GB371_TEST am bisherigen GitHub-Pages-Ort einspielen, einschließlich assets und vendor. Danach neu laden und GB371_PRINT_TEST_20261020 in Login und DIAG prüfen. Keine Daten zurücksetzen und keine Kundenzuordnung wiederholen. INSTALLATION_IPAD.txt enthält die Bedienung von PDF speichern, PDF öffnen, PDF teilen und Drucken. Vorherige App-Dateien bleiben der Rückweg. Entwicklung und Test verändern keine bestehenden Daten im produktiven Firebase-Projekt.

## Quellen und Historie

- Native Dialogebene: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog
- Dateien teilen: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share
- PDF-Bibliothek, geprüfte Veröffentlichung: https://github.com/parallax/jsPDF/releases/tag/v4.2.1
- PDF-API: https://parallax.github.io/jsPDF/docs/jsPDF.html
- Direkter Firebase-Dateiabruf und CORS: https://firebase.google.com/docs/storage/web/download-files
- Bucket-CORS: https://docs.cloud.google.com/storage/docs/using-cors

Der unveränderte historische GB370-Bericht liegt unter pruefungen/historischer-pruefbericht-gb370.md. Dortige offene Foto-/CORS-Befunde beschreiben den damaligen Prüfstand; für den aktuellen Stand gilt dieser Bericht. Er dient der Nachvollziehbarkeit früherer Reparaturen und ihrer damaligen Testgrenzen.
