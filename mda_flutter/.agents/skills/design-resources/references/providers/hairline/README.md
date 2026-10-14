# Hairline

> Generierte Leseansicht. Angaben nur im zentralen [Katalog](../../DESIGN_RESOURCES.md) ändern; danach `scripts/build_references.py` ausführen.

- **Name / URL:** [Hairline](https://hairline.lucasmarkes.com/).
- **Priorität / Angebot:** Spezialisierte Quelle für **27 interaktive isometrische Linienfiguren**: unter anderem Geräte, Schrank/Drawer, Schloss/Vault, Router, Terrain und abstrakte Figuren. SVG reagiert auf den Zeiger; kein allgemeines Iconset oder UI-Kit.
- **Technologie / Free:** Paket `@lucasmarkes/hairline`; React-Komponenten und Vanilla-DOM-Funktionen, ESM, ohne zusätzliche Dependencies. [Repository](https://github.com/lucasmarkes/hairline).
- **Kommerziell / Nennung:** **Ja, MIT**, MIT-Regel. [LICENSE](https://raw.githubusercontent.com/lucasmarkes/hairline/main/LICENSE).
- **Schnellster Zugriff:** **[llms.txt](https://hairline.lucasmarkes.com/llms.txt)** enthält Figurenindex, Imports, Optionen und Einsatzwege. Danach [Docs](https://hairline.lucasmarkes.com/docs) bzw. einzelne Source-Datei. Dokumentierte [shadcn-Registry](https://hairline.lucasmarkes.com/r/hairline.json) ist ein alternativer Web-Zugang.
- **MCP:** Kein eigener MCP gefunden. Dokumentierter Skill zum Zeichnen eigener Figuren ist **kein MCP**; für diese Recherche genügt der Agent-Text.
- **Designwerte / Flutter – eigene Einschätzung:** Figuren füllen die Containerbreite bei 5:4-Seitenverhältnis; `intensity` standardmäßig 0,5, Bereich 0–1. Gut für Empty States, Onboarding und kleine Produktillustrationen. Statisches SVG gezielt exportieren/übertragen; Zeigerbewegung für Touch oder automatische, sparsame Bewegung neu umsetzen.
- **Grenzen / Tags:** Keine direkte Dart-Version bestätigt; Vanilla-Funktionen erzeugen/manipulieren DOM-SVG und sind keine fertigen Flutter-Assets. `svg`, `illustrations`, `line-art`, `isometric`, `empty-state`, `motion`.

**Prüfung, 2026-10-06:** Homepage, Docs, Agent-Referenz und vollständige MIT gelesen. Kein Registry-/SVG-Export oder Flutter-Rendering getestet.
