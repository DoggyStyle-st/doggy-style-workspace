# GB359 – Kundenvertrag: Sofortkorrektur

- Kundenvertrag darf nur eigenen Kunden und eigene Hunde auswählen.
- Fremde Vertragshistorie wird im Kundenmodus ausgeblendet und aus der Vertragsliste entfernt.
- Unterschrift wird bis zur Einreichung nur temporär gehalten.
- Kunden-Speichern erzeugt ausschließlich einen `boarding_contract`-Vorschlag in `proposals` und `tasks`, keinen gültigen Workspace-Vertrag.
- Erst Admin-Prüfung darf einen gültigen Vertrag erzeugen.
- Cloud-Fehler werden nicht als erfolgreiche Übertragung ausgegeben.

**Wichtig:** Dies ist eine clientseitige Sofortkorrektur. Firestore-Regeln schützen bereits `meta` vor Kunden, aber die zentrale Kundenzuordnung zu `customerId`/`petId` muss für vollständige Sicherheit serverseitig mit einer autoritativen Zuordnung abgesichert werden. Bestehende fehlerhaft erstellte Verträge sind nicht automatisch bereinigt. Echte End-to-End-Tests mit produktivem Firebase fehlen.
