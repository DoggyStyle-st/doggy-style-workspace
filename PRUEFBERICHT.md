# Doggy Style Workspace – GB383

Stand 15. November 2026 · Build M50.9.9GB383_ANALYTICS_20261115

- Die Testrechnungen für Februar ergeben drei Zahlungseingänge mit 269,00 € brutto, 26,98 € MwSt. und 242,02 € netto. Darin enthalten sind eine Januarrechnung mit Zahlung im Februar und ein Beleg mit 0 % MwSt. Der offene Beleg und der Storno stehen in eigenen Spalten.
- Datumsgrenzen für Europa/Berlin, Jahreswechsel, Schalttag, freie Auswahl und fehlende Angaben wurden geprüft. Rechnungen ohne erfasstes Zahlungsdatum können in der Belegliste geprüft werden. Abgeschlossene Belege werden anhand der gespeicherten Beträge und Positionen ausgewertet.
- Die Belegungswerte wurden gegen die Kalenderberechnung geprüft. Der Fall deckt verschobene und stornierte Aufenthalte, An- und Abreisetage, Doppelbelegung eines Hundes und ein Tageslimit je Betreuungsart ab.
- Der vollständige Workspace wurde bei 1024 × 768 und 390 × 844 Pixeln mit Testdaten geöffnet. Geprüft wurden die Filter, das Öffnen einer Rechnung und eines Kalendertages, die Aktualisierung nach dem Speichern sowie der CSV-Download unmittelbar nach einer Datumsänderung.
- Bestehende Prüffälle für Aufenthalte, Zuschläge, Kundennummern und Rechnungen wurden erneut ausgeführt. Die Abnahme mit echten Kontodaten und Safari auf den eingesetzten Geräten steht aus.

## Prüfung des vorigen Stands GB382

# Doggy Style Workspace – GB382

Stand 15. November 2026 · Build M50.9.9GB382_CALENDAR_20261115

- Die Kalenderansicht im vollständigen Workspace wurde in Chromium in zwei Bildschirmgrößen geprüft. Ein neuer Termin blieb über zwei getrennte Sitzungen synchron. Beim Verschieben wechselte er den Monat. Die Absage entfernte seine Markierung. Die vier belegten Hundeplätze blieben währenddessen gleich.
- Der Firebase-Auth- und Firestore-Emulator bestätigte den Zugriff für das Workspace-Team und die Ablehnung für Kundenkonten. Zwei gleichzeitige Änderungen am selben Termin wurden geprüft. Eine alte Version konnte die neuere Änderung nicht überschreiben.
- Der lokale SMTP-Test prüfte zwei Empfänger, Einladungen, Aktualisierungen und Absagen. Die Kalenderdateien ließen sich parsen und behielten dieselbe Termin-ID mit aufsteigender Versionsnummer. Ein fehlgeschlagener Versand ließ sich gezielt erneut anstoßen.
- Die Prüfung der Erinnerungen deckte Geräteanmeldung, Wiederholungsversuche bei vorübergehenden Fehlern, Abschalten auf einem Gerät, Terminänderungen und Zeitumstellung ab. Im Test reagierte der Service Worker ohne geöffnete App auf die Mitteilung und öffnete ihren Kalendertag.
- Bestehende Prüfungen für Kundenanfrage und Freigabe, Rechnungsbeträge und Zuschläge, Kundennummern sowie freie Rechnungen und PDFs liefen erfolgreich.

Für die Inbetriebnahme sind die Cloud-Funktionen, Firestore-Regeln und der Mailanbieter einzurichten. Die Geräteabnahme mit echten Push-Mitteilungen und der Annahme in Apple Kalender steht aus.

## Prüfung des vorigen Stands GB381

# Doggy Style Workspace – GB381

Stand 15. November 2026 · Build M50.9.9GB381_CUSTOMER_BILLING_20261115

