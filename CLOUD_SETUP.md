# Bestehendes Firebase-Projekt – GB370 Testfassung

Projekt: doggy-style-hundepension. Organisation: doggystyle. Bucket: doggy-style-hundepension.firebasestorage.app. Die vorhandene firebase-config.js bleibt unverändert.

1. Bisherige App-Dateien, veröffentlichte Regeln und Bestandssicherung als Rückweg aufbewahren.
2. Die vollständigen App-Dateien aus GB370 am bisherigen Ort einspielen. Keine neuen Projekte oder Kundenkonten anlegen.
3. GB370 verwendet unveränderte GB368-Regeln. Falls diese bereits veröffentlicht sind, ist keine erneute Veröffentlichung nötig. Für ältere Fassungen: den enthaltenen Firestore-Text aus REGELN_ANZEIGEN.html bzw. firestore.rules im bestehenden Projekt veröffentlichen. Storage-Regeln sind gegenüber GB367 unverändert. Das Archiv benötigt die neue Sammlung inboxArchive; Kunden dürfen nur ihre eigenen gelesenen früheren Rückmeldungen löschen und eigene automatische Chat-Rückmeldungen für sich ausblenden.
4. Tabs schließen, Website neu laden und HTML-/JS-Build in DIAG prüfen. Neue Kundenänderung und neuen Aufenthalt testen, administrativ annehmen/ablehnen, Rückmeldung im richtigen Kundenchat lesen und persönlich entfernen. Danach mit dem zweiten Kundenkonto die Trennung prüfen.
5. Alte offene Eingänge können ohne Bestandsreparatur archiviert und wiederhergestellt werden. Die Entwicklung archiviert nichts im echten Projekt. Es wird keine alte Einreichung automatisch angenommen, abgelehnt oder gelöscht.
6. Sonja/Bello und Max/Rex besitzen laut Sicherung bereits geprüfte eigene Zuordnungen. Hans Dampf hat darin keine solche Zuordnung. Weitere Kundenkonten brauchen eine geprüfte eigene Kunden-/Hundezuordnung. Keine Zuordnung über gleiche Namen oder Chat-E-Mail-Aliasse.

Freigaben, Bestandsreparaturen und Archivierung erfordern die vorhandene Administratorrolle bzw. den bereits vorgesehenen verifizierten Eigentümerzugang. Mitarbeiterrollen werden nicht erweitert.

Storage-Regeln prüfen zugeordnete Hunde über Firestore-Profile. Tatsächlicher Medienabruf, produktive Dienstberechtigungen und CORS bleiben im bestehenden Projekt zu prüfen. Keine pauschalen öffentlichen Leserechte setzen. Neue Regeln widerrufen bestehende Downloadtokens nicht; konkrete Tokenänderungen bleiben einer gesonderten Prüfung und Zustimmung vorbehalten.

Die JSON-Bestandssicherung enthält keine Storage-Dateien oder Auth-Konten. Archive sind reine zusätzliche Markierungen; alte Anfragen und Signaturen bleiben unverändert. Atomare Entscheidungen legen normale Chatnachrichten an, keine neue separate notifications-Meldung. Historische private Rückmeldungen bleiben ausschließlich im Chat als früherer Bestand erreichbar.

Prüfergebnisse und Grenzen: PRUEFBERICHT.md. Referenzen: https://firebase.google.com/docs/firestore/security/get-started und https://firebase.google.com/docs/storage/security/start

GB370 verwendet einen authentifizierten XMLHttpRequest für die Dateianzeige. Ein schreibfreier Vorabtest am bestehenden Storage-Endpunkt hat Authorization als erlaubten CORS-Header bestätigt; Cache-Control und Pragma werden dort nicht als erlaubte Anfrageheader aufgeführt. Der tatsächliche angemeldete Fotoabruf und die konkrete Safari-Ursache sind dadurch noch nicht bewiesen. Keine CORS- oder Regeländerung wurde veröffentlicht. Bei weiterhin fehlschlagender Vorschau den nun genauen Hinweis sowie DIAG verwenden, bevor eine weitere Konfigurationsänderung erfolgt.
