# Doggy Style Workspace – GB377 Rechnungen

Stand: 24. Oktober 2026. Build M50.9.9GB377_INVOICE_TEST_20261024.

Probetage verwenden nun den hinterlegten Einzeltarif der Urlaubsbetreuung. Entwürfe und offene Rechnungen können direkt über Rechnung > Bearbeiten mehrfach korrigiert und gespeichert werden. Alle 345 aktuellen Prüfungen bestehen. Produktive Kunden-, Aufenthalts- und Rechnungsdaten sowie Firebase-Regeln wurden bei der Entwicklung nicht verändert. Die angemeldete Live-Abnahme und native Safari-/iOS-Prüfung stehen noch aus.

## Gefundene Ursachen

- Für Probetag existierte keine Preisregel; der bisherige Rückgabewert war deshalb 0. Jetzt wird ausdrücklich der Preis für einen einzelnen Urlaubstag verwendet, auch bei abweichenden Einstellungen. Langzeitstaffeln werden nicht als Probetag-Tagespreis verwendet. Fehlende Regeln werden als Eingabefehler gemeldet.
- Der Wechsel vom Aufenthalt zur Rechnung rief eine nicht vorhandene Navigation auf. Eine Rechnung konnte intern existieren, während weiterhin der Aufenthaltseditor sichtbar war.
- Statusänderungen riefen nicht vorhandene Funktionen renderInvoices und showInvoiceDetail auf. Dadurch brach die Anzeige nach einer Bearbeitung ab.
- Der Speichervorgang behandelte jedes Aufenthaltsformular wie den Ersatzeditor. Im normalen Vorlagenformular wurden Eingaben deshalb nicht korrekt eingesammelt. Zusätzlich passten klein geschriebene Betreuungswerte nicht zu den Dropdown-Optionen. Beide Formularvarianten sind korrigiert.
- Nach einer Firebase-Bestätigung kann die Gerätekopie neue Objektinstanzen enthalten. Der Editor verbindet weitere gespeicherte Eingaben jetzt kontrolliert mit dem aktuellen Aufenthalt. Unabhängige Änderungen werden zusammengeführt; widersprüchliche Angaben werden nicht überschrieben.
- Bei einem Feiertag am Sonntag wurde der Zuschlag zweimal gezählt. Die Berechnung zählt jeden abrechenbaren Kalendertag einmal. Ein Aufenthalt mit gleichem Von-/Bis-Datum zählt als ein Tag.
- Die bisherige Sperre bezahlter Rechnungen hing von uneinheitlichen Lock-Markierungen ab. Jetzt schützt der Abschlussstatus auch ältere bezahlte oder stornierte Rechnungen gegen eine Neuberechnung aus dem Aufenthalt.

Die ursprünglichen Fehler sind in der unveränderten ausgelieferten GB376-Fassung mit tatsächlichem App-HTML, Browser-SDK und isoliertem Firestore reproduziert worden.

## Bedienung und Speicherung

In der Aufenthaltsliste Rechnung wählen oder eine Rechnung im Rechnungsbereich öffnen. Bearbeiten öffnet den neuen Dialog. Dort lassen sich Positionen hinzufügen, ändern oder entfernen sowie Einzelpreise, Mengen, Rechnungsdatum, Leistungszeitraum, Hinweis und Mehrwertsteuersatz korrigieren. Die Vorschau zeigt Brutto, enthaltene Mehrwertsteuer und Netto. Änderungen speichern behält die Rechnungskennung, Nummer und Verknüpfung zum Aufenthalt.

Manuell bearbeitete Positionen bleiben bei Listenwechsel, erneutem Öffnen und komplettem Neuladen erhalten. Aufschläge aus Aufenthalt übernehmen ersetzt solche Positionen nur nach Bestätigung. Bei gewöhnlichen Aufenthaltsänderungen werden weiterhin automatisch berechnete, offene Rechnungen aktualisiert; manuell bearbeitete Rechnungen werden nicht still überschrieben.

Die direkte Rechnungsbearbeitung verändert keine Unterschrift, Zustimmung oder unterschriebene Aufenthaltsdaten. Bezahlte und stornierte Rechnungen bleiben abgeschlossen. Eine Statusänderung auf Bezahlt erstellt eine Sicherung der Preise und Positionen. Eine Stornierung speichert Grund und Historie und zeigt den bisherigen Betrag mit entsprechendem Vorzeichen in der Druckvorschau.

Rechnungslisten rechnen bestehende Belege beim bloßen Ansehen nicht automatisch um. Die bisherige Gassi-Automatik und ausdrücklich gewählte Zusatzleistungen werden weiter berücksichtigt; sie kommen zum Grundpreis hinzu. Die Tages-/Urlaubstaffeln und der bestehende Gesamtbelegungsrahmen von vier Hunden bleiben erhalten.

Die Rechnung verwendet die vorhandene Dokumentansicht für eine isolierte Druckvorschau. Geprüft ist, dass sie die gespeicherten Positionen und Beträge enthält. Das native iPad-Druckmenü und die PDF-Sicherung über dieses Menü benötigen noch eine Prüfung am Gerät.

## Aktuelle erfolgreiche Prüfungen

