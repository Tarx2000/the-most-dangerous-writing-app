# Libraries.dev

> Generierte Leseansicht. Angaben nur im zentralen [Katalog](../../DESIGN_RESOURCES.md) ändern; danach `scripts/build_references.py` ausführen.

- **Name / URL:** [Libraries.dev](https://libraries.dev/); erneut gelieferter [Components-Anker](https://libraries.dev/#components) im selben Profil erhalten.
- **Herkunft / Priorität:** Persönliche Sammlung; `zuerst ansehen` für besondere Animationen, Orbs, Voice- und Materialeffekte.
- **Typ / Technologie:** Sieben spezialisierte öffentliche React-/npm-Bibliotheken mit Playground, Props und Quellcode.
- **Angebot:** Bewegter Border-Glow, Thinking-Orbs, animierte Bot-Avatare, verschmelzende Gooey-Formen, Voice-Glow, metallische Oberflächen und Pixel-/WebGL-Bildübergänge. Kein allgemeiner Form-/Navigationskatalog. [Paketübersicht](https://github.com/Jakubantalik/Libraries.dev)
- **Kosten / Lizenz / Nennung:** **Alle sieben öffentlichen Pakete sind MIT und kommerziell kostenlos nutzbar**, einschließlich Unternehmen. Copyright/Lizenz erhalten, keine sichtbare UI-Nennung aus MIT. Pro-Studio, Pro-Presets, Varianten und Rezepte unter separater bezahlter Lizenz. Firmen/Startups benötigen laut Terms für diese Pro-Inhalte Business; das beschränkt nicht die MIT-Pakete. [Terms](https://libraries.dev/terms), [MIT](https://github.com/Jakubantalik/Libraries.dev/blob/main/LICENSE)
- **Kompatibilität:** Repository nennt React 18+, automatische Light-/Dark-Erkennung oder explizites Theme. Die öffentlichen Pakete sind laut README ohne zusätzliche Runtime-Abhängigkeiten, außer `img-fx` mit `three` als Peer Dependency. Den konkreten Paketstand vor Nutzung prüfen.
- **MCP:** Kein offizieller kostenloser MCP gefunden. Public-Paket-README, Quellcode und Copy-Prompt sind schnell verfügbar; angebotene Skills sind eigene Hilfsmittel, keine MCP-Verbindung.
- **Flutter-Einsatz – eigene Einschätzung:** Visuelle Abläufe und Parameter übertragen; einfache Border-/Glow-Animationen sind überschaubar, Gooey/Metal/WebGL-Effekte können Shader oder eigenes Rendering erfordern. Kein fertiges Dart-Paket hier bestätigt.
- **Tags:** `web-components`, `motion`, `loading`, `chat`, `expressive`, `dark-mode`.

**Schnellster Zugriff:** Passendes Paket in der Tabelle wählen. Im [Repository](https://github.com/Jakubantalik/Libraries.dev) unter `packages/PAKET` direkt README, Props, LICENSE und Source lesen. Zum Verständnis ist keine Installation nötig. Website-Playground/Copy-Prompt liefert ausgewählte Einstellungen; Installationsprompts nicht ungeprüft auf ein Flutter-Projekt anwenden.

| Effekt | Website | npm-Paket / Schwerpunkt |
| --- | --- | --- |
| Border Beam | [Beam](https://libraries.dev/beam) | `border-beam` — Licht entlang einer Card-/Button-/Input-Kante |
| Thinking Orbs | [Orbs](https://libraries.dev/orbs) | `thinking-orbs` — mehrere AI-/Ladezustände |
| Bot Avatars | [Avatars](https://libraries.dev/avatars) | `bot-avatars` — animierte Agentengesichter und Zustände |
| Gooey | [Gooey](https://libraries.dev/gooey) | `liquid-gooey` — verschmelzende/flüssige Formen |
| Voice Glow | [Voice](https://libraries.dev/voice) | `voice-glow` — Stimme als Glow am Composer/Bildschirmrand |
| Metal | [Metal](https://libraries.dev/metal) | `metal-fx` — Material-/Reflexionseffekte für Controls |
| Image | [Image](https://libraries.dev/image) | `img-fx` — Pixelmosaik wird zum Bild; WebGL/Three.js |

**Grenzen:** Nutzerannahme „viele kosten“ trifft derzeit auf Pro-Zusätze, nicht auf die sieben öffentlichen Libraries zu. Repository und Terms nennen sieben; eine ältere Homepage-FAQ nennt noch fünf. Website-Download ist nicht der einzige Zugriff: Source ist öffentlich. Effekte liefern keine Geschäftslogik und sind nicht alle gleich leicht in Flutter übertragbar.

**Prüfung, 2026-10-05; Übersicht/Lizenz am 2026-10-06 erneut gesichtet:** Website-Angebot, aktuelles README mit sieben Paketen, Terms und MIT gelesen. Einzelne direkte Website-Abrufe erhielten HTTP 403; Repository ist der funktionierende Text-Fallback. Keine Pakete installiert, Shader oder Flutter-Ports getestet.
