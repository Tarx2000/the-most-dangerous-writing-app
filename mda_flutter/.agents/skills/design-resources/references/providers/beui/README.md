# beUI

> Generierte Leseansicht. Angaben nur im zentralen [Katalog](../../DESIGN_RESOURCES.md) ändern; danach `scripts/build_references.py` ausführen.

- **Name / URL:** [beUI](https://beui.dev/).
- **Herkunft / Priorität:** Persönliche Sammlung; `zuerst ansehen` für App-Interaktionen, Formulare, Motion und KI-Produktbausteine.
- **Typ / Technologie:** Öffentliche React-/Tailwind-/Motion-Komponenten, umfangreichere Blocks, KI-UI und Charts; separates bezahltes Pro-Angebot.
- **Angebot:** Inputs, Selects, Tabs, Switches, Bottom Sheet, Drawer, Modals, Kalender-/Range-/Wheel-Picker, sortable und swipeable Listen, Pull-to-refresh, Toasts, Bildansichten, OTP, Suche sowie Chat-/Voice-/Streaming-/Approval-Bausteine. Dokumentierter Stack React 19, Tailwind 4 und Motion; konkrete Abhängigkeiten aus dem ausgewählten Eintrag lesen. [Übersicht](https://beui.dev/)
- **Kosten / Lizenz / Nennung:** Öffentliche Bibliothek MIT, kommerziell nutzbar; Copyright Saurabh Chauhan und Lizenz erhalten, keine sichtbare UI-Nennung aus MIT. Pro ist separat und gehört nicht zur freigegebenen Auswahl. [MIT](https://github.com/starc007/ui-components/blob/main/LICENSE)
- **MCP:** Offiziell öffentlich dokumentiert unter `https://mcp.beui.dev/mcp`, ohne Preis-/Tokenanforderung in der [Anleitung](https://beui.dev/docs/ai-agents). Werkzeuge für Liste, Suche, Komponentendetail und Installbefehl. **Live-Aufruf hier HTTP 403**; tatsächlicher kostenloser Zugriff nicht erfolgreich bestätigt. Nicht verbunden.
- **Flutter-Einsatz – eigene Einschätzung:** Besonders passend für mobile Gesten, Sheet-Zustände und klare Controls. Web-Mechanik für Portals, DOM-Fokus und Scroll-Lock durch passende Flutter-Mechanik ersetzen.
- **Tags:** `web-components`, `registry`, `mcp`, `bottom-sheet`, `forms`, `inputs`, `lists`, `touch`, `chat`, `motion`.

**Schnellster Zugriff:** Zuerst [llms.txt](https://beui.dev/llms.txt), am 06.10.2026 erfolgreich gelesen; [Agent-Dokumentation](https://beui.dev/docs/ai-agents) erklärt weitere Wege. `llms.txt` bzw. Registry-Verzeichnis lesen, echte `items[].name`/Slugs wählen und nur den passenden Eintrag abrufen. Dokumentierte Wege:

- [MD-Index](https://beui.dev/llms.txt), [Registry-Index](https://beui.dev/r), [shadcn-Katalog](https://beui.dev/registry.json).
- `/r/{slug}` liefert Detail/Dateien/Abhängigkeiten, `/r/{slug}.json` einen shadcn-Eintrag, `/r/{slug}/raw` TSX.
- Bei HTTP 403 die lesbare Komponentendokumentation oder das [öffentliche Repository](https://github.com/starc007/ui-components) nutzen; keine Zugriffsberechtigung aus einer URL allein behaupten.

| Referenz | Direktlink | Nutzen / beobachtetes Detail |
| --- | --- | --- |
| Bottom Sheet | [Detail und Source](https://beui.dev/components/motion/bottom-sheet) | Snap-Points, Drag/Fling und Schließen; Code berücksichtigt reduzierte Bewegung und Scroll-Lock. Normaler Öffnungs-Tween 0,5 s, reduziert 0,18 s. |
| OTP Input | [Detail](https://beui.dev/components/blocks/otp-input) | Code-Eingabe als Alternative zu Kobra Free |
| Sortable List | [Detail](https://beui.dev/components/motion/sortable-stack) | Animiertes Neuordnen |
| Toast Stack | [Registry-Einstieg](https://beui.dev/r/animated-toast-stack.json) | Dokumentiertes Beispiel für Benachrichtigungen und JSON-Zugriff |
| Multi-chain Swap | [Detail](https://beui.dev/components/motion/swap) | Kompakter Auswahl-/Transaktionsdialog; enthält keine echte Chain-Anbindung |

**Grenzen:** UI-Behauptungen wie „self-contained“ anhand mitgelieferter Helpers/Dependencies prüfen. Zugänglichkeitshinweise im Quellcode sind keine durchgeführte Accessibility-Prüfung. npm-/Registry-Installation ist eine React-Integration und nicht für die reine Flutter-Recherche nötig.

**Prüfung, 2026-10-05; erneute Ergänzung 2026-10-06:** Übersicht, Agent-Dokumentation, Lizenz und mehrere Detailseiten gelesen; Bottom-Sheet-Quellcode untersucht. Der MD-Index `llms.txt` war am 06.10. lesbar und enthält gezielte Komponentenlinks. Die vorherigen MCP-/Registry-Tests erhielten HTTP 403; daraus keine aktuelle erfolgreiche MCP-Verbindung ableiten. Keine Installation, authentifizierte Verbindung oder Flutter-Integration.
