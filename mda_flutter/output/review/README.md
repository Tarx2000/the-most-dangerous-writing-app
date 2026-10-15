# Redesign-Prüfung

15. Oktober 2026. Native Aufnahmen vom iPhone-18-Pro-Simulator mit iOS 27.

## Echte App

- [Startscreen mit Icon A](redesign-start-final.png)
- [Check-in](redesign-checkin-final.png)
- [Schreiben](redesign-writing-normal.png)
- [Ursprünglicher Gefahreneffekt, durch die Nachbesserung ersetzt](redesign-writing-danger.png)

## Isolierte Beispieldaten

Diese Ansichten wurden mit `tool/redesign_preview.dart` geprüft. Die enthaltenen
Bewertungen sind ausschließlich Beispieldaten in einer getrennten In-Memory-
Datenbank bzw. im Vorschauzustand und wurden nicht in die echte Historie geschrieben.

- [Verlauf mit echten Markern und grauen Lücken](redesign-history-final-preview.png)
- [Scrubben über eine geschätzte Verbindung](redesign-history-scrub-final-preview.png)
- [Masteries](redesign-masteries-preview.png)
- [Mastery-Regler](redesign-mastery-slider-preview.png)
- [Manuell gespeicherte Tagesbewertung](redesign-mastery-saved-preview.png)

Die letzten zwei Beschriftungsänderungen (Check-in-Zähler und
„Reflections“-Sortierhinweis) sind neuer als die gefüllten Verlaufsscreenshots.

## Prüfung

- Vollständige Suite: 252 bestanden, 1 übersprungen.
- Gezielte UI-Prüfungen: 28 bestanden; nach der punktgenauen Tagesgrenze
  weitere 36 bestanden.
- `flutter analyze`: sauber.
- Android-Release-Builds für ARMv7, ARM64 und x86_64 erfolgreich.
- [Rohe Frame-Zeiten](glass-slider-frame-timings.json): vier native Slider-
  Bewegungen, 686 Frames; Build p95 4,015 ms, Raster p95 3,033 ms.
  Debug-Simulatorwerte; keine Zusage zu physischen Geräten.

Nach der Prüfung wurde wieder der normale Einstieg `lib/main.dart` gestartet.
Weitere technische Nachweise und verbleibende Grenzen stehen in
[PORT_AUDIT.md](../../PORT_AUDIT.md).

## Nachbesserung: Glas und Schreiben

Native Simulatoraufnahmen, 15. Oktober 2026. Die folgenden Screenshots stammen
aus der isolierten Vorschau mit echten Widgets; keine persönlichen Daten wurden
hinzugefügt oder verändert.

- [Start: Minuten ohne Sekunden und New Tweet in Glas](polish-start.png)
- [Alle Feed-Filter aktiv](polish-feed-active.png)
- [Feed mit roten und neutralen Glasfiltern](polish-feed-mixed.png)
- [Vollständiger Unlock-Button](polish-library-unlock.png)
- [YOU DIED mit Glasaktion](polish-you-died.png)
- [YOU DIED mit geöffneter Tastatur](polish-you-died-keyboard.png)
- [Früher seitlicher Warnverlauf, Ratio 0,45](polish-danger-early.png)
- [Mittlerer Warnverlauf, Ratio 0,75](polish-danger-middle.png)
- [Späte flächige Warnunschärfe, Ratio 0,98](polish-danger-late.png)

Die neue Difficulty-Bar erreicht ihr Ziel in 180 ms; die Paketlinse ist laut
Frame-Test nach weniger als 600 ms vollständig zur Ruhe gekommen. Hold, Drag,
Abbruch und die dauerhafte Kontur sind weiterhin abgedeckt.

Gesamtsuite: **259 bestanden, 1 übersprungen**. Nach der letzten Korrektur der
44-px-Mindestbreite zusätzlich 8 betroffene Tests bestanden. Analyse sauber;
Android-Release für ARMv7, ARM64 und x86_64 gebaut.

[Frame-Zeiten der späten Warnstufe](polish-danger-frame-timings.json): 1005 Frames,
Build p95 1,024 ms, Raster p95 2,265 ms. Debug-Simulator mit statischem Beispieltext
und laufendem Heartbeat; keine Messung auf einem physischen Release-Gerät.

Zum Abschluss wurde `lib/main.dart` mit den bestehenden Daten erneut gestartet.
[Reguläre App nach der Nachbesserung](polish-start-production.png).

## Aktuelle Warnung nach Screenshot-Feedback

Die früheren `polish-danger-*`-Bilder zeigen den verworfenen Verlauf mit zwei
seitlichen Flächen. Die folgenden Aufnahmen ersetzen ihn:

- [Frühe Warnung: durchgehender Schleier](warning-v3-early.png)
- [Mittlere Warnung: gleichmäßige Fläche](warning-v3-middle.png)
- [Späte Warnung: vollständige Unschärfe](warning-v3-late.png)
- [Kompletter Übergang im echten Acht-Sekunden-Ablauf](warning-v3-transition.mp4)
- [Frame-Zeiten über den vollständigen Übergang](warning-v3-frame-timings.json)

Die Warnung deckt das gesamte Flutter-Fenster ab. Die Mitte ist von Anfang an
getönt; die dezente Seitenbetonung geht weich in die ganze Fläche über. Die
Timer-Schritte werden nur für die Darstellung geglättet, die Schreibmechanik
bleibt unverändert. Native Bildschirmtastaturen bleiben Systemoberflächen.

Abschließende Prüfung: 261 Tests bestanden, einer übersprungen; Analyse sauber.
Elf gezielte Prüfungen decken insbesondere Bildmitte, Animation und Vollbild
bei geöffneter Tastatur im Schreiben und Reflektieren ab.
Android-Release für ARMv7, ARM64 und x86_64 ebenfalls erfolgreich gebaut.
