# Bestehendes Firebase-Projekt - GB373

Projekt doggy-style-hundepension, Organisation doggystyle, Bucket doggy-style-hundepension.firebasestorage.app bleiben erhalten.

Die Firestore-Regeln dieses Updates ergänzen genau zwei interne Statistikpfade: orgs/doggystyle/statistics für neue Bewertungen und orgs/doggystyle/stats als lesbaren Altbestand. Nur Administratoren und Mitarbeiter dürfen lesen. Neue gültige Bewertungen dürfen sie ergänzen; vorhandene Bewertungen können über diese Pfade nicht überschrieben oder gelöscht werden. Kunden und unangemeldete Konten erhalten keinen Zugriff. Alle bisherigen Regelpfade bleiben unverändert.

Vorhandene Regeln in der eigenen Konsole sichern. REGELN_ANZEIGEN.html öffnen, Firestore auswählen, den vollständigen Regeltext kopieren und im richtigen bestehenden Projekt veröffentlichen. Diese Seite veröffentlicht selbst nichts. Für dieses Update keine Storage-Regeln ändern, keine Bestandsreparatur ausführen und keine neuen Konten anlegen.

Neue Bewertungen werden im separaten Statistikbestand gespeichert. Die zusätzliche JSON-Sicherung unter Statistik > Bewertungen enthält auch diesen Bestand; die bisherige Workspace-Sicherung allein enthält die neue Sammlung nicht. Lokal verbliebene Altbewertungen auf dem ursprünglichen Gerät mit demselben Workspace-Konto prüfen und bewusst übertragen. Der alte lokale Speicher wird nicht gelöscht.

Die Entwicklung liest und schreibt ausschließlich isolierte demo-Emulatorprojekte. Vollständige angemeldete Live-Tests und native Safari-/iOS-Bedienung bleiben offen.
