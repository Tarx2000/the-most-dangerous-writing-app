# Feral Stamp

> Generierte Leseansicht. Angaben nur im zentralen [Katalog](../../DESIGN_RESOURCES.md) ändern; danach `scripts/build_references.py` ausführen.

- **Name / URL:** [Stamp · FeralUI](https://feralui.dev/stamp).
- **Priorität / Angebot:** Einzelner, sehr charakteristischer **Rechnungs-Datumspicker als 3D-Stempel**: Tag/Monat/Jahr rollen, Status und Tintenfarbe wählen, Datum stempeln, Undo. FeralUI hat weitere Demos; diese Quelle wird gezielt als Stamp geführt.
- **Zugang / Technik:** Öffentliche Demo mit Bewegungs-/Sound-Einstellungen. [Stamp-Repository](https://github.com/mortspace/stamp) enthält README, `src`, CSS und Props. React 19, Motion und Torph; CSS-Perspektive statt Video. Zum Lesen ist kein Download/Install nötig.
- **Kosten / Kommerziell / Nennung:** Veröffentlichter Stamp-Code **MIT**, kommerziell erlaubt; MIT-Regel. [LICENSE](https://raw.githubusercontent.com/mortspace/stamp/main/LICENSE), [FeralUI Terms](https://feralui.dev/terms). Terms unterscheiden veröffentlichte MIT-Pakete und nur gezeigte, unveröffentlichte Demos.
- **Sounds / Designwerte:** Stamp erzeugt Tick, Aufprall und Chime mit Web Audio; keine Sounddateien. README dokumentiert `timing` in Sekunden, fünf Tintenfarben, vier Statusvarianten und ein angepasstes Telefonlayout. Geladene Fonts haben eigene Lizenzen.
- **MCP / schnellster Weg:** Kein eigener MCP gefunden. Demo zum Verstehen, dann [README](https://github.com/mortspace/stamp#readme) und ausgewählte Dateien wie `timing.ts`, `Wheel.tsx`, `sound.ts` lesen.
- **Flutter – eigene Einschätzung:** Gute Referenz für markante Bestätigung, Beleg- oder Rechnungsabläufe; räumliche Szene deutlich aufwendiger als ein gewöhnlicher Picker. Native Touch-Auswahl und eine reduzierte Bewegungsvariante verwenden.
- **Qualität / Grenze:** README beschreibt Tastaturbedienung, ungültige Monatsdaten, Undo und reduzierte Bewegung. Das ist dokumentiertes Verhalten, keine eigene vollständige Accessibility-Prüfung. Demo führt keine echte Zahlung aus.
- **Tags:** `calendar`, `picker`, `confirmation`, `motion`, `sounds`, `playful`, `3d`.

**Prüfung, 2026-10-06:** Demo im Browser, README, Terms und vollständige MIT gelesen. Kein Paket gestartet oder Flutter-Port getestet.
