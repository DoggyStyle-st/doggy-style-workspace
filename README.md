# Doggy Style Workspace – GB386

Im Kalender kannst du für einen Termin ein zugeordnetes Kundenkonto auswählen. Der Kunde erhält den Vorschlag im Chat und antwortet mit **Passt** oder **Passt nicht**. Die Rückmeldung erscheint im Tagesablauf und als neue Nachricht im Team-Chat. Bestätigte Termine erscheinen im Kundenportal unter **Meine Termine**. Ein neuer Zeitpunkt braucht eine erneute Zusage.

Unter **Rechnungen** stellst du den geprüften Beleg auf **Offen**. Mit **Rechnung an Kunden weitergeben** stellst du die Fassung gezielt im Chat des zugeordneten Kunden bereit. Der Kunde öffnet den Beleg dort, speichert ihn als PDF und sieht beim erneuten Öffnen den aktuellen Zahlungsstatus. Die Bankverbindung für Überweisungen kannst du in **Einstellungen → Bankverbindung für Rechnungen** hinterlegen.

Unter **Auswertungen** wählst du **Dieser Monat**, **Vormonat**, **Dieses Jahr** oder eigene Start- und Enddaten.

Oben rechts unter **Ansicht** wechselst du zwischen der gesamten Auswertung und den einzelnen Bereichen. **CSV speichern** exportiert die gewählte Ansicht für den eingestellten Zeitraum.

- Die Monatsübersicht ordnet Zahlungseingänge nach dem erfassten Zahlungsdatum ein. Aktuell offene Belege erscheinen im Monat ihres Rechnungsdatums, Stornos im Monat ihres Stornodatums.
- Brutto, enthaltene MwSt. und Netto stammen aus den gespeicherten Rechnungsbeträgen und Steuersätzen. Bezahlte Leistungen zeigen die Zuschläge als eigene Positionen.
- Ein bereits bezahlter und später stornierter Beleg erscheint als Zahlung am Zahlungsdatum und als Storno am Stornodatum. Die Stornospalte zeigt den Belegwert.
- Unter **Belegliste** kannst du nach Rechnungsnummer, Kundennummer, Name oder Hund suchen. Tippe auf die Rechnungsnummer, um die Rechnung zu öffnen. Beträge und Belegzahlen in der Monatsübersicht führen zu den zugehörigen Vorgängen.
- Unter **Bestätigte Belegung** siehst du die Hundetage für beide Betreuungsarten und die gemeinsame Kapazität. An- und Abreisetage zählen. Tage über Kapazität lassen sich im Kalender öffnen.
- Der CSV-Export enthält numerische Beträge. Bei der Belegliste werden auch die sichtbaren Such- und Vorgangsfilter angewendet. Vorgänge ohne zuordenbares Datum stehen in einer gesonderten Liste.

Unter **Kalender → + Termin** kannst du eigene Termine speichern, verschieben oder absagen. Wähle eine Erinnerung und aktiviere **Mitteilungen einschalten** auf jedem Gerät, das mitbekommen soll, wenn der Termin ansteht. Die Tagesansicht zeigt Termine sowie erfasste Bring- und Abholzeiten. Freie Hundeplätze gelten für beide Betreuungsarten zusammen.

Die Geräteanzeige im Kalender prüft die Registrierung in Firebase. Die Zeile am einzelnen Termin beschreibt das Ergebnis des damaligen Erinnerungsversuchs.

Unter **Kalender → Einladungen einrichten** können Administratoren die E-Mail-Adressen für Raphael und Anschi hinterlegen. Sobald der Mailversand eingerichtet ist, geht bei neuen Terminen standardmäßig an beide eine Kalendereinladung. Die Option lässt sich pro Termin abwählen. Setup und Geräteprüfung stehen in [CLOUD_SETUP.md](CLOUD_SETUP.md).

Unter **Rechnungen → Freie Rechnung** kannst du einen Stammkunden auswählen oder Name und Anschrift direkt eingeben. Bei direkter Eingabe stehen die Angaben im Beleg und sind in der Rechnungssuche nach Name auffindbar.

Bei der ersten erfolgreichen Synchronisierung als Administrator erhalten bestehende Kunden eine feste Nummer wie K-0001. Neue Kunden erhalten ihre Nummer beim Speichern in Firebase. Die Nummer ist im Kundenprofil und auf der Rechnung sichtbar. Die Listen für Kunden, Aufenthalte und Rechnungen können nach ihr durchsucht werden.

Beim Wechsel vom Entwurf auf Offen, Bezahlt oder Storniert speichert der Beleg die damaligen Empfängerdaten. Ausgestellte Belege mit gespeicherten Empfängerdaten können anhand dieser Angaben erneut gedruckt werden.

Die Rechnung verwendet die gespeicherte Kundenanschrift. Straße und Hausnummer stehen über PLZ und Ort. Der Adressblock ist bei freien Rechnungen und Rechnungen aus einem Aufenthalt verfügbar.

Über **Rechnung drucken / PDF** öffnet sich die Vorschau. **PDF speichern** lädt die fertig gesetzte A4-Datei herunter. Mehrseitige PDFs haben eine eigene Seitennummerierung mit Platz unterhalb des Rechnungsinhalts.

Die Abrechnung zählt alle Kalendertage vom Anreisetag bis zum Abreisetag. Die Anzahl bestimmt auch die Preisstaffel. An Sonntagen und gesetzlichen Feiertagen am Standort Stiefenhofen fällt je Datum der hinterlegte Zuschlag an. Ein Feiertag am Sonntag erscheint als Feiertagszuschlag.

Kunden können in der Aufenthaltsanfrage Zusatz-Spaziergänge auswählen und die Stückzahl eingeben. Die Auswahl erscheint im Eingang und nach der Übernahme im Aufenthalt sowie in der automatischen Rechnung. Als automatisch gekennzeichnete Mengen aus alten Aufenthalten zählen bei der Neuberechnung als null.

Ein vorhandener, automatisch berechneter Entwurf wird beim Öffnen mit der neuen Berechnung aktualisiert. Seine Rechnungsnummer wird weiterverwendet. In der Rechnungsansicht löst **Aus Aufenthalt neu berechnen** eine ausdrückliche Aktualisierung aus. Für manuell bearbeitete Positionen erscheint dabei eine Bestätigung. Bezahlte und stornierte Rechnungen sind abgeschlossen.

INSTALLATION_IPAD.txt beschreibt die Installation. PRUEFBERICHT.md nennt die aktuellen lokalen Prüfungen. Die Abnahme am verbundenen Firebase und auf iPad und iPhone steht aus.
