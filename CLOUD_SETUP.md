# Firebase-Einrichtung GB379

Das bestehende Projekt doggy-style-hundepension, die Organisation doggystyle und der Bucket doggy-style-hundepension.firebasestorage.app werden weiterverwendet.

Die Firestore- und Storage-Regeln entsprechen dem Stand GB378. REGELN_ANZEIGEN.html zeigt weiterhin die exakten vorhandenen Regeltexte.

Aufenthalte und Rechnungen bleiben im bisherigen Workspace-Dokument und werden mit der vorhandenen Administrator-, Konto- und Revisionsprüfung gespeichert. Es gibt keine neuen Firebase-Pfade. Finanzielle Korrekturen an unterschriebenen Aufenthalten stehen als billingOverrides und billingAudit getrennt von den ursprünglichen Kundenangaben. Eine dokumentierte Versionskette ordnet dieselbe Betreuung ihrer vorhandenen Rechnung zu. Es wird nicht nach Namen oder Datum geraten.

Manuelle Rechnungspositionen bleiben erhalten; das ausdrückliche Übernehmen aus Aufenthalt verlangt eine Bestätigung. Bezahlte und stornierte Rechnungen werden nicht neu berechnet. Mehrere alte Rechnungen werden weder gelöscht noch zusammengelegt. Fehlt eine eindeutige Zuordnung, wird die Auswahl angezeigt.

Bestehende private Dateiablage, Kundentrennung und geprüfter lokaler Abgleich bleiben erhalten. Die Prüfungen zu GB379 verwenden isolierte Testdaten. Die angemeldete Abnahme sowie die Prüfung in Safari auf iPad und iPhone stehen aus.
