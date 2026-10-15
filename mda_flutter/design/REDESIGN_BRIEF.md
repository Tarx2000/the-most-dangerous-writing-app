# Redesign – Stand des Interviews

Stand: 15. Oktober 2026. Dieser Brief dokumentiert die bestätigten Entscheidungen.
Die Umsetzung und ihre Prüfungen werden in `PORT_AUDIT.md` nachgeführt.
Quelle der Entscheidungen: Grill-Me-Runden
Q1–Q46 im zugehörigen Gespräch. Der Nutzer hat den Brief bestätigt und die
Umsetzung ausdrücklich beauftragt.

## Richtung und bestehende Funktionen

- Die gelieferten Screenshots geben die gestalterische Richtung vor.
  Fehler und Widersprüche der HTML-Mockups werden korrigiert.
- Vollständiges Redesign der App, mit Wiederverwendung geeigneter Flutter-
  Komponenten, Domain-Logik, Provider, Repositories und Datenmodelle.
- AMOLED-Schwarz, ruhige dunkle Glasflächen, präzise Konturen, klare Typografie.
  Keine ambienten Hintergrundlichter. Inhalte und Diagramme bleiben ruhig;
  Glas konzentriert sich auf Navigation und Bedienelemente.
- Bestehendes `liquid_glass_easy` 5.0.0 verwenden. Navbar als gute Grundlage
  erhalten; andere Kontrollen gezielt konfigurieren und am Gerät prüfen.
  Tatsächliche Refraktion und Paketinteraktion erhalten; Performance messen.
- Glas ist bei neuen Installationen standardmäßig aktiviert. Vorhandene
  gespeicherte Einstellungen respektieren; Classic und technische Fallbacks
  bleiben erhalten.
- Vier Modi und bestehende Gesten erhalten: Modi wechseln in Start und Library,
  horizontaler Wechsel Start/Library, Feed per vertikalem Reveal.
- Produktname und vorhandene Bereichsbezeichnungen bleiben zunächst bestehen.
  Kein automatisches Rebranding zu „Dangerous Journal“ oder „Life Alignment“.
- Schreibschrift- und Lesegrößenauswahl bleiben erhalten. Neue UI-Typografie
  darf die persönliche Schriftwahl im Editor nicht überschreiben.
- Systemstatusleiste bleibt verborgen; sichere Bildschirmränder beachten.
- Das erwähnte „Akkordeon“ war ein Versprecher und ist kein Arbeitsauftrag.
- Vorhandene Daten-, PIN-, Sicherheits-, Backup-, AI-, Vlog- und Medienfunktionen
  erhalten. Keine Funktion allein wegen ihres Fehlens im Mockup entfernen.

## Schreiben und Gefahr

- EASY/MID/HARD bleiben 12/8/5 Sekunden Inaktivitätslimit.
- Dauer bleibt 3/5/10/15/30/60 Minuten; Vlog-Dauern bleiben separat erhalten.
- Tweet bleibt 45 Wörter, ohne Session-Countdown oder Tod durch Inaktivität.
- Während des Schreibens möglichst nur Restzeit, Wortzahl und Text zeigen.
  Keine Modusüberschrift oder neue „Flow Locked / Tolerance“-Fußzeile.
  Zustandsabhängige Speicher- und Verlustaktionen bleiben erhalten.
- Verdunkelung beibehalten. Den roten Gefahreneffekt anhand der aktuellen
  Laufzeitdarstellung neu abstimmen; keine Countdown-Warnbanner hinzufügen.
- Optisches Auflösen ist eine Vorschau. Tatsächlicher Textverlust folgt weiter
  der Session-Engine und den bestätigten Spielregeln.
- Erklärende Hero-Unterzeilen und „Zero Inactivity Mercy“ entfallen.
  Kurzformat und weitere vorhandene Aktionen bleiben erreichbar.

## Wohlbefindens-Check-in

- Erst eigene Gesamteinschätzung: aktuelle Lebenszufriedenheit.
- Danach optional ein Wheel of Life mit acht festen Ausgangsbereichen:
  Gesundheit, Arbeit/Beruf, Finanzen, Familie/Freunde, Partnerschaft,
  persönliche Entwicklung, Freizeit/Erholung, Wohnumfeld.
