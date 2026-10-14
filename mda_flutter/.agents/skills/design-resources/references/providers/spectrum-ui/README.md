# Spectrum UI

> Generierte Leseansicht. Angaben nur im zentralen [Katalog](../../DESIGN_RESOURCES.md) ändern; danach `scripts/build_references.py` ausführen.

- **Name / URL:** [Spectrum UI](https://ui.spectrumhq.in/).
- **Persönliche Priorität:** **Favorit; zuerst ansehen** für produktnahe Komponenten, Blocks, Charts und Farbwerte.
- **Angebot:** Controls, animierte Cards/Drawer, Suche, Tabellen, Kalender-/Range-Eingaben, KI-Chat, Account-/Activity-/Finance-Blöcke, Kanban, Hold-to-confirm, Swipe-to-delete und Toasts. [Colors](https://ui.spectrumhq.in/colors) zeigt Tailwind-Farbfamilien mit Abstufungen 50–950 und kopierbaren HEX/RGB/HSL-Werten. Eine Palette ist noch kein vollständiges semantisches App-Theme.
- **Technologie / Free-Zugang:** React/Next.js, TypeScript, Tailwind, Motion und shadcn/ui. Öffentliches Angebot laut Anbieter kostenlos. **Geprüfte Drawer-Seite verlangt ein Free-Konto für Code und Installbefehl.** Der öffentliche [GitHub-Source](https://github.com/arihantcodes/spectrum-ui) ist ein Zugang ohne diese Website-Codeansicht.
- **Kommerziell / Nennung:** **Ja, Apache 2.0**, keine MIT-Lizenz. [Vollständige Lizenz](https://raw.githubusercontent.com/arihantcodes/spectrum-ui/main/LICENSE). Lizenz und relevante Copyright-/Attributionshinweise erhalten; Änderungen kennzeichnen und mitgelieferte NOTICE-Hinweise gegebenenfalls übernehmen. Keine allgemeine sichtbare „Powered by“-Pflicht aus Apache 2.0; Markenrechte nicht enthalten.
- **Kostenloser MCP:** Offiziell dokumentiertes lokales Paket `@spectrumui/mcp`, Aufruf `npx -y @spectrumui/mcp`; Node 18+. `list_components`, `search_components`, `get_component`, `list_categories`, `install_component`. [MCP-Dokumentation](https://ui.spectrumhq.in/docs/mcp). `components.json` wird für die React-Installation benötigt, nicht für den reinen Vergleich. Server nicht gestartet; Konto-/Registry-Zugriff im MCP nicht live getestet.
- **Schnellster Zugriff:** Vorhandenen MCP lesend durchsuchen oder Website-Navigation → Detail; bei Login-Schranke gezielt im Repository suchen. Farben direkt über `/colors`; passende Farbwerte statt des ganzen Katalogs lesen.
- **Konkrete Referenz:** [Animated Drawer](https://ui.spectrumhq.in/docs/animateddrawer) für Einstellungen/mobile Navigation. Dokumentierte Dependencies: `lucide-react`, `motion`, `vaul`, `react-use-measure`. Die Detailseite meldet **keinen erkannten Reduced-Motion-Pfad**; vor Übernahme ergänzen/prüfen.
- **Flutter – eigene Einschätzung:** Sehr passend für ein konsistentes Produkt-UI. Controls und Blocks portieren; Gesten, Fokus, Overlay und Theme auf Flutter abstimmen. Großflächige Web-/3D-Effekte einzeln auf Aufwand prüfen.
- **Tags:** `web-components`, `blocks`, `mcp`, `color`, `charts`, `forms`, `cards`, `chat`, `touch`, `motion`.

**Prüfung, 2026-10-06:** Angebot, Colors, Drawer-Detail, MCP-Dokumentation und vollständige Apache-Lizenz gelesen. Website-Codezugang mit Free-Login-Schranke beobachtet; keine Anmeldung, MCP-Verbindung oder Installation.
