# ObsidianUI

> Generierte Leseansicht. Angaben nur im zentralen [Katalog](../../DESIGN_RESOURCES.md) ändern; danach `scripts/build_references.py` ausführen.

- **Name / URL:** [ObsidianUI-Komponentengalerie](https://www.obsidianui.dev/components#component-gallery).
- **Persönliche Priorität:** **Favorit; zuerst ansehen** für sorgfältig ausgearbeitete Interaktionen und charakteristische Einzelkomponenten.
- **Angebot:** Account-Sessions, Statusleisten, Discover Button, Split Showcase, Bild-/Kunstgalerie, Hover Image, Draggable Marquee und Flip-/Stream-Text. Eine kleinere kuratierte Auswahl, kein nachgewiesener riesiger Basiskatalog.
- **Technologie / Free:** React, Tailwind und Motion. Galerie lädt interaktive Teile im Browser nach; Details und Registry-JSON sind öffentlich. Fotos/Kunst in Demos sind gesonderte Medien, kein pauschal lizenzierter Assetpack.
- **Kommerziell / Nennung:** **Ja, MIT** für den eigenen öffentlichen Code; MIT-Regel. [Source](https://github.com/Atharvsinh-codez/ObsidianUI), [LICENSE](https://raw.githubusercontent.com/Atharvsinh-codez/ObsidianUI/main/LICENSE).
- **MCP:** Anbieter dokumentiert **den kostenlosen allgemeinen shadcn-MCP mit Obsidian-Registry**, keinen eigenen gehosteten Server. Registry-Muster: `https://www.obsidianui.dev/r/{name}.json`, Namespace `@obsidian`. [CLI/MCP-Anleitung](https://www.obsidianui.dev/docs/cli). Nicht eingerichtet oder gestartet.
- **Schnellster Zugriff:** In der Galerie den Dokumentationslink wählen; dort Props und Zustände lesen. Für Code direkt das JSON der gewählten Komponente verwenden, zum Beispiel [active-sessions.json](https://www.obsidianui.dev/r/active-sessions.json). Enthält TSX, CSS und Utils; Dependencies `clsx`, `lucide-react`, `motion`, `tailwind-merge`.
- **Konkrete Referenzen:** [Active Sessions](https://www.obsidianui.dev/docs/active-sessions) für Geräte-/Accountverwaltung; [Text reel](https://www.obsidianui.dev/docs/text-stream) für Textbewegung. Active Sessions dokumentiert Loading, fehlgeschlagene Abmeldung, Tastatur-/Screenreader-Hinweise, schmale Container und reduzierte Bewegung. Spinner erst nach 150 ms; Statusfarben per CSS-Variablen.
- **Flutter – eigene Einschätzung:** Sessions-Liste besonders gut für Settings/Security; das tatsächliche Abmelden benötigt die eigene Backend-Anbindung. Galerie-/Hovereffekte auf Touch übertragen. Web-Container-Queries durch verfügbare Flutter-Layoutinformation ersetzen.
- **Tags:** `web-components`, `registry`, `settings`, `lists`, `notifications`, `text-transition`, `motion`, `accessibility`.

**Prüfung, 2026-10-06:** Galerie im Browser, CLI/MCP-Doku, Sessions-/Text-Details, Sessions-JSON und vollständige MIT gelesen. Dokumentierte Qualitätshinweise sind kein eigener vollständiger Nutzungs-/Accessibility-Test.
