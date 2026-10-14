# AICSS

> Generierte Leseansicht. Angaben nur im zentralen [Katalog](../../DESIGN_RESOURCES.md) ändern; danach `scripts/build_references.py` ausführen.

- **Name / URL:** [AICSS](https://www.aicss.dev/).
- **Herkunft / Priorität:** Persönliche Sammlung; `zuerst ansehen` für kleine KI-Chat-/Statuskomponenten mit gut lesbarem CSS.
- **Typ / Technologie:** Komponenten für Agentenkonversationen; React-npm-Paket und CLI-Ausgabe für React, Vue und Svelte. Öffentliche Snippets mit eigenem CSS, keine generelle Tailwind-Pflicht.
- **Angebot:** Thinking-/Reasoning-Anzeigen, Orbs, Streaming-Text, Textantworten, Code-Blöcke, Quellen/Citations, Diffs, Daten-/Vergleichstabellen, Message Actions, Reasoning Effort und Secure Input. Kein kompletter allgemeiner App-UI-Katalog. [Übersicht](https://www.aicss.dev/)
- **Free-Regel:** Pro-Badges beachten. Zum Prüfzeitpunkt sind Audio Waves, Image Processing, To-do List, AI Agent Input und Approval Card Pro. Für Freigaben alternativ Halaska/Beautiful UI/beUI ansehen.
- **Kommerziell / Nennung:** Öffentliche Free-Komponenten und CLI MIT; kommerzielle Nutzung erlaubt, Copyright/Lizenz erhalten, keine sichtbare Nennung aus MIT. Private Website und Pro-Komponenten gehören nicht zur öffentlichen MIT-Freigabe; Pro hat eigene Regeln. [License](https://www.aicss.dev/license), [Terms](https://www.aicss.dev/terms), [MIT](https://github.com/kvnkld/aicss/blob/main/LICENSE)
- **MCP:** Kein eigener offizieller kostenloser MCP gefunden. Direkte Free-JSONs sind besonders schnell. shadcn-MCP kann kompatible Registries ansprechen; eine konkrete AICSS-Verbindung wurde nicht getestet.
- **Flutter-Einsatz – eigene Einschätzung:** CSS beschreibt Maße und Animationen nachvollziehbar. Ausgewählte Free-Komponenten in Flutter als einzelne Status-/Textwidgets umsetzen und mit dem eigenen Theme verbinden.
- **Tags:** `web-components`, `registry`, `chat`, `loading`, `tables`, `motion`, `dark-mode`.

**Schnellster Zugriff:**

1. Gewählte Free-Detailseite öffnen. `Preview` mit Light/Dark, `Install` mit shadcn/npm/CLI und `Code` mit Framework-Auswahl sind öffentlich erreichbar.
2. Für die geprüfte Komponente direkt [thinking-state.json](https://www.aicss.dev/r/thinking-state.json) lesen: enthält `ThinkingState.tsx` und `ThinkingState.module.css`. So entfällt eine Installation zur Code-Recherche.
3. Weitere Free-Quellen im [öffentlichen Repository](https://github.com/kvnkld/aicss) lesen. `@aicss/react` enthält Free-Code; Pro-CLI-Zugriff benötigt einen Account-Token. Tokens nicht für Free-Recherche voraussetzen.

| Referenz | Direktlink | Nutzen |
| --- | --- | --- |
| Thinking State | [Detail](https://www.aicss.dev/components/thinking-state) | Schimmernde Statuszeile; geprüftes CSS: 13 px Schrift, 18 px Zeilenhöhe, Gewicht 500 |
| Thinking + Reasoning | [Detail](https://www.aicss.dev/components/thinking-reasoning) | Klappbare Erläuterung des Arbeitszustands |
| Streaming Text | [Detail](https://www.aicss.dev/components/streaming-text) | Schrittweise Textausgabe |
| File Diff | [Detail](https://www.aicss.dev/components/file-diff) | Übersicht von Änderungen |
| Data Table / Inline Citations | [Tabelle](https://www.aicss.dev/components/data-table), [Quellen](https://www.aicss.dev/components/inline-citations) | Strukturierte Antwort und nachvollziehbare Referenzen |

**Grenzen:** UI-Demos erklären kein echtes Modell-Reasoning oder Streaming-Backend. Die sichtbare Reasoning-Ausgabe muss vom eigenen Produkt unterstützt sein. Komponentenbezogene CSS-Werte nach Theme-/Schriftgrößenanpassung bewerten.

**Prüfung, 2026-10-05:** Galerie/Pro-Badges, Free-Detail Thinking State und Framework-/Installauswahl im Browser geprüft. Öffentliches Registry-JSON mit TSX/CSS, Repository, Free-/Pro-Lizenz und Pricing gelesen. Keine CLI oder Installation ausgeführt.