| Gruppe | Bestanden | Testzeit UTC |
| --- | ---: | --- |
| invoice | 43 | 2026-10-24T10:20:06.040Z |
| sds | 24 | 2026-10-24T10:20:35.602Z |
| media | 19 | 2026-10-24T10:20:38.285Z |
| sync-review | 16 | 2026-10-24T10:21:17.971Z |
| sync-content | 10 | 2026-10-24T10:21:21.338Z |
| management | 36 | 2026-10-24T10:21:47.737Z |
| statistics | 40 | 2026-10-24T10:22:03.861Z |
| ui | 30 | 2026-10-24T10:22:06.531Z |
| startup | 18 | 2026-10-24T10:22:14.426Z |
| quota | 14 | 2026-10-24T10:22:16.898Z |
| firebase | 66 | 2026-10-24T10:22:31.246Z |
| portal-features | 21 | 2026-10-24T10:22:44.419Z |
| script-load | 8 | 2026-10-24T10:22:47.668Z |

Gesamt: 345 Prüfungen in 13 Gruppen, ohne fehlgeschlagene aktuelle Prüfung.

Die 43 neuen Rechnungsprüfungen verwenden die vollständige ausgelieferte HTML-Seite, das exakte Firebase-Browser-SDK 10.12.5, Chromium 155 und einen echten isolierten Firestore-Emulator. Sie prüfen unter anderem:

- Probetag zum Einzeltarif und nach Änderung der Preisliste; bestehende Staffelpreise; Zuschläge/Rabatte/Medikamente/fixe Leistungen; einmaliger Sonn-/Feiertagszuschlag; gültige Zeiträume.
- Tatsächlichen Wechsel aus der Aufenthaltsliste zur Rechnung, stabile Nummern, idempotentes Wiederöffnen und Status Offen.
- Mehrfache Rechnungsbearbeitung mit tatsächlichem Firestore-Schreiben; neue und entfernte Positionen; Dezimalkomma; Netto/MwSt/Brutto; Nullsteuersatz; freie Rechnung; vollständiges Neuladen.
- Identische Kundenunterschrift und unveränderter unterschriebener Quellaufenthalt nach einer Rechnungskorrektur.
- Speichern im normalen Aufenthaltsformular, erneutes Speichern nach Firebase-Bestätigung, Probetag in beiden Formularvarianten und korrekte Aktualisierung verknüpfter automatisch berechneter Rechnungen.
- Abbrechen, ungültige Beträge/Zeiträume und negative Gesamtsummen; gleichzeitige Änderungen, darunter eine echte Änderung durch ein zweites Administratorkonto im Firestore-Emulator.
- Schutz bezahlter und stornierter Belege einschließlich älterer Lock-Formate, Stornogrund/Historie, konsistente Druckvorschau und Rollen-/Kontowechsel.
- Erreichbare Dialogfelder und Speichern-Knöpfe bei iPad- und iPhone-Bildschirmgrößen in Chromium. Das ist kein Test in nativem Safari.

Die weiteren 302 Prüfungen umfassen die bisherige private PDF-Ablage mit tatsächlichem Storage-Upload und bytegleichem Download, Medienabruf, Synchronisation und lokale Sicherungen, Kundentrennung, Einreichungen/Freigaben, Rollen, Chat, Aufenthalte/Kapazität, Statistik und Kontosuche, Start- und Quota-Verhalten sowie HTML-Ladereihenfolge. Die vorhandene Original-Sicherung ist unverändert.

## Änderungsumfang und Installation

Firebase-Konfiguration sowie Firestore- und Storage-Regeln sind bytegleich mit GB376. Workflow-Kern, Kundenschnittstelle, Kommunikation, Kontosuche, Statistik, Browser-Datenspeicher, Dokumentausgabe und Sammeldruck sind erhalten. Die neue billing.js und billing.css enthalten die Rechnungsbearbeitung; der App-Code ist ausschließlich in den dafür erfassten Rechnungs-/Aufenthaltsfunktionen angepasst. Der Account-Reset schließt zusätzlich den Rechnungsdialog. HTML und Service Worker laden die neuen Dateien und die neue Buildkennung. Ein gesonderter Vergleich mit GB376 bestätigt den begrenzten Änderungsumfang.

1. Aktuelle lokale Sicherung unter Einstellungen > Cloud & Konto herunterladen und in Dateien behalten.
2. Vollständigen Inhalt aus DoggyStyle_Workspace_GB377_TEST am bisherigen Ort übernehmen, einschließlich billing.js, billing.css, assets und vendor.
3. Von GB376 kommend keine Firebase-Regeln erneut veröffentlichen. Beide Regeldateien sind unverändert.
4. Neu laden und M50.9.9GB377_INVOICE_TEST_20261024 in DIAG prüfen. Keine Websitedaten löschen und keinen Reset ausführen.
5. Aufenthalt > Rechnung > Bearbeiten verwenden. Gespeicherte Korrekturen nach erneutem Öffnen kontrollieren.
6. Bereits vorhandene offene Probetag-Rechnungen mit 0 Euro nach Prüfung über Aufschläge aus Aufenthalt übernehmen ausdrücklich neu berechnen. Bestehende Belege werden beim bloßen Ansehen nicht automatisch neu bepreist.

## Verbleibende Grenzen

- Die angemeldete Abnahme im bestehenden Firebase-Projekt sowie native Safari-/iPad-/iPhone- und echte Drucker-/PDF-Teilen-Prüfungen sind noch offen. Die Entwicklung hat keine produktive Veröffentlichung vorgenommen.
- Entwürfe und offene Rechnungen sind bearbeitbar. Bezahlte und stornierte Rechnungen werden absichtlich geschützt und nicht rückwirkend neu bepreist.
- Eine inzwischen geänderte Rechnung muss neu geöffnet werden; ein alter Dialog darf sie nicht überschreiben. Allgemeine Synchronisationskonflikte verwenden weiterhin den vorhandenen geprüften Abgleich.

Historische Protokolle unter pruefungen beziehen sich auf die jeweils benannte ältere Fassung. Dieser Bericht beschreibt GB377.
