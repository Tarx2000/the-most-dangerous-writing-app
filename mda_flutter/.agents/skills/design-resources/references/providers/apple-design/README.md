# Apple Design

> Generierte Leseansicht. Angaben nur im zentralen [Katalog](../../DESIGN_RESOURCES.md) ändern; danach `scripts/build_references.py` ausführen.

- **Name / URL:** [Apple Developer – Design](https://developer.apple.com/design/).
- **Herkunft / Priorität:** Persönliche Sammlung; `zuerst ansehen` für fundierte App-Gestaltung, iOS-UX und ein eigenes Designsystem.
- **Typ:** Offizieller Design-Hub mit Human Interface Guidelines (HIG), Designressourcen und Lehrmaterial.
- **Angebot:** HIG behandeln Grundlagen, Interaktionsmuster, Komponenten, Eingaben und Apple-Technologien. Dazu offizielle UI-Kits/Designvorlagen für Figma und Sketch, Icon-Templates, Fonts, SF Symbols, Werkzeuge und Designvideos. [Design-Hub](https://developer.apple.com/design/), [Designressourcen](https://developer.apple.com/design/resources/)
- **Zugang:** Geprüfte Guidelines und Übersicht öffentlich ohne Anmeldung lesbar. Downloads, Fonts und Symbols haben eigene Bedingungen; keine pauschale plattformübergreifende Asset-Lizenz annehmen.
- **Kommerziell / Nennung:** Eigene Apps anhand der HIG gestalten; konkrete Downloads nach ihrer eigenen Lizenz behandeln. Die veröffentlichte [San-Francisco-Font-Lizenz](https://developer.apple.com/fonts/) beschränkt die heruntergeladene Schrift auf Mockups für Apple-Systeme und untersagt Einbetten; keine SF-Dateien als generische Flutter-Assets für Android/Web bundeln. Keine pauschale Nennungspflicht für eine eigene HIG-orientierte Gestaltung gefunden; Assetbedingungen bleiben maßgeblich.
- **MCP:** Kein offizieller MCP für HIG/Designressourcen gefunden. Xcode-/Safari-MCP unterstützen Entwicklung und sind kein bestätigter Design-Komponentenzugang. HIG-Themen und Ressourcenseiten direkt lesen.
- **Flutter-Einsatz – eigene Einschätzung:** Hierarchie, adaptive Layouts, Safe Areas, Navigation, lesbare Typografie, Zugänglichkeit und Motion-Regeln in eigene Widgets und Designregeln übertragen. iOS-Konventionen gezielt einsetzen; Android-Verhalten entsprechend seiner Plattform ausarbeiten.
- **Tags:** `guidelines`, `design-system`, `typography`, `color`, `responsive`, `accessibility`, `ios`, `motion`, `navigation`.

**Schnellster Zugriff:** Direkt zum relevanten HIG-Thema gehen. Beim Textabruf liefern diese Dokumentationsseiten teilweise nur eine JavaScript-Hülle; dann im Browser lesen. Der Navigator bietet einen Themenfilter. Die Ressourcenübersicht ist auch als normaler Seitentext gut lesbar.

| Bedarf | Direktlink | Nutzen |
| --- | --- | --- |
| Einstieg und übergreifende Prinzipien | [HIG](https://developer.apple.com/design/human-interface-guidelines/), [Design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles) | Grundlage der eigenen Gestaltungsregeln |
| Visuelle Grundlagen | [Foundations](https://developer.apple.com/design/human-interface-guidelines/foundations) | Einstieg in Farbe, Schrift, Layout, Motion und Zugänglichkeit |
| Adaptive Bildschirmgestaltung | [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) | Hierarchie, Größenanpassung, Guides und Safe Areas |
| Farben und Schrift | [Color](https://developer.apple.com/design/human-interface-guidelines/color), [Typography](https://developer.apple.com/design/human-interface-guidelines/typography) | Semantische Gestaltung und lesbare Inhalte |
| Zugänglichkeit und Bewegung | [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Motion](https://developer.apple.com/design/human-interface-guidelines/motion) | Bedienbarkeit und sinnvolle Animation |
| Konkrete Bedienelemente | [Components](https://developer.apple.com/design/human-interface-guidelines/components) | Kategorien für Navigation/Suche, Eingaben, Präsentation, Status, Menüs und Layout |
| Gestaltungsvorlagen und Assets | [Apple Design Resources](https://developer.apple.com/design/resources/) | Offizielle UI-Kits, Templates und weitere Ressourcen |

**Grenzen:** Die HIG geben Gestaltungs- und Verhaltensregeln; sie liefern keine fertige Flutter-Bibliothek oder projektspezifische DESIGN.md. SwiftUI-/Apple-Implementierungslinks sind zusätzliche Plattformreferenzen. Die Apple-Website-Stilanalyse bei Refero und Apples offizielle App-Guidelines erfüllen unterschiedliche Aufgaben.

**Prüfung, 2026-10-05:** Design-Hub, Ressourcenübersicht und veröffentlichte Font-Lizenz gelesen; HIG-Navigation, Layout-Inhalt und Komponenten-Kategorien im Browser geprüft. MCP-Suche fand Entwicklungswerkzeuge, keinen bestätigten Design-Katalogzugang. Nicht jedes HIG-Unterthema vollständig gelesen; keine Assets installiert oder heruntergeladene UI-Kits geprüft.
