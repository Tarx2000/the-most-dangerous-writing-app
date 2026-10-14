# Inspo

> Generierte Leseansicht. Angaben nur im zentralen [Katalog](../../DESIGN_RESOURCES.md) ändern; danach `scripts/build_references.py` ausführen.

- **Name / URL:** [Inspo](https://inspomcp.dev/).
- **Herkunft / Priorität:** Persönliche Sammlung; `zuerst ansehen` für Layout-/Stilrecherche per kostenlosem MCP.
- **Typ / Technologie:** Kuratiertes Website-/Screen-Archiv, strukturierte Designanalysen und eigene React-/Tailwind-Referenzkomponenten.
- **Angebot:** Desktop-/Mobile-Screens, Farben, Fonts, Seitenarten, Stilrichtungen und Seitenstrukturen. Zusätzlich eigene Referenzen für Hero, Pricing, Features, CTA, Navigation, Footer, Testimonials, Logo-Cloud, FAQ und Statistiken. Dies sind überwiegend Website-Sektionen, keine vollständige native App-Bibliothek. [About](https://inspomcp.dev/about), [MCP-Angebot](https://inspomcp.dev/mcp)
- **Kosten / MCP:** Gehosteter Dienst kostenlos ohne Anmeldung/Schlüssel; IP-Rate-Limits. Direkter HTTP-MCP: `https://inspomcp.dev/api/mcp`. Optionales npm-Paket `inspo-mcp`; Installation ist für den Remote-Zugriff nicht erforderlich. [Offizielles Repository](https://github.com/Nutlope/inspo)
- **Kommerziell / Nennung:** Eigener Tool-/Referenzcode MIT; Copyright und Lizenz erhalten, keine sichtbare UI-Nennung aus MIT. Screenshots, Original-Websites, Markenassets und fremde Fonts sind gesonderte Referenzinhalte. Die MIT-Lizenz des Projekts ist keine Erlaubnis, sämtliche dargestellten Websites zu kopieren. [MIT](https://github.com/Nutlope/inspo/blob/main/LICENSE)
- **Flutter-Einsatz – eigene Einschätzung:** Gut für Bildschirmhierarchie, Farb-/Schriftrollen und Pricing-Strukturen. Eigene Referenz-JSX-Komponenten in Flutter umsetzen; Web-Screens für mobile Bedienung anpassen.
- **Tags:** `mcp`, `screen-gallery`, `design-md`, `design-tokens`, `web-components`, `templates`, `typography`.

**Schnellster Zugriff:** Mit dem Remote-MCP gezielt recherchieren. Die Namen unten sind im Live-Toolverzeichnis bestätigt; Argumente aus dem aktuellen Schema lesen, keine Screen-Slugs erfinden.

| Bedarf | Werkzeug / Ablauf | Ergebnis und Grenze |
| --- | --- | --- |
| Passende Richtung zu einem Briefing | `recommend` mit `brief`; optional `device: mobile`, `detail: concise`, `maxTokens` | Wenige passende Beispiele und Strukturvorschlag statt kompletter Archivabfrage |
| Screen oder Stil finden | `search_screens` → `get_screen` | Suchfilter u. a. Stil, Branche, Seitenart, Modus und Gerät; `get_filters` liefert verfügbare Werte |
| Designwerte einer Referenz | `get_design_system` mit gefundenem `slug` | `live: false` vermeidet zusätzliche Originalseiten-Abfrage; extrahierte Werte prüfen |
| Ausschnitt einer echten Website | `find_components` mit `type` | Visuelle Referenzen; liefert keine pauschale Code-/Asset-Lizenz |
| Eigenen wiederverwendbaren Code finden | `find_reference_components` → `get_reference_jsx` | Tatsächlicher Referenz-JSX; zwei verschiedene Werkzeuge gegenüber der Screenshot-Suche |
| Pricing-Beispiel | `get_reference_jsx` mit `type: pricing`, `id: three-card` | Im Test Quellcode für drei Tarifkarten geliefert; vertikal für kleine App-Screens anpassen |

**Grenzen:** Statische/erfasste Screens sind kein Beweis für die aktuelle Originalwebsite. Screenshots und extrahierte Stilprofile erklären Gestaltung, ersetzen aber keine Prüfung von App-Zuständen, Touch-Verhalten und Accessibility. Archiv-Recherche und eigene Referenzbibliothek getrennt auswählen.

**Prüfung, 2026-10-05:** Angebot, MCP-Dokumentation, Repository und MIT gelesen. Remote-Initialize ohne Authentifizierung erfolgreich; 15 Werkzeuge gelistet. Pricing-Referenzen und `three-card`-JSX live abgerufen. Kein MCP-Client eingerichtet und keine Komponente integriert.