- Freie Rechnung mit manuell eingegebenem Namen und Anschrift bei leerem Kundenstamm geprüft. Die Eingabe wurde in der Rechnungsansicht und im gerenderten PDF übernommen. Ein leeres Namensfeld wurde erkannt.
- Bestehenden Kunden mit zugehörigem Hund für eine freie Rechnung ausgewählt. Die Rechnungssuche findet die Kundennummer und den manuell erfassten Namen.
- Feste Kundennummern bei Übernahme des Bestands, bei Neuanlage, bei Adressänderungen und bei zwei konkurrierenden Speicherungen mit simuliertem Firebase geprüft. Das simulierte Profil im Kundenportal erhielt die Kundennummer des zugeordneten Kunden.
- Beim Wechsel vom Entwurf auf Offen wurden die Empfängerdaten im Beleg gespeichert. Nach einer Änderung der Stammdaten wurde die Rechnung weiterhin mit der bei Ausstellung gespeicherten Anschrift und Kundennummer gedruckt.
- Die Prüfungen zur Abrechnung und zu optionalen Spaziergängen liefen erneut. Safari auf iPad und iPhone sowie das verbundene Firebase stehen für die Abnahme aus.

## Prüfung des vorigen Stands GB380

# Doggy Style Workspace – GB380

Stand 15. November 2026 · Build M50.9.9GB380_INVOICE_OUTPUT_20261115

- Die Fälle mit getrennten Adressfeldern, älterem Adressobjekt, ein- und mehrzeiligem Adresstext sowie fehlenden Adressbestandteilen wurden mit Testdaten geprüft.
- Die Rechnungsansicht und die Druckansicht zeigen die Anschrift des zugeordneten Kunden. Geprüft wurden freie Rechnungen, die Verknüpfung über einen Aufenthalt und die Zuordnung bei älteren Hundedatensätzen.
- Die App hat Testrechnungen als A4-PDF erzeugt. Die gerenderten Seiten wurden auf Adressblock, Zeilenumbrüche, vollständige Beträge, Zahlungsdaten und den Abstand zur Seitennummer geprüft.
- Die Abrechnung und die Anfragefälle aus GB379 wurden erneut mit Testdaten geprüft. Dazu gehören der Beispielzeitraum und die freiwillig buchbaren Spaziergänge.
- Die Abnahme in Safari auf iPad und iPhone sowie mit dem verbundenen Firebase steht aus.

## Prüfung des vorigen Stands GB379

# Doggy Style Workspace – GB379

Stand 15. November 2026 · Build M50.9.9GB379_STAY_BILLING_20261115

## Beispiel vom 26.10. bis 08.11.2026

| Position | Brutto |
| --- | ---: |
| Urlaubsbetreuung, 14 Tage × 40,00 € laut Standardstaffel | 560,00 € |
| Feiertagszuschlag für Allerheiligen am 01.11.2026 | 4,00 € |
| Sonntagszuschlag für den 08.11.2026 | 4,00 € |
| Gesamt ohne Zusatz-Spaziergänge | **568,00 €** |

