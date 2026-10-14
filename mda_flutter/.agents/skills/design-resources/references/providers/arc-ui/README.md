# Arc UI

> Generierte Leseansicht. Angaben nur im zentralen [Katalog](../../DESIGN_RESOURCES.md) ändern; danach `scripts/build_references.py` ausführen.

- **Name / URL:** [Arc UI · Button](https://uiarc.dev/components/button).
- **Priorität / Angebot:** Gute produktnahe Quelle für Actions, Text-/Spezialeingaben, Picker, Menüs, Sheets/Dialoge, Feedback, Charts, Tabellen, Media, Textmotion und größere Blocks. Detailseiten erklären Einsatz, Gegenfälle, Props, Tastatur, Accessibility, Motion, Responsive und Performance.
- **Technologie / Free:** React mit CSS-Modulen, gemeinsamen Tokens und Motion; shadcn-Registry. **Free-Filter verwenden**; Pro bleibt ausgeschlossen. Der gelieferte Button ist Free; fortgeschrittene Charts und viele Blocks sind Pro.
- **Kommerziell / Nennung:** **Free-Code MIT**, kommerziell erlaubt, MIT-Regel. [Anbieter-Lizenz mit vollständigem MIT](https://uiarc.dev/license). Die Seite nennt Stand 26.09.2026 und kennzeichnet ihren Rechtstext als Entwurf; beim gewählten Source den mitgelieferten Lizenzstand festhalten. Pro-Lizenz nicht für Free-Code voraussetzen.
- **Gratis-MCP:** Offizieller Remote-Server `https://uiarc.dev/api/mcp`; **kostenloses Konto und Browser-Anmeldung erforderlich**. Tools `search_components`, `list_components`, `get_component`, `get_install_command`, `get_skill`; Pro-Zugang folgt separat dem Tarif. [AI/MCP-Doku](https://uiarc.dev/docs/ai). Nicht verbunden oder authentifiziert.
- **Schnellster Zugang ohne MCP:** **[llms-small.txt](https://uiarc.dev/llms-small.txt)** statt des sehr großen vollständigen Katalogs; danach genau eine Detail-MD, z. B. [Button-Markdown](https://uiarc.dev/components/button/markdown), und [Button-JSON](https://uiarc.dev/r/button.json). JSON liefert TSX/CSS; keine Installation nötig. Weitere tatsächliche Detail-MD-Links stehen im Index.
- **Qualität / Designwerte des Buttons:** Dokumentiert Loading mit erhaltenem Fokus, native Tastaturaktivierung, Reduced Motion, Touch ohne klebenden Hover, Label-/Breitenübergang und Press-Skalierung etwa 0,97. Registry nennt `motion` als Dependency. Einzelner ResizeObserver pro Button; sehr große Listen gesondert bewerten.
- **Flutter – eigene Einschätzung:** Besonders hilfreich für klar beschriebene Zustände und Auswahlentscheidungen. Tokens und Bewegungsabsicht nach Dart übertragen; Web-Fokus-/ARIA-/CSS-Mechanik durch Flutter-Semantik ersetzen.
- **Tags:** `web-components`, `registry`, `mcp`, `forms`, `inputs`, `bottom-sheet`, `charts`, `motion`, `accessibility`.

**Prüfung, 2026-10-06:** Free-Button mit Usage-/Qualitätshinweisen, Button-MD/-JSON, kleiner Agent-Index, AI/MCP-Doku, Pricing und Lizenz gelesen. Free-Konto-/MCP-Verbindung und Flutter-Integration nicht getestet.
