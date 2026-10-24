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
