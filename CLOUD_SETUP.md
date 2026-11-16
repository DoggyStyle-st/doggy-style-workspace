# Firebase-Einrichtung GB385

Das bestehende Projekt doggy-style-hundepension, die Organisation doggystyle und der Bucket doggy-style-hundepension.firebasestorage.app werden weiterverwendet.

## Update eines eingerichteten Kalenders auf GB385

1. Die ZIP entpacken und im Terminal den Ordner `doggy-style-workspace-main` öffnen. Übernimm die vorhandene `functions/.env.doggy-style-hundepension` aus der bisherigen Kalenderinstallation, damit die Konfiguration für Push und die Kalender-E-Mails weiter verwendet wird.
2. Die Abhängigkeiten installieren und die neuen Firestore-Regeln sowie die beiden Funktionen für Kalender und Rechnungen bereitstellen.

```sh
npm ci --prefix functions
firebase deploy --project doggy-style-hundepension --only firestore:rules,functions:calendar:calendarControl,functions:calendar:portalInvoice
```

3. Die App-Dateien am bisherigen Hosting-Ort aktualisieren. Den Workspace und das Kundenportal neu laden.
4. Mit einem zugeordneten Testkonto den Terminvorschlag und die Rückmeldung prüfen. Eine Testrechnung auf **Offen** setzen und mit **Rechnung an Kunden weitergeben** im Chat bereitstellen. Dort das PDF öffnen und nach der Statusänderung auf **Bezahlt** erneut aufrufen.

Terminvorschläge und Rechnungen im Kundenchat laufen direkt über Firebase. Die Mail-Konfiguration unten gehört zu den E-Mail-Einladungen an den Apple Kalender.

## Grundlagen

Die Auswertungen lesen den synchronisierten Rechnungs- und Aufenthaltsstand im Workspace. Die Kalenderfunktionen verwenden die nachfolgende Firebase-Einrichtung.

Die Firestore-Regeln geben dem Workspace-Team Zugriff auf den internen Kalender und jedem Kundenkonto Zugriff auf seine zugeordneten Terminvorschläge. Firebase Functions übernehmen das Speichern. REGELN_ANZEIGEN.html zeigt die Regeltexte dieser Version.

Die Kundennummern werden innerhalb der bestehenden Workspace-Transaktion vergeben. Die Synchronisierung übernimmt dabei die Nummern bereits vorhandener Kunden aus dem bestätigten Serverstand.

Aufenthalte und Rechnungen bleiben im bisherigen Workspace-Dokument und werden mit der vorhandenen Administrator-, Konto- und Revisionsprüfung gespeichert. Finanzielle Korrekturen an unterschriebenen Aufenthalten stehen als billingOverrides und billingAudit getrennt von den ursprünglichen Kundenangaben. Eine dokumentierte Versionskette ordnet dieselbe Betreuung ihrer vorhandenen Rechnung zu.

Manuelle Rechnungspositionen bleiben erhalten; das ausdrückliche Übernehmen aus Aufenthalt verlangt eine Bestätigung. Bezahlte und stornierte Rechnungen werden nicht neu berechnet. Mehrere alte Rechnungen werden weder gelöscht noch zusammengelegt. Fehlt eine eindeutige Zuordnung, wird die Auswahl angezeigt.

Bestehende private Dateiablage, Kundentrennung und geprüfter lokaler Abgleich bleiben erhalten. Die Prüfungen zu GB381 verwenden isolierte Testdaten. Die Rechnungsvorschau und der PDF-Export laufen lokal auf dem Gerät. Die angemeldete Abnahme sowie die Prüfung in Safari auf iPad und iPhone stehen aus.

## Kalender und Workspace-Mitteilungen

Der Kalender nutzt Firebase Functions der zweiten Generation in `europe-west1`. Für die Veröffentlichung braucht das Firebase-Projekt den Blaze-Tarif und aktivierte Cloud-Scheduler-, Cloud-Functions- und Secret-Manager-Dienste. Firebase legt die geplanten Aufrufe bei der Bereitstellung an. Die Prüfung auf fällige Erinnerungen läuft jede Minute.

Das Laufzeit-Dienstkonto braucht Schreib- und Lesezugriff auf Firestore (`roles/datastore.user`). Für den Abgleich aktivierter Geräte braucht es lesenden Zugriff auf Firebase Authentication (`roles/firebaseauth.viewer`). Firebase bindet die Secrets an die jeweilige Funktion.

