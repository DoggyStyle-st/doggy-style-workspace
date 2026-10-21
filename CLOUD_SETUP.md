# Bestehendes Firebase-Projekt – GB375

Projekt doggy-style-hundepension, Organisation doggystyle und Bucket doggy-style-hundepension.firebasestorage.app bleiben erhalten.

Für dieses Update müssen keine Firestore- oder Storage-Regeln geändert werden. Beide Regeldateien und die Firebase-Konfiguration sind unverändert gegenüber GB374. Wer von GB374 aktualisiert und dessen Regeln bereits veröffentlicht hat, übernimmt nur die vollständigen neuen App-Dateien. REGELN_ANZEIGEN.html liegt für spätere Einrichtung weiterhin bei.

Die neue Sync-Prüfung verwendet bestätigte Serverstände und den gespeicherten Ausgangsstand. Kunden, Hunde, Fotos, Dokumente, Verträge, Einwilligungen, Signaturen und unbekannte Datenfelder werden weiterhin vollständig verglichen. Nur Transportzeitstempel und ausdrücklich bekannte Ansichtspräferenzen werden nicht als fachliche Änderung bewertet. Eine laufende Veröffentlichung oder eine neu erfasste Änderung wird nicht durch einen passenden alten Snapshot als erledigt markiert.

Lokale Fallback-Daten werden nicht gelöscht. Die dauerhafte IndexedDB-Kopie merkt sich zusätzlich, welche unveränderte Fallback-Kopie beim Abgleich bereits berücksichtigt wurde. So wird diese alte Kopie nicht erneut als ungesendet geladen. Eine danach tatsächlich neue Fallback-Fassung aus einem anderen Tab wird weiterhin erkannt. Konfliktsicherungen werden beim erneuten Anmelden wieder aus dem Gerätespeicher geladen und sind in der lokalen Sicherung enthalten.

Der Vergleich veröffentlicht nur nach einer ausdrücklichen Auswahl. Lokales sichern und Serverstand anzeigen schreibt keine Kundendaten in Firebase. Dafür wird die lokale Fassung zuerst dauerhaft gesichert. Ausgefallener Gerätespeicher verhindert das Verwerfen. Während ein Vergleich offen ist, umgehen weder automatisches noch manuelles Cloud-Speichern die Prüfung.

Separate Statistikdaten und Korrekturen bleiben unverändert. Bewertungen sichern (JSON) enthält den sichtbaren Statistikstand; eine administrative Rohsicherung müsste auch statistics, stats und statisticChanges umfassen.

Tests erfolgen ausschließlich in isolierten demo-Emulatorprojekten. Eine vollständige angemeldete Live-Abnahme und native Safari-/iOS-Prüfung bleiben offen.
