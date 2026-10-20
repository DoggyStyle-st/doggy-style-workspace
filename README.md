# Doggy Style Workspace – GB370 Reparatur-Testfassung

Stand: 20. Oktober 2026. **Vollständige Testfassung; abschließender Test im bestehenden Firebase und auf iPad/iPhone steht aus.**

GB370 überarbeitet den privaten Dateiabruf für Profilfotos, Impfpassfotos und Chatdateien. Der Browser lädt Dateien mit dem angemeldeten Konto als Blob über XMLHttpRequest, ohne zusätzliche Cache-Vorgaben. Jede neue Anfrage hat eine eigene Kennung. Es werden keine öffentlichen Downloadtokens als Ersatz verwendet und keine Berechtigungen erweitert.

Fehler unterscheiden Anmeldung (401), fehlende Leseberechtigung (403), fehlende Datei (404), zu viele Abrufe (429), Server-, Netz-/CORS-, Zeit- und Darstellungsfehler. Erneut laden versucht dieselbe gespeicherte Datei erneut. Beim Kontowechsel werden laufende Abrufe abgebrochen und geladene private Blob-Adressen widerrufen. Zwei Vorschauen derselben Datei teilen sich einen Abruf. Der Login zeigt ebenfalls die aktuelle Buildnummer.

Bereits eingereichte Fotos mit gültigem gespeicherten Dateipfad können nach dem Update erneut geöffnet werden; ein erneuter Upload ist dafür nicht grundsätzlich nötig. Tatsächlich fehlende oder verlorene Dateien werden durch das Update nicht rekonstruiert.

Enthalten bleiben Fotoupload mit Wartezustand und verständlichen Fehlern, sichtbarer roter Fotovergleich, Freigabe und richtige Portal-Synchronisation, Chatentscheidungen und persönliche Entfernung, reversibles Eingangsarchiv, Aufenthaltsanfrage mit lesbaren Texten und Unterschrift, Belegungsprüfung mit vier Hunden sowie die übrigen Reparaturen.

Das vorhandene Projekt und alle Firebase-Regeln sind gegenüber GB369 unverändert. Keine produktiven Daten oder Dateien wurden durch die Entwicklung geändert. INSTALLATION_IPAD.txt beschreibt das Update. PRUEFBERICHT.md und pruefungen/ dokumentieren bestandene Tests und offene Punkte. Diese ZIP enthält keine Kundenbestandssicherung, Storage-Dateien oder Anmeldedaten.