1. Firebase CLI und Node.js 22 auf dem Rechner für die Veröffentlichung bereitstellen. Im entpackten Workspace die Abhängigkeiten mit `npm ci --prefix functions` installieren.
2. Ein VAPID-Schlüsselpaar mit `npm exec --prefix functions -- web-push generate-vapid-keys` erzeugen. Den öffentlichen Schlüssel und eine erreichbare technische Kontaktadresse in `functions/.env.doggy-style-hundepension` eintragen. `CALENDAR_MAIL_FROM` kann beim ersten Schritt leer bleiben.

```dotenv
CALENDAR_VAPID_PUBLIC_KEY=OEFFENTLICHER_SCHLUESSEL
CALENDAR_PUSH_CONTACT=kontakt@example.net
CALENDAR_MAIL_FROM=
```

3. Den privaten Schlüssel bei der Eingabeaufforderung des ersten Befehls hinterlegen. Danach die Regeln, Kalenderfunktionen und Erinnerungen bereitstellen.

```sh
firebase functions:secrets:set CALENDAR_VAPID_PRIVATE_KEY --project doggy-style-hundepension
firebase deploy --project doggy-style-hundepension --only firestore:rules,functions:calendar:calendarControl,functions:calendar:calendarReminders,functions:calendar:portalInvoice
```

4. Die App-Dateien per HTTPS veröffentlichen. Auf iPad und iPhone den Workspace über sein Symbol auf dem Home-Bildschirm öffnen und unter **Kalender → Mitteilungen einschalten** zustimmen. Jedes benutzte Gerät einmal aktivieren. Nach ausdrücklichem Abmelden beim nächsten Einsatz wieder einschalten. Beim Wechsel auf eine andere Domain die App unter der neuen Adresse zum Home-Bildschirm hinzufügen und die Mitteilungen dort aktivieren.
5. Einen Testtermin einige Minuten in der Zukunft mit Erinnerung **Zum Termin** anlegen und den Workspace schließen. Die Mitteilung öffnen und den zugehörigen Kalendertag prüfen.

Alle Termine und Erinnerungszeiten verwenden die Zeitzone Europa/Berlin. Bei ganztägigen Terminen ist 9 Uhr der Bezugspunkt. Der öffentliche Schlüssel muss bei Versionswechseln gleich bleiben, damit vorhandene Geräte ihre Verbindung behalten.

## Automatische Kalendereinladungen

1. Einen freigegebenen Absender des Mailanbieters in `CALENDAR_MAIL_FROM` eintragen. Den SMTP-Zugang als Secret hinterlegen. Das Format ist `smtps://BENUTZER:PASSWORT@SMTP-HOST:465` oder `smtp://BENUTZER:PASSWORT@SMTP-HOST:587` mit STARTTLS. Sonderzeichen im Benutzernamen und Kennwort für eine URL kodieren.

```sh
firebase functions:secrets:set CALENDAR_SMTP_URL --project doggy-style-hundepension
firebase deploy --project doggy-style-hundepension --only functions:calendar:calendarControl,functions:calendar:calendarInvitations
```

2. Als Administrator im Workspace **Kalender → Einladungen einrichten** öffnen. Dort die gewünschten Kalender-E-Mail-Adressen für Raphael und Anschi eintragen. Die erste Einladung mit einem Testtermin prüfen und in Apple Kalender annehmen.
3. Den Testtermin verschieben und danach absagen. Beide Kalender erhalten eine Aktualisierung beziehungsweise Absage zum selben Termin. Im Workspace zeigt der Termin den Versandstatus. Bei einem Fehler ist dort **Versand erneut versuchen** verfügbar.

Bei neuen Terminen mit eingerichtetem Mailversand ist die Einladung vorgewählt. Beim Anlegen kann sie abgewählt werden. Änderungen an den eingetragenen Adressen gelten für neue Einladungen. Ein bereits eingeladener Termin behält die ursprünglichen Empfänger für Änderungen und Absagen.

Für die Veröffentlichung auf dem Webhoster werden die App-Dateien einschließlich `firebase-config.js` benötigt. Die Bereitstellungsdatei `firebase.json`, der Ordner `functions` und lokal ergänzte Zugangsdaten bleiben auf dem Rechner für die Bereitstellung.
