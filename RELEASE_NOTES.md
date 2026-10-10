# Doggy Style Workspace – GB358

## Inhalt
- Gesamtkapazität maximal vier Hunde (Tages- und Urlaubsbetreuung zusammen).
- Kunden-App und Workspace mit bestehender Aufgaben- und Vorschlagsübernahme.
- Automatisch eingeblendete GB348-Diagnose aus beiden Oberflächen entfernt.
- Alte Diagnose-/Reparaturdateien aus dem Auslieferungspaket entfernt.
- Firestore-Regeln gegen Rollen-Selbstvergabe und fremde Datensätze gehärtet.
- Lokale Vorschlags-Warteschlange nach angemeldetem Konto getrennt; keine Übertragung unter fremdem Konto.
- Neue Cache-Version für GitHub Pages.

## Veröffentlichung
1. Inhalt dieses Verzeichnisses vollständig ins GitHub-Pages-Repository übertragen.
2. `firestore.rules` in Firebase → Firestore Database → Rules veröffentlichen.
3. `storage.rules` in Firebase → Storage → Rules veröffentlichen.
4. Mit zwei getrennten Firebase-Testkonten und echten Geräten prüfen: Aufgabe freigeben, Kunde bearbeitet, Vorschlag übernehmen, Kundendaten erneut öffnen, Foto hochladen.
5. Alte zwischengespeicherte Seiten gegebenenfalls im Browser neu laden.

## Prüfgrenzen
Automatisierte Syntax-, Struktur- und lokale Logiktests sind möglich.
Ein echter Ende-zu-Ende-Test mit eurem produktiven Firebase-Projekt wurde nicht durchgeführt.
Vor dem Ersetzen des GitHub-Stands ein Backup des bisherigen Releases behalten.
