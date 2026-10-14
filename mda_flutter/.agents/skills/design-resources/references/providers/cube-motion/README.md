# Cube

> Generierte Leseansicht. Angaben nur im zentralen [Katalog](../../DESIGN_RESOURCES.md) ändern; danach `scripts/build_references.py` ausführen.

- **Name / URL:** [Cube](https://www.cube-motion.dev/).
- **Einordnung:** Kleine **JavaScript-Animationsbibliothek**, kein Katalog fertiger Buttons/Formulare. Vier Bewegungsprimitives: `rise`, `leave`, `morph`, `reveal`.
- **Angebot / Designwerte:** Vorgegebene Bewegungswerte: Rise 640 ms mit 70 ms Staffelung und 12 px Versatz; Leave 320 ms/40 ms/12 px; Morph 220 ms mit 130 ms Vorlauf. Reveal startet beim Eintritt in den Viewport. Fokus auf verständliche Zustandswechsel statt frei konfigurierbarer Timelines.
- **Technologie / Free:** Web Animations API und IntersectionObserver; Core ohne Abhängigkeiten, Adapter für React/Vue/Solid/Svelte. Öffentliches Paket `cube-motion` und [Source](https://github.com/danielwh2/cube-motion).
- **Kommerziell / Nennung:** **Ja, MIT**, MIT-Regel. [LICENSE](https://raw.githubusercontent.com/danielwh2/cube-motion/main/LICENSE).
- **MCP / schnellster Zugriff:** Kein eigener MCP gefunden; **[llms.txt](https://www.cube-motion.dev/llms.txt)** enthält die kompakte Agent-Referenz. Danach nur benötigte API-/Adapterabschnitte lesen. llms.txt ist kein MCP.
- **Flutter – eigene Einschätzung:** Sehr brauchbare Bewegungsrezepte für Controls und Listen; Zeitwerte, Staffelung und Zustandslogik in Dart übertragen. Web-APIs sind nicht direkt ausführbar. Dokumentierte Reduced-Motion-Regeln übernehmen.
- **Grenzen / Tags:** Keine vollständige Gesten-, Layout- oder Timeline-Engine. `motion`, `micro-interactions`, `text-transition`, `lists`, `reduced-motion`.

**Prüfung, 2026-10-06:** Homepage/API-Überblick, Agent-Text und vollständige MIT gelesen; keine Laufzeit-/Flutter-Prüfung.
