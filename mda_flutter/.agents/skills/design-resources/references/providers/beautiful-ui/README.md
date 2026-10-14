# Beautiful UI

> Generierte Leseansicht. Angaben nur im zentralen [Katalog](../../DESIGN_RESOURCES.md) ändern; danach `scripts/build_references.py` ausführen.

- **Name / URL:** [Beautiful UI](https://www.beautifului.dev/).
- **Herkunft / Priorität:** Persönliche Sammlung; `zuerst ansehen` für KI-App-Primitives, strukturierte Antworten und Freigabe-UI.
- **Typ / Technologie:** Öffentliche React-/TSX-Komponenten mit gemeinsamer CSS-Foundation und shadcn-Registry.
- **Angebot:** 21 auf der geprüften Übersicht aufgeführte Primitives: Loading/Thinking/Streaming, Approval, Tool Chips, Task Rows, Chat Composer, Prompt Bar, Recommendations, Context Cards, Diff-/Records-/Filter-Tabellen, Sidebar/Nav, Search, Flowchart, Insights, Code Block, Fine-tune, Selection Actions und Agent Screen. Das Angebot konzentriert sich auf KI-Produkte.
- **Kosten / Lizenz / Nennung:** Öffentliches eigenes Komponentenmaterial MIT; kommerzielle Nutzung erlaubt. Copyright Shane Levine und vollständige Lizenz erhalten; keine sichtbare Nennung aus MIT. Fremde Demo-Medien haben nicht automatisch diese Lizenz. [License](https://www.beautifului.dev/license)
- **Designwerte / Zugang:** Komponente über `View code` oder `Copy code`; Foundation liefert globale Theme-Variablen, Keyframes und Regeln für reduzierte Bewegung. [Foundation-Quellcode](https://github.com/slev12397/beautiful-ui/blob/main/app/globals.css)
- **MCP:** Kein eigener offizieller kostenloser MCP gefunden. Öffentliche Registry-Dateien reichen für direkte Recherche; shadcn-MCP ist eine mögliche allgemeine Registry-Anbindung, hier nicht getestet.
- **Flutter-Einsatz – eigene Einschätzung:** Gute Vorlage für zusammengehörende Chat-/Agenten-Zustände. Foundation-Werte in eigene Flutter-Tokens übertragen und ausgewählten TSX-Ablauf neu umsetzen.
- **Tags:** `web-components`, `registry`, `chat`, `loading`, `tables`, `navigation`, `design-tokens`, `motion`.

**Schnellster Zugriff:** Komponente direkt per Anker wählen, dann `View code`. Der geprüfte [Loading-State-Registry-Eintrag](https://www.beautifului.dev/r/loading-state.json) liefert `LoadingState.tsx` und verweist auf eine zusätzliche `foundation.json`. Für vollständige Gestaltung diese gemeinsame Grundlage mitprüfen. Für weitere Komponenten die tatsächlich angezeigte Registry-URL übernehmen, statt Namen zu raten.

| Referenz | Direktlink | Nutzen |
| --- | --- | --- |
| Loading / Thinking / Streaming | [Loading](https://www.beautifului.dev/#loading-state), [Thinking](https://www.beautifului.dev/#thinking-state), [Streaming](https://www.beautifului.dev/#streaming-text) | Warte-/Arbeits-/Ausgabezustände |
| Approval Card | [Freigabe](https://www.beautifului.dev/#approval-card) | Bestätigung einer Agentenaktion |
| Chat Composer / Prompt Bar | [Composer](https://www.beautifului.dev/#chat-composer), [Prompt](https://www.beautifului.dev/#prompt-bar) | Texteingabe mit Aktionen/Kontext |
| Context Cards / Diff Table | [Kontext](https://www.beautifului.dev/#context-cards), [Diff](https://www.beautifului.dev/#diff-table) | Quellen-/Kontextübersicht und Änderungen |
| Agent Screen | [Gesamtansicht](https://www.beautifului.dev/#agent-screen) | Zusammenspiel mehrerer Primitives |

**Grenzen:** Keine allgemeine Vollbibliothek oder echtes Agenten-Backend. Loading State enthält mehrere Varianten; die „Surfer“-Demo verwendet ein externes Video. Dessen Rechte nicht aus der Komponenten-MIT ableiten; eigenes Material wählen oder die Variante auslassen. Demo-Daten durch eigene Daten ersetzen.

**Prüfung, 2026-10-05:** Übersicht, Primitives/Anker, Loading-State-Code-Dialog und sichtbarer shadcn-Weg im Browser geprüft; JSON mit TSX/Foundation-Abhängigkeit live gelesen. Lizenz und Foundation-Link geprüft. Keine Registry installiert oder Flutter-Portierung getestet.
