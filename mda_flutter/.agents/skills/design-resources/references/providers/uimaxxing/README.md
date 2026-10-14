# UImaxxing

> Generierte Leseansicht. Angaben nur im zentralen [Katalog](../../DESIGN_RESOURCES.md) ändern; danach `scripts/build_references.py` ausführen.

- **Name / URL:** [UImaxxing](https://uimaxx.ing/#library).
- **Herkunft / Priorität:** Persönliche Sammlung; `Alternative` für konkrete Produkt-/KI-/Finance-UI und ungewöhnliche Loader.
- **Typ / Technologie:** Interaktive Web-Komponentengalerie mit kopierbarem Code und gemeinsamer Tailwind-CSS-Grundlage.
- **Angebot:** Prompt-/Voice-Eingaben, Chat-Threads, Entwickler-/Agenten-UI, Terminals, Diffs, Markt-/Tradingansichten, Tabellen/Charts, Einstellungen, Pricing, Buttons, Toggles und Ladeanzeigen. Viele Free-Einträge; weitere Animationen, Poster und Carousels Pro. Die geprüfte Galerie nennt 75 kostenlose Komponenten, also mehr als nur einige wenige.
- **Free-Regel:** Pro-Badges und gesperrte „Unlock“-Aktionen ausschließen. [Pro-Übersicht](https://uimaxx.ing/pro) beschreibt den bezahlten Zusatzbereich; keine Freigabe daraus für Free ableiten.
- **Kommerziell / Nennung:** Der öffentlich abgerufene Basis-CSS-Header erlaubt Nutzung, Änderungen und Auslieferung in eigenen kommerziellen Produkten, verbietet Wiederveröffentlichung als Komponentenbibliothek und Nutzung als ML-Trainingsdaten. Eigene Lizenz mit Copyright-/`@preserve`-Header, **keine MIT-Lizenz**. Vollständiges dort referenziertes LICENSE und genaue Nennungspflicht für Einzelkomponenten nicht gefunden; vor Übernahme deren Header/Lizenz prüfen. [Basis-Registry mit Header](https://uimaxx.ing/r/uimaxxing.json)
- **MCP:** Kein eigener offizieller kostenloser MCP gefunden. Registry und Copy-Oberfläche sind die verfügbaren Wege.
- **Flutter-Einsatz – eigene Einschätzung:** Gute Vorbilder für kompakte Interaktionen und technische Produktansichten. React-/CSS-Verhalten neu umsetzen; Echtzeitkurse, Editorfunktionen und Backend nicht aus Demo-UI ableiten.
- **Tags:** `web-components`, `registry`, `chat`, `inputs`, `settings`, `charts`, `tables`, `loading`, `motion`.

**Schnellster Zugriff:** [Library](https://uimaxx.ing/#library) im Browser öffnen, nach Komponentennamen suchen und eine Free-Karte wählen. Öffentliche Copy-Aktion nutzen; Free-Code und Pro-Vorschau unterscheiden.

| Kostenloses Vorbild / Einstieg | Zugriff | Nutzen |
| --- | --- | --- |
| Floating Ask Bar | [Komponentenanker](https://uimaxx.ing/#floating-ask-bar) bzw. Suche nach `Ask Anything` | Kompakter Prompt-/Such-Composer |
| Agent Chat Thread, Terminal, Diff Viewer, Issue Activity | Namen im Library-Suchfeld | Agentenstatus, Chatverlauf und Änderungen |
| Candlestick Chart, Order Book, Heatmap | Namen im Library-Suchfeld | Datenhierarchie und Finance-UI; nur UI-Demo |
| Settings und Account | [Kategorie](https://uimaxx.ing/#sec-settings-and-account) | Konto-/Einstellungsbausteine |
| Loaders und Progress | [Kategorie](https://uimaxx.ing/#sec-loaders-and-progress) | Kleine Lade-/Fortschrittsanimationen; Pro-Badges beachten |

**Code-Grundlage:** Die beobachtete Installations-URL `https://uimaxx.ing/r/uimaxxing.json` liefert einen `registry:style`-Eintrag mit `uimaxxing.css` und Hilfsabhängigkeiten. Das ist die gemeinsame Grundlage, **kein Export aller Karten**. Tailwind 4 ist vorgesehen; Grund-CSS nach Tailwind und vor eigenen Überschreibungen einbinden, falls später ein Web-Projekt damit umgesetzt wird. Für Flutter reichen Token-/Interaktionsanalyse und der ausgewählte Komponentencode.

**Grenzen:** Roboterzugriff war blockiert; Browser funktionierte. Copy zeigte eine Bestätigung, der kopierte Text wurde in diesem Test nicht aus der Zwischenablage bestätigt. Für eine kommerzielle Übernahme bleibt die vollständige Einzellizenz offen.

**Prüfung, 2026-10-05:** Library, Kategorien, Free-/Pro-Markierungen, Copy-Aktion und Pro-Seite im Browser geprüft. Öffentliche Basis-Registry samt CSS-/Lizenzheader gelesen. Keine Pro-Freischaltung oder Installation.