Allerheiligen fällt in diesem Zeitraum auf einen Sonntag. Der 01.11.2026 erhält einen einzigen Zuschlag und erscheint unter dem Feiertagszuschlag. Die Berechnung nutzt die [gesetzlichen Feiertage in Bayern](https://www.gesetze-bayern.de/Content/Document/BayFTG-1) einschließlich [Mariä Himmelfahrt in Stiefenhofen](https://www.statistik.bayern.de/statistik/gebiet_bevoelkerung/zensus/himmelfahrt/index.php?Suchfeld=gemeindename&feiertag=ja&sort=gemeindename).

## Prüfungen zu GB379

- 13 Gruppen zur Abrechnung in den Zeitzonen Europe/Berlin und America/Los_Angeles geprüft. Enthalten sind der Beispielzeitraum, An- und Abreise am selben Tag, Staffelgrenzen, Jahreswechsel, Sommerzeit, Schaltjahr, bayerische Feiertage, von den Standardpreisen abweichende Einstellungen und Cent-Rundung.
- Der vorhandene automatische Entwurf erhielt die korrigierten Beträge unter derselben Rechnungsnummer. Manuelle, offene und abgeschlossene Rechnungen wurden beim Öffnen anhand ihrer gespeicherten Beträge geprüft. Die geprüfte Druckansicht enthält dieselben Positionen wie die Rechnung.
- Mit simuliertem Formular und isoliertem Firebase-Datenstand geprüft, dass die Auswahl im Kundenportal bei der Einreichung, bei der Übernahme und bei der Rechnung ankommt. Geprüft wurden zwei gewählte Spaziergänge, keine Auswahl und Abwählen vor dem Senden. Auch die Änderung der Menge im unterschriebenen Aufenthalt und ihre Übernahme in die bestehende Rechnung wurde geprüft.
- Die Abnahme in Safari auf iPad und iPhone sowie im verbundenen Firebase steht aus. Diese Bearbeitung lief mit Testdaten.

## Prüfung des vorigen Stands GB378

# Doggy Style Workspace – GB378 Einstellungen, Aufenthalt und Rechnung

Stand: 24. Oktober 2026. Build M50.9.9GB378_STAY_BILLING_TEST_20261024.

Die Bereiche verwenden dieselben hinterlegten Preise. Zuschläge lassen sich jetzt auch an einem unterschriebenen Aufenthalt anklicken und mehrfach speichern. Die zugeordnete offene, automatisch berechnete Rechnung wird unter derselben Kennung und Nummer aktualisiert. Eine Zuschlagskorrektur erzeugt keine neue Aufenthaltsversion oder zusätzliche Rechnung. Alle 374 aktuellen Prüfungen bestehen. Die angemeldete Live-Abnahme und native Safari-/iOS-Prüfung stehen noch aus. Produktive Daten und Firebase-Regeln wurden nicht verändert.

## Ursachen und Korrekturen

Die vorige GB377-Reparatur hat das Zusammenspiel eines bereits unterschriebenen Aufenthalts, seiner Dokumentversionen und der Preis-Einstellungen nicht vollständig abgedeckt. In der unveränderten ausgelieferten GB377-Fassung wurden mit dem tatsächlichen App-HTML und isoliertem Firestore vier Fehler reproduziert: gesperrte Zuschlagsfelder, eine zweite Rechnung nach einer Dokumentversion, fest eingetragene statt eingestellter Zuschlagspreise in der Beschriftung und der große überlagernde Editor-Header.

- Die allgemeine Dokumentsperre deaktivierte auch finanzielle Felder. Zuschläge sind jetzt getrennt bearbeitbar. Bei unterschriebenen Aufenthalten werden sie in billingOverrides und mit Änderungsnachweis in billingAudit gespeichert. Die ursprünglichen Kundenangaben, Einwilligungen und vorhandenen Unterschriften bleiben bestehen. Der ursprüngliche Preisstand bleibt als billingOriginal nachvollziehbar.
- Die Rechnungszuordnung prüfte nur die genaue Dokument-ID. Eine neue Dokumentversion wurde deshalb wie ein neuer Rechnungsanlass behandelt. Die Zuordnung folgt jetzt der kontrollierten Versionskette desselben Kunden und Hundes. Eine explizit zugeordnete vorhandene Rechnung hat Vorrang. Es wird nicht nach Namen oder gleichen Zeiträumen geraten.
- Beim Kopieren blieben alte Rechnungsreferenzen und Unterschriftskopien in Zusatzfeldern stehen. Neuer Aufenthalt entfernt diese Verknüpfungen und startet unabhängig. Eine bewusste neue Dokumentversion erhält ebenfalls keine alte Unterschrift, gehört aber weiterhin zum selben Aufenthalt und seiner Rechnung.
- Die Knöpfe im Preisformular verwiesen auf Funktionen, die nur innerhalb einer anderen Funktion erreichbar waren. Speichern, Standardwerte und neue Preisregel sind jetzt über die tatsächlichen Knöpfe erreichbar und auf Administratoren beschränkt.
- Zuschlagsbeschriftungen kommen aus den Einstellungen. Probetag verwendet weiterhin den Preis eines einzelnen Urlaubstags. Ein übergroßer fester Editor-Header verdeckt die gescrollten Felder nicht mehr. Ein fehlendes schließendes Rechnungs-Button-Element im HTML ist ergänzt.
- Die Rechnung öffnet die zugeordnete aktuelle Aufenthaltsversion. Wiederholtes Speichern nach einer Firebase-Bestätigung bleibt mit dem aktuellen Datensatz verbunden.

## Bedienung

1. Einstellungen > Preise öffnen, Werte prüfen und dort Speichern wählen.
2. Aufenthalt öffnen, Zuschläge und Mengen ändern und Zuschläge speichern wählen. Rechnung öffnen zeigt die bestehende Rechnung. Der Test aus den Bildschirmbildern ergibt 60,00 → 62,50 → 67,50 Euro unter derselben Nummer 2026-0003.
3. Aufenthaltsangaben bearbeiten ist für eine bewusste neue Dokumentversion vorgesehen. Sie benötigt ihre eigene Unterschrift und bleibt mit derselben Betreuung/Rechnung verbunden. Die alte unterschriebene Version bleibt erhalten.
4. Neuer Aufenthalt legt eine unabhängige Betreuung an. Zeitraum neu eintragen. Die alte Unterschrift und Rechnungszuordnung werden nicht übernommen.
5. Rechnung > Bearbeiten erlaubt weiterhin manuelle Positionen. Diese werden bei gewöhnlichen Zuschlagsänderungen nicht überschrieben. Aufschläge aus Aufenthalt übernehmen ersetzt sie nur nach ausdrücklicher Bestätigung.

Bezahlte und stornierte Rechnungen bleiben unverändert und gegen Neuberechnung geschützt. Vorhandene Doppelrechnungen werden nicht gelöscht, zusammengelegt oder automatisch storniert. Fehlt eine eindeutige Zuordnung, zeigt Rechnung öffnen die vorhandenen Nummern zur Auswahl. Das Abbrechen schreibt nichts.

## Aktuelle erfolgreiche Prüfungen

| Gruppe | Bestanden | Testzeit UTC |
| --- | ---: | --- |
| stay-billing | 29 | 2026-10-24T11:13:44.105Z |
| invoice | 43 | 2026-10-24T11:14:11.254Z |
| sds | 24 | 2026-10-24T11:14:32.554Z |
| media | 19 | 2026-10-24T11:14:35.196Z |
| sync-review | 16 | 2026-10-24T11:15:15.669Z |
| sync-content | 10 | 2026-10-24T11:15:18.879Z |
| management | 36 | 2026-10-24T11:15:44.595Z |
| statistics | 40 | 2026-10-24T11:15:59.680Z |
| ui | 30 | 2026-10-24T11:16:02.343Z |
| startup | 18 | 2026-10-24T11:16:10.312Z |
| quota | 14 | 2026-10-24T11:16:12.753Z |
| firebase | 66 | 2026-10-24T11:16:26.618Z |
| portal-features | 21 | 2026-10-24T11:16:39.642Z |
| script-load | 8 | 2026-10-24T11:16:42.856Z |

Gesamt: 374 Prüfungen in 14 Gruppen, ohne fehlgeschlagene aktuelle Prüfung.

Die 29 neuen Ablaufprüfungen verwenden das vollständige App-HTML, das exakte Firebase-Browser-SDK 10.12.5, Chromium 155 und einen tatsächlichen isolierten Firestore-Emulator. Geprüft sind:

- Aktive Zuschlagsfelder im unterschriebenen Aufenthalt bei weiterhin geschützten Kundenangaben und Einwilligungen; bytegleiche unterschriebene Inhalte vor und nach finanziellen Korrekturen, getrennte Änderungen und Administratornachweis.
- Mehrfaches Anklicken und Speichern einschließlich Firebase-Bestätigung und vollständigem Neuladen; gleiche Rechnungsnummer, gleiche Dokumentversion und korrekte Beträge.
- Tatsächliches Ändern und Speichern im Einstellungsformular; dynamische Preise/Beschriftungen; Hinzufügen einer Preisregel und Wiederherstellen der Standardwerte.
- Probetag 50 Euro plus Sonderzeiten 10 Euro, Medikamentengabe 3 Euro, ein Spaziergang 20 Euro und zwei Verbandwechsel zu je 4 Euro = 91 Euro unter derselben Rechnung.
- Physische Feldklicks ohne erzwungene Klicks bei 1536 × 1152, 820 × 1180 und 393 × 852; keine verdeckten Zuschläge.
- Bewusste Dokumentversion, tatsächliche neue Unterschrift per Zeichenfläche, unveränderte alte Version, weiterhin eine Rechnung und Navigation zur aktuellen Version.
- Unabhängiger neuer Aufenthalt aus einer Kopie, auch für denselben Kunden und Zeitraum, ohne alte Unterschrift oder Rechnungszuordnung.
- Erhalt manueller Positionen, bezahlter/stornierter Rechnungen und alter Doppelrechnungen; eindeutige Auswahl oder Abbrechen; Zurückweisen fremder Kunden und zyklischer Versionsketten.
- Normaler Vorlageneditor und tatsächlich geladener Ersatzeditor bei simuliertem Vorlagenausfall; Rollen-/Kontowechsel; unveränderte Original-Sicherung und keine Produktionszugriffe.

Die weiteren 345 Prüfungen decken die bisherige Rechnungsbearbeitung, Probetag-Tarife, Staffelpreise, Brutto/Netto/MwSt, Druckvorschau, parallele Bearbeitungen, private PDF- und Medienablage, Synchronisation, Sicherungen, Kundentrennung, Einreichungen/Freigaben, Rollen, Chat, Aufenthalte/Kapazität, Statistik, Kontosuche, Start-/Quota-Verhalten und HTML-Ladereihenfolge ab.

## Änderungsumfang und Installation

Firebase-Konfiguration, Firestore- und Storage-Regeln sowie Workflow-Kern, Kommunikation, Kundenportal, Statistik, Kontosuche, Browser-Datenspeicher, Dokumentausgabe, Sammeldruck, bestehende Styles und Workflow-UI sind bytegleich mit GB377. Es gibt keine neuen Firebase-Pfade. Ein gesonderter Vergleich mit dem ausgelieferten GB377-ZIP bestätigt den begrenzten Änderungsumfang. Der Gesamtbelegungsrahmen von vier Hunden bleibt erhalten.

1. Aktuelle lokale Sicherung unter Einstellungen > Cloud & Konto herunterladen und in Dateien behalten.
2. Vollständigen Inhalt aus DoggyStyle_Workspace_GB378_TEST am bisherigen Ort übernehmen, einschließlich billing.js, billing.css, assets und vendor.
3. Von GB377 kommend keine Firebase-Regeln erneut veröffentlichen. Beide Regeldateien sind unverändert.
4. Neu laden und M50.9.9GB378_STAY_BILLING_TEST_20261024 in DIAG prüfen. Keine Websitedaten löschen und keinen Reset ausführen.
5. Mit einem Testaufenthalt Zuschlag anklicken, speichern, erneut ändern, neu laden und die gleiche Rechnungsnummer kontrollieren. Vorhandene Doppelrechnungen gesondert prüfen; sie werden nicht automatisch bereinigt.

## Verbleibende Grenzen

Die Entwicklung hat keine produktive Veröffentlichung vorgenommen. Angemeldete Live-Abnahme im vorhandenen Projekt, native Safari-/iPad-/iPhone-Prüfung sowie echte Drucker-/PDF-Teilen-Prüfungen stehen noch aus. Die Bildschirmgrößenprüfung in Chromium ersetzt diese Geräteprüfung nicht.

Allgemeine Synchronisationskonflikte verwenden weiterhin den vorhandenen geprüften Datenvergleich. Ein veralteter Rechnungsdialog darf eine zwischenzeitlich geänderte Rechnung nicht überschreiben. Die manuelle Prüfung und gegebenenfalls Bereinigung bereits vorhandener Doppelrechnungen ist nicht Teil einer automatischen Datenänderung dieses Pakets.

Historische Protokolle unter pruefungen beziehen sich auf die jeweils benannte ältere Fassung. Dieser Bericht beschreibt GB378.
