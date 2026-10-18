# Bestehendes Firebase-Projekt – GB362 Testfassung

Verwenden: `doggy-style-hundepension`, Organisation `doggystyle`, Bucket `doggy-style-hundepension.firebasestorage.app`.
Die vorhandene `firebase-config.js` ist unverändert. Kein neues Projekt, kein neues Kundenkonto und kein Zurücksetzen von Passwörtern sind für diese Reparatur vorgesehen.

1. Bisherige App-Dateien und veröffentlichte Regeln separat sichern.
2. Die Testfassung auf dem bisherigen Webserver einspielen und als bestehender Administrator anmelden. Im Reparaturbereich den vollständigen lesbaren Workspace-/Profil-/Eingangsstand sichern. Anschließend zunächst schließen.
3. `REGELN_ANZEIGEN.html` öffnen und die beiden Regeltexte mit `firestore.rules` / `storage.rules` vergleichen. In der eigenen Firebase-Konsole nur im oben genannten Projekt veröffentlichen. Eine reine Dateikopie ins GitHub-Repository aktiviert keine Firebase-Regeln. Die neuen Regeln schließen Kunden ohne geprüfte Zuordnung aus.
4. Mit dem bestehenden Administrator erneut **Eingänge → Bestand prüfen und reparieren** öffnen. Fehlende Datensätze einzeln prüfen und ergänzen. Danach die angezeigte Konto-/Kunden-/Hundezordnung prüfen und speichern. Bei jedem neuen Stand eine neue Sicherung speichern. Keine Rolle wird dabei geändert.
5. Fehlende Gegenstücke offener Kundeneingänge nur nach vollständiger Inhaltsprüfung ergänzen. Das Ergänzen ist keine Übernahme. Anschließend den Eingang regulär prüfen und übernehmen oder ablehnen.
6. Kunden nacheinander bzw. in getrennten Browsersitzungen anmelden und die echte Trennung, Einreichung, Übernahme und Rückmeldung prüfen. Alte unklare Vertragszustimmungen werden nicht nachträglich freigegeben. Eine neue Unterschrift wird erst nach administrativer Entscheidung wirksam im vorgesehenen Ablauf angezeigt.

Neue Firebase-Adminrechte werden nicht aus einer beliebigen E-Mail abgeleitet. Maßgeblich sind vorhandene Rollen; nur die verifizierte Eigentümeradresse ist als zusätzlicher Eigentümerzugang vorgesehen. Die Mitarbeiterrolle kann in dieser Fassung keine administrativen Reparaturen oder Freigaben ausführen.

Storage verwendet die Profile in Firestore zur Prüfung der zugewiesenen Hunde. Falls Firebase beim Veröffentlichen eine Dienstberechtigung für diese Regelabfrage verlangt, den konkret angezeigten Zugriff prüfen. Keine pauschalen öffentlichen Leserechte setzen. Bestehende Downloadtokens sind gesondert zu inventarisieren und nur nach Zustimmung zu ändern; neue Regeltexte widerrufen solche Links nicht.

Bekannte Live-Befunde: zwei Kundenprofile ohne feste Zuordnung; Max/Rex in Datensatz-Tabellen, aber nicht in Listen; ein offener Vorschlag ohne referenzierte Aufgabe; visuell leeres Bild bei einer als angenommen markierten alten Signatur. Diese Daten wurden bei der Erstellung nicht verändert.

Referenzen: https://firebase.google.com/docs/firestore/security/get-started und https://firebase.google.com/docs/storage/security/start
