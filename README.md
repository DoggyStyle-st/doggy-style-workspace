# Doggy Style Workspace – GB381

Unter **Rechnungen → Freie Rechnung** kannst du einen Stammkunden auswählen oder Name und Anschrift direkt eingeben. Bei direkter Eingabe stehen die Angaben im Beleg und sind in der Rechnungssuche nach Name auffindbar.

Bei der ersten erfolgreichen Synchronisierung als Administrator erhalten bestehende Kunden eine feste Nummer wie K-0001. Neue Kunden erhalten ihre Nummer beim Speichern in Firebase. Die Nummer ist im Kundenprofil und auf der Rechnung sichtbar. Die Listen für Kunden, Aufenthalte und Rechnungen können nach ihr durchsucht werden.

Beim Wechsel vom Entwurf auf Offen, Bezahlt oder Storniert speichert der Beleg die damaligen Empfängerdaten. Ausgestellte Belege mit gespeicherten Empfängerdaten können anhand dieser Angaben erneut gedruckt werden.

Die Rechnung verwendet die gespeicherte Kundenanschrift. Straße und Hausnummer stehen über PLZ und Ort. Der Adressblock ist bei freien Rechnungen und Rechnungen aus einem Aufenthalt verfügbar.

Über **Rechnung drucken / PDF** öffnet sich die Vorschau. **PDF speichern** lädt die fertig gesetzte A4-Datei herunter. Mehrseitige PDFs haben eine eigene Seitennummerierung mit Platz unterhalb des Rechnungsinhalts.

Die Abrechnung zählt alle Kalendertage vom Anreisetag bis zum Abreisetag. Die Anzahl bestimmt auch die Preisstaffel. An Sonntagen und gesetzlichen Feiertagen am Standort Stiefenhofen fällt je Datum der hinterlegte Zuschlag an. Ein Feiertag am Sonntag erscheint als Feiertagszuschlag.

Kunden können in der Aufenthaltsanfrage Zusatz-Spaziergänge auswählen und die Stückzahl eingeben. Die Auswahl erscheint im Eingang und nach der Übernahme im Aufenthalt sowie in der automatischen Rechnung. Als automatisch gekennzeichnete Mengen aus alten Aufenthalten zählen bei der Neuberechnung als null.

Ein vorhandener, automatisch berechneter Entwurf wird beim Öffnen mit der neuen Berechnung aktualisiert. Seine Rechnungsnummer wird weiterverwendet. In der Rechnungsansicht löst **Aus Aufenthalt neu berechnen** eine ausdrückliche Aktualisierung aus. Für manuell bearbeitete Positionen erscheint dabei eine Bestätigung. Bezahlte und stornierte Rechnungen sind abgeschlossen.

INSTALLATION_IPAD.txt beschreibt die Installation. PRUEFBERICHT.md nennt die aktuellen lokalen Prüfungen. Die Abnahme am verbundenen Firebase und in Safari auf iPad und iPhone steht aus.
