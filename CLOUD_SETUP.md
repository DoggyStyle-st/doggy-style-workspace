# Bestehendes Firebase-Projekt – GB374

Projekt doggy-style-hundepension, Organisation doggystyle, Bucket doggy-style-hundepension.firebasestorage.app bleiben erhalten.

Vorhandene Firestore-Regeln in der eigenen Konsole sichern. REGELN_ANZEIGEN.html öffnen, Firestore auswählen und den vollständigen Regeltext dieses Pakets im vorhandenen Projekt veröffentlichen. Die Seite veröffentlicht selbst nichts. Storage-Regeln bleiben unverändert. Keine Bestandsreparatur, kein Reset und keine neuen Konten sind für dieses Update nötig.

Die zusätzliche interne Sammlung orgs/doggystyle/statisticChanges enthält ausdrückliche Korrekturen und Löschvermerke zu Bewertungen. Administratoren und Mitarbeiter dürfen sie lesen und geprüfte, fortlaufende Revisionen schreiben. Kunden und unangemeldete Konten sind ausgeschlossen. Ein Löschvermerk kann nicht entfernt oder aufgehoben werden. Ursprüngliche Bewertungen bleiben intern als unveränderte Quelle bestehen; die App entfernt gelöschte Bewertungen aus Listen, Analysen und den regulären Exporten. Dadurch erscheinen sie nicht erneut aus alten Geräte- oder Workspace-Kopien. Das ist eine logische Löschung, keine physische Löschung aller ursprünglichen Firebase-/Sicherungskopien.

Die bestehende Statistik-Sammlung für neue Beobachtungen und der lesbare Altbestand unter stats bleiben erhalten. Alle anderen Regelpfade sind unverändert. Die Kontensuche benötigt keine zusätzliche Freigabe und verändert Rollen nur nach Rolle speichern durch einen Administrator.

Die JSON-Sicherung unter Statistik > Bewertungen enthält den aktuell sichtbaren Stand, einschließlich Korrekturen und ohne gelöschte Bewertungen. Sie ist keine vollständige administrative Rohsicherung der ursprünglichen Quellen und Löschvermerke. Die allgemeine Workspace-Sicherung allein erfasst die separaten Statistik-Sammlungen nicht.

Entwicklung und Tests verwenden ausschließlich isolierte demo-Emulatorprojekte. Vollständige angemeldete Live-Tests und native Safari-/iOS-Bedienung bleiben offen.
