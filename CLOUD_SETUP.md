# Firebase-Einrichtung GB377

Das bestehende Projekt doggy-style-hundepension, die Organisation doggystyle und der Bucket doggy-style-hundepension.firebasestorage.app werden weiterverwendet.

Die Firestore- und Storage-Regeln sind bytegleich mit GB376. Für diese Rechnungsreparatur müssen keine Regeln erneut veröffentlicht werden. REGELN_ANZEIGEN.html enthält weiterhin die exakten bestehenden Regeltexte.

Rechnungen bleiben im vorhandenen Workspace-Dokument und werden über die vorhandene Firestore-Transaktion mit Administrator- und Revisionsprüfung gespeichert. Kunden erhalten keinen Workspace-Zugriff. Ein geöffneter Rechnungsdialog prüft Konto und ursprünglichen Rechnungsstand vor dem Speichern; inzwischen geänderte Datensätze werden nicht überschrieben. Bezahlte und stornierte Rechnungen werden von Neuberechnungen ausgenommen.

Die separate, private PDF-Ablage und der sichere lokale Abgleich aus GB376 sind erhalten. Sicherungen und bestehende Unterschriften werden nicht bereinigt oder migriert. Ein Serverkonflikt bleibt sichtbar und erfordert den vorhandenen geprüften Abgleich.

Abnahme: isolierte Firebase-Emulatoren und kopierte Testkunden. Produktives Firebase-Projekt, native Safari/iPad/iPhone und echte Drucker werden in dieser Umgebung nicht angemeldet getestet. Das Paket veröffentlicht selbst weder Regeln noch Hosting-Dateien.
