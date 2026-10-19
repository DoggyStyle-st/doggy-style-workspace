# Bestehendes Firebase-Projekt – GB366 Testfassung

Verwenden: `doggy-style-hundepension`, Organisation `doggystyle`, Bucket `doggy-style-hundepension.firebasestorage.app`.
Die vorhandene `firebase-config.js` ist unverändert. Kein neues Projekt, kein neues Kundenkonto und kein Zurücksetzen von Passwörtern sind für diese Reparatur vorgesehen.

1. Bisherige App-Dateien und veröffentlichte Regeln als Rückweg behalten. Die bereits gespeicherte Bestandssicherung aufbewahren.
2. GB366 am bisherigen Ort einspielen. Die neue firestore.rules bzw. der Firestore-Text aus REGELN_ANZEIGEN.html muss im bestehenden Projekt veröffentlicht werden. Die Storage-Regeln sind gegenüber GB365 unverändert. Danach die App neu öffnen.
3. Die Sicherung vom 19. Oktober bestätigt Sonja/Bello und Max/Rex jeweils unter ihrem richtigen Konto. Eine erneute Bestandsreparatur dieser beiden Zuordnungen ist dafür nicht erforderlich. Alte Anfragen können unbearbeitet bleiben.
4. Neue Kundenänderung einreichen, als Administrator unter „Eingänge“ prüfen und übernehmen, im richtigen Kundenkonto erneut öffnen und im zweiten Konto die Trennung prüfen. Danach neue Unterschrift und neue Aufenthaltsanfrage durch denselben Ablauf prüfen.
5. Weitere Kundenkonten benötigen vor der Nutzung eine eigene geprüfte Kunden-/Hundezuordnung. Das vorhandene Konto „Hans Dampf“ hat in dieser Sicherung noch keine solche Zuordnung. Ohne sie bleibt der Zugriff auf Kundendaten gesperrt.
6. Der Reparaturdialog ist für tatsächlich fehlende Zuordnungen optional. Jede dort geplante Bestandsänderung erfordert weiterhin Sicherung und Einzelprüfung.

Neue Firebase-Adminrechte werden nicht aus einer beliebigen E-Mail abgeleitet. Maßgeblich sind vorhandene Rollen; nur die verifizierte Eigentümeradresse ist als zusätzlicher Eigentümerzugang vorgesehen. Die Mitarbeiterrolle kann in dieser Fassung keine administrativen Reparaturen oder Freigaben ausführen.

Storage verwendet die Profile in Firestore zur Prüfung der zugewiesenen Hunde. Falls Firebase beim Veröffentlichen eine Dienstberechtigung für diese Regelabfrage verlangt, den konkret angezeigten Zugriff prüfen. Keine pauschalen öffentlichen Leserechte setzen. Bestehende Downloadtokens sind gesondert zu inventarisieren und nur nach Zustimmung zu ändern; neue Regeltexte widerrufen solche Links nicht.

Aktueller Sicherungsbefund: Sonja/Bello und Max/Rex sind in den aktiven Listen und korrekt zugeordnet. Es gibt 71 alte Vorschläge und 58 alte Aufgaben, aber noch keine Einreichung im aktuellen Schema 3. Die Entwicklung veränderte den bestehenden Firebase-Bestand nicht. Historische Eingänge oder unklare Signaturkopien werden nicht automatisch übernommen.

Referenzen: https://firebase.google.com/docs/firestore/security/get-started und https://firebase.google.com/docs/storage/security/start