- Globale Einschätzung und Lebensbereiche verwenden ganze Werte von 0 bis 10.
  Masteries sind davon getrennte Ziele und Messungen.
- Normale Slider sind die bevorzugte Eingabe. Keine Tastatur für Bewertungen.
  Das Lebensrad dient vor allem Überblick und interaktivem Vergleich.
- Unberührte Regler gelten als unbeantwortet; keine automatisch gespeicherten
  Mittelwerte. Bereiche dürfen ausgelassen werden.
- Täglicher kurzer Gesamtwert optional; vollständiges Lebensrad ungefähr
  wöchentlich und zusätzlich jederzeit möglich.
- Ein aktualisierbarer Wohlbefindensdatensatz pro Tag. Der vollständige
  Check-in ergänzt den kurzen Tagesdatensatz. Bewertungen bleiben nur bis
  zur zugehörigen Grenze um 03:00 Uhr bearbeitbar; ältere Bewertungen können
  weder einzeln geändert noch einzeln gelöscht werden. Bewertungstage laufen
  lokal von 03:00 bis 02:59 Uhr, einheitlich für Check-ins, Diagramme,
  Masteries-Fälligkeit und adaptive Bewertungstage. Allgemeine Datenlöschung
  bleibt erhalten.
- Speichern funktioniert ohne Schreibreflexion und ohne Masteries.
- Eigene Gesamteinschätzung nicht durch einen Mittelwert des Rads ersetzen.
  Persönliche Reflexionshilfe; kein behaupteter psychologischer Gesamttest.
- Der passive goldene Erinnerungspunkt wird nach sieben Tagen seit dem letzten
  abgeschlossenen Lebensrad aktiv. Ein kurzer Gesamtwert verschiebt ihn nicht.
  Ein bewusst abgeschlossener Teil-Check-in zählt bei mindestens einem
  bewerteten Lebensbereich; Mastery-Fälligkeit wird separat angezeigt.
- Eine freiwillige Gesamtreflexion bleibt möglich. Optionale Schreibreflexionen
  pro vorgeschlagener Mastery und die wöchentliche Advice-Karte bleiben erhalten.
  Kurze Reflexionen: eine Minute, EASY mit zwölf Sekunden Inaktivitätslimit.

## Historie

- Library → Check-ins zeigt oben den Wohlbefindensverlauf und darunter die
  zugehörigen Reflexionstexte. Direkter Zugang aus dem Check-in führt dorthin.
- Gesamtwert oder einzelner Lebensbereich auswählbar; frühere Räder mit Datum
  interaktiv ansehen und vergleichen.
- Tatsächliche Kalenderabstände verwenden. Kleine Marker kennzeichnen echte
  eingegebene Datenpunkte.
- Fehlende Tage zwischen echten Punkten linear über die Zeit verbinden.
  Diese Abschnitte grau darstellen; keine zusätzlichen echten Punktmarker.
  Beispiel Montag 2, Freitag 10: visuelle Zwischenwerte 4/6/8.
- Geschätzte Verbindungen nur zur Darstellung erzeugen. Nicht als Messungen
  speichern und nicht für Mittelwerte oder Fälligkeit verwenden.
- Alte Ersatzanzeigen `alignmentScore ?? 5` sind keine historischen Messwerte.
  Fehlende Altdaten bleiben fehlend.
- Reine Bewertungen erscheinen in der Library-Historie. Der Feed bleibt an
  geschriebene Reflexionen gebunden.

## Masteries

- Eigener Bereich über den vorhandenen Masteries-Zugang oben; kein fünfter
  Hauptmodus. Persönliche Ziele bleiben vom Wohlbefindensrad getrennt.
- Bestehende Typen Bewertung/Zeit/Ja-Nein/Text erhalten. Konkrete Sollwerte,
  neue Einheiten, Zielgrenzen, höhere Zeitpräzision und Sollwert-Versionierung
  sind auf unbestimmte Zeit verschoben und nicht Teil dieser Umsetzung.
- Persistenter Schalter „Masteries im Check-in abfragen“, zunächst aktiviert.
  Ausschalten erhält den manuellen Zugang und die Ziele.
