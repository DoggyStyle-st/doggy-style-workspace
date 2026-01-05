PATCH: Neuer Aufenthalt öffnet Editor (V1 – 2026-01-06)

Was wurde geändert?
1) app.js
   - loadTemplates() lädt Vorlagen jetzt robust mit Ordner- UND Dateinamen-Varianten:
     templates/ vs Templates/ sowie hundeannahme.json vs Hundeannahme.json (gleiches für Rechnung).
   - Fallback-Template-ID ist jetzt "hundeannahme" (nicht mehr "hundeannahme_fallback"),
     damit createStay()/createDoc() den Editor auch dann öffnen kann, wenn nur der Fallback greift.
   - APP_BUILD erweitert um "-PATCH-AUFENTHALT-01" zur eindeutigen Erkennung.

Was wurde NICHT geändert?
- Keine Datenmigration
- Keine Änderungen an templates/*.json Inhalten
- Keine Änderungen an Firebase-Konfiguration / Auth / Service Worker

Einspielen
- Den kompletten Ordner auf GitHub Pages hochladen (neuer Ordnername hilft gegen Cache).
- Danach Safari ggf. Website-Daten löschen oder URL mit neuem Ordner aufrufen.
