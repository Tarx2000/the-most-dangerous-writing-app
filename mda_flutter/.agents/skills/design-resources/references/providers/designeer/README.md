# Designeer

> Generierte Leseansicht. Angaben nur im zentralen [Katalog](../../DESIGN_RESOURCES.md) ändern; danach `scripts/build_references.py` ausführen.

- **Name / URL:** [Designeer · Components](https://www.designeer.xyz/components).
- **Typ / Zweck:** Kuratiertes **Verzeichnis externer Ressourcen**, keine einheitlich lizenzierte Komponentenbibliothek. Quellen und Motion-Tools werden verlinkt; die jeweilige Anbieter-Lizenz gilt.
- **Vollständig erfasster Abrufbestand:** Im Browser **124 Komponentenquellen plus 13 Motion-Quellen = 137 Einträge**. Alle sind mit Angebot, Zugangs-/Lizenzstand, MCP und Entscheidung in [Designeer-Vergleich](../../DESIGN_RESOURCES.md#designeer-vergleich) erfasst; günstige App-Kandidaten haben dort eine eigene Auswahl. Bereits bekannte Quellen bleiben in ihren bestehenden Profilen.
- **Schnellster Zugriff:** Zuerst die lokale Vergleichs-MD nach Aufgabe filtern. Für neue Recherche [llms.txt](https://www.designeer.xyz/llms.txt), [llms-full.txt](https://designeer.xyz/llms-full.txt), [mcp.json](https://designeer.xyz/mcp.json) oder den öffentlichen Browser-WebMCP nutzen. Erst anschließend eine passende Anbieterquelle lesen.
- **Kostenloser Browser-WebMCP:** Ohne Login im Browser lesend getestet: `get_section(section="components")` liefert URLs; zusätzlich `search_tools`, `list_sections`, `get_metadata`, `get_route_info`. **Kein gewöhnlicher gehosteter MCP-Endpoint bestätigt**; `mcp.json` beschreibt Browser-Tools und ist selbst kein Server.
- **Wichtige Zugriffsdifferenz:** Der getestete WebMCP lieferte nur **109 Komponentenquellen**, der anfängliche HTML-Abruf 109 + 11. Die Browserliste war vollständiger. Für Vollständigkeit sichtbaren Bestand, HTML und MCP vergleichen, statt blind die MCP-Antwort als gesamten Katalog zu behandeln.
- **Kommerziell / Nennung:** Verzeichnis lesen und Originalquellen recherchieren; keine pauschale Freigabe zum Kopieren fremder Komponenten, Assets oder des ganzen Designeer-Katalogs. Nutzungsrechte/Nennung sind pro Anbieter in der Vergleichsdatei hinterlegt.
- **Flutter – eigene Einschätzung / Grenze:** Effizient zur Entdeckung; viele Links führen zu Web-Marketing, Editoren, Premium-Angeboten oder Spezialeffekten. Kein Nachweis, dass alle Einträge die Anforderungen einer mobilen Flutter-App erfüllen.
- **Tags:** `directory`, `mcp`, `discovery`, `web-components`, `motion`, `comparison`.

**Prüfung, 2026-10-06:** Vollständige sichtbare Komponenten-/Motion-Liste im Browser erfasst, WebMCP lesend aufgerufen, alle 137 Anbieterlinks mindestens auf Übersicht/Zugang geprüft; vertiefte Lizenz-/MCP-/Source-Prüfung soweit erreichbar. Einzelne gesperrte, pausierte oder unklare Quellen sind in der Vergleichsdatei ausdrücklich begrenzt. Kein vollständiger Qualitätsaudit aller Komponenten.