- Täglich am nächsten lokalen Kalendertag fällig; wöchentlich sieben lokale
  Kalendertage nach der letzten gespeicherten Bewertung. Neue Masteries sofort.
- Nur echte gespeicherte Bewertungen setzen die Fälligkeit zurück.
  Öffnen oder Überspringen tut dies nicht.
- Zufällige Auswahl ohne Dopplung mit Gewicht `(1 + overdueDays)^2`.
  1 Tag überfällig: Gewicht 4; 4 Tage: Gewicht 25. Das ist ein relatives Gewicht
  für eine einzelne Ziehung, keine pauschale Zusage zur Set-Inklusionschance.
- Maximal zwei tägliche bzw. drei wöchentliche Vorschläge, nur fällige aktive
  Ziele. Weniger fällige Ziele ergeben entsprechend weniger Vorschläge.
- Tagesvorschläge beim erneuten Öffnen erhalten. Gespeicherte Bewertungen
  aktualisieren die Fälligkeit.
- Adaptive Masteries wechseln nach der eingestellten Zahl unterschiedlicher
  Bewertungstage tatsächlich auf wöchentlich; Standard bleibt 14 Tage.
  Bewertungstage zählen unabhängig vom erreichten Zielwert.
- Manuelle Bewertung auf der Detailseite auch außerhalb der Vorschläge.
  Für Speicherung und Fälligkeit dieselbe Wirkung wie vorgeschlagene Bewertung.
- Eine aktuelle Bewertung pro Mastery und Tag. Weitere Bewertungen am selben
  Tag aktualisieren sie, ohne zusätzliche Fortschrittstage zu erzeugen.
- Nach Reaktivierung heute fällig, ohne angesammelten Überfälligkeitsbonus aus
  der Pause. Historie und bereits erreichter adaptiver Fortschritt bleiben.

## Icon

- Neues App-Icon mit Imagegen, schlicht, minimalistisch, modern, Stiftmotiv.
- Die ersten generischen Stiftsymbole waren zu schlicht. Die neue Runde soll
  durch eine eigenständige Form mehr Kreativität zeigen und klein lesbar bleiben:
  gefaltetes Metallband, skulpturale Glasfeder oder integrierter Tintenfluss.
- Das Glaslinsen-Icon aus dem Mockup wird nicht übernommen.
- Ausgewählt: A – Faltung, `output/imagegen/app-icon-creative-a-fold.png`.
- Aktuelle kreative Varianten und exakte Prompts:
  [A Faltung / B Glasfeder / C Tintenfluss](../output/imagegen/CREATIVE_ICON_OPTIONS.md).

## Laufzeitbefunde und Prüfung

- Installierte iPhone-18-Pro-Version mit Maestro angesehen; die Verdunkelung
  funktioniert. In der aufgenommenen Gefahrenphase liegt das Rot überwiegend
  in den Ecken. Verlauf am sichtbaren Schreibbereich neu ausrichten.
- Maestro-Viewer lief nach dem SimulatorKit-Kompatibilitätslink wieder;
  `verify` und mehrere empfangene MJPEG-Frames bestätigt.
- Globale Start-Alignment-Werte werden im bestehenden Router verworfen.
  Der neue Verlauf braucht echte unabhängig gespeicherte Check-in-Daten.
- Reale Geräte-/Profilingprüfung für Performance bleibt notwendig; Emulator-
  Screenshots oder Widgettests allein bestätigen keine Release-Performance.
- Nach Umsetzung: gezielte Domain-/Persistenztests, Slider/Touch/Cancel,
  kleine Displays/große Schrift, reduzierte Bewegung, Tastatur, beide
  Rendering-Modi sowie Backup-Round-trip einschließlich neuer Tabellen.

## Bewusst später

- Konkrete Mastery-Sollwerte bleiben auf unbestimmte Zeit verschoben.
- Relative Tages-/Wochenvergleiche sind ausschließlich in
  [FUTURE_IDEAS.md](FUTURE_IDEAS.md) vorgemerkt. Dazu jetzt keine Umsetzung
  und keine weiteren Fragen.
