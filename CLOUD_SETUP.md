# Firebase-Einrichtung GB376

Bestehendes Projekt doggy-style-hundepension, Organisation doggystyle und Bucket doggy-style-hundepension.firebasestorage.app werden unverändert verwendet.

## Storage-Regeln ergänzen

Vor der ersten PDF-Synchronisation die vollständige storage.rules aus diesem Paket in der Firebase-Konsole unter Storage > Regeln prüfen und veröffentlichen. REGELN_ANZEIGEN.html zeigt unter Storage den exakten kopierbaren Text. Die Firestore-Regeln sind gegenüber GB375 unverändert und müssen für diese Änderung nicht erneut veröffentlicht werden. Keine Testmodus-Regeln und keinen öffentlichen Bucket-Zugriff aktivieren.

Neu ist ausschließlich orgs/doggystyle/safetyDataSheets/{sha256}.pdf: Lesen für Administratoren/Mitarbeiter, Anlegen nur für Administratoren, PDF bis 8 MB, passende Organisation/Uploadkonto/Hash-Metadaten. Kunden, Gäste und unangemeldete Nutzer haben keinen Zugriff. Bestehende Dateien sind unveränderbar und werden durch Entfernen eines Verweises nicht gelöscht. Die bestehenden Foto- und Chat-Pfade sind unverändert.

## Speicherung und Wiederaufnahme

Eingebettete Sicherheitsdatenblätter werden beim normalen Speichern oder beim ausdrücklich bestätigten lokalen Abgleich auf einer Kopie übertragen. Eine dauerhafte lokale Sicherung muss vorher gelingen. Erst nach bestätigten Storage-Uploads und der erfolgreichen Firestore-Transaktion übernimmt die Gerätekopie die Dateiverweise. Kontowechsel, geänderte Serverrevision, Berechtigungs- oder Netzwerkfehler stoppen die Übernahme. Wiederholungen verwenden vorhandene identische PDF-Dateien. Ein fehlgeschlagener Firestore-Abschluss kann eine noch unreferenzierte PDF in Storage hinterlassen; diese wird nicht automatisch gelöscht, damit Sicherungen und Wiederholungen erhalten bleiben.

Das sichere Firestore-Dokumentlimit bleibt unverändert. Andere sehr große eingebettete Inhalte werden nicht automatisch entfernt. Ohne vertrauenswürdigen Ausgangsstand bleibt ein automatisches Zusammenführen gesperrt.

PDFs werden authentifiziert geladen; die App ruft dafür kein getDownloadURL auf und speichert keine Token-Downloadlinks. Bereits außerhalb der App bekannte Downloadlinks werden durch diese Änderung nicht widerrufen. Die bestehende funktionierende CORS-Einstellung bleibt bestehen; bei einem Ladefehler werden die konkreten Rechte-/Transportfehler angezeigt.

## Abnahme

Die Tests verwenden isolierte Firebase-Emulatoren und kopierte vorhandene Testkunden. Das produktive Projekt, native Safari/iPad/iPhone und echte Drucker wurden nicht angemeldet geprüft. Die Entwicklung veröffentlicht weder App-Dateien noch Regeln im produktiven Projekt.
