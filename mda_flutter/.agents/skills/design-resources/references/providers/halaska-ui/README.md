# Halaska UI

> Generierte Leseansicht. Angaben nur im zentralen [Katalog](../../DESIGN_RESOURCES.md) ändern; danach `scripts/build_references.py` ausführen.

- **Name / URL:** [Halaska UI](https://ui.halaska.com/).
- **Herkunft / Priorität:** Persönliche Sammlung; `zuerst ansehen` für ein konsistentes KI-Produktdesign mit zusammengehörenden Komponenten und Patterns.
- **Typ / Technologie:** Ein React-Kit als einzelne `.jsx`-Datei, `react`/`react-dom`, Inline-Styles; kein Tailwind-/Build-Konfigurationszwang.
- **Angebot:** Geprüfte Übersicht nennt 77 Komponenten, 40 Patterns und zwei Beispiel-Screens: Chat und Canvas. Allgemeine Controls wie Button, Input, Calendar und Table sowie KI-Muster für Thinking, Streaming, Pläne, Freigaben, Agentenstatus, Tool-Aufrufe, Handoffs, Ergebnisse und Fehlerbehandlung. [API-Referenz](https://ui.halaska.com/llms.txt)
- **Designwerte:** Semantische Paletten und Theme-Kontexte; Light/Dark, Accent, `ThemeProvider`, `usePal`. Dokumentierte Spacing-Stufen 4/8/16/32/40 und Radius-Stufen 4/8/16/24/32/Pill. Motion-Tokens für mehrere Geschwindigkeiten und Kurven. Dies sind Kit-Werte, keine Pflicht für die eigene App.
- **Kosten / Lizenz / Nennung:** Öffentliches Kit MIT, kommerziell erlaubt; Copyright Halaska Studio und Lizenz erhalten, keine sichtbare UI-Nennung aus MIT. Eingebundene Schrift-/Fremdassets gesondert prüfen. [MIT](https://github.com/Halaska-Studio/ui/blob/main/LICENSE)
- **MCP:** Kein offizieller kostenloser MCP gefunden. Die direkt lesbaren MD-/JSX-/Typdateien bieten bereits einen schnellen Agentenzugang.
- **Flutter-Einsatz – eigene Einschätzung:** Besonders sinnvoll, um konsistente Zustände und gemeinsame Tokens für eine KI-App abzuleiten. React-Datei dient als Verhalten-/Gestaltungsvorlage; sie wird nicht als Dart-Datei installiert.
- **Tags:** `web-components`, `design-system`, `design-tokens`, `chat`, `loading`, `error-state`, `motion`, `dark-mode`.

**Schnellster Zugriff:**

1. [install.md](https://ui.halaska.com/install.md) lesen: Nutzung, Theming, Retrofit und Link zur API. Danach [llms.txt](https://ui.halaska.com/llms.txt) für Namen, Props und Patterns; so muss der Agent nicht die komplette Galerie durchsuchen.
2. Für das ausgewählte Verhalten den entsprechenden Export in [halaska-kit.jsx](https://ui.halaska.com/halaska-kit.jsx) lesen. [Typreferenz](https://ui.halaska.com/halaska-kit.d.ts) ist in der Installationsanleitung verlinkt; hier nicht separat abgerufen.
3. Falls später ausdrücklich in einem React-Projekt eingesetzt: Kit-Datei ins Projekt übernehmen und Installationsanleitung befolgen. Der vom Nutzer gelieferte Downloadweg ist `curl -o src/halaska-kit.jsx https://ui.halaska.com/halaska-kit.jsx`. Die Retrofit-Anleitung behält Routing, State und Daten und ersetzt UI schrittweise. **Hier wurde das Kit nur gelesen.**

| Referenz | Direktlink | Nutzen |
| --- | --- | --- |
| Chat / Canvas | [Chat](https://ui.halaska.com/screens/chat), [Canvas](https://ui.halaska.com/screens/canvas) | Zusammenspiel der Bausteine in ganzen Produktansichten |
| Plan / Approval | [Plan](https://ui.halaska.com/patterns/plan), [Approval](https://ui.halaska.com/patterns/approval) | Vorschau und bewusste Freigabe einer Agentenaktion |
| Status / Streaming | [Status](https://ui.halaska.com/patterns/status), [Streaming](https://ui.halaska.com/patterns/streaming) | Warte-/Arbeits-/Ausgabezustände |
| Allgemeine Controls | [Button](https://ui.halaska.com/components/button), [Input](https://ui.halaska.com/components/input), [Calendar](https://ui.halaska.com/components/calendar) | Konsistente visuelle Grundbausteine |

**Grenzen:** Einige Patterns sind prop-gesteuert, andere enthalten Demo-Verhalten oder Demo-Daten; vor produktiver Nutzung austauschen. Kein Modell-/Tool-Backend und keine native Flutter-Bibliothek. Geist-Schriften/Keyframes werden im Web-Kit zusätzlich eingebunden.

**Prüfung, 2026-10-05:** Übersicht und Kategorien im Browser; `install.md`, `llms.txt`, Kit-Header/Theming-Tokens und MIT-Repository gelesen. Verlinkte Details als Einstiege erfasst; nicht jede Demo einzeln bedient. Keine Installation/Retrofit durchgeführt.
