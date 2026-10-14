# DesignMD Supply

> Generierte Leseansicht. Angaben nur im zentralen [Katalog](../../DESIGN_RESOURCES.md) ändern; danach `scripts/build_references.py` ausführen.

- **Name / URL:** [DesignMD Supply](https://www.designmd.supply/).
- **Herkunft / Priorität:** Persönliche Sammlung; `Alternative` für Domain-basierte DESIGN.md-Extraktion. Beim aktuellen Abruf eingeschränkt verfügbar.
- **Typ:** Öffentliches, quelloffenes Werkzeug zum Erzeugen von Website-Styleguides; Verzeichnis vorgegebener Domains.
- **Angebot:** Domain eingeben oder Markenlink öffnen. Laut [Projektbeschreibung](https://github.com/context-dot-dev/designmd-supply) kombiniert der Dienst extrahierte Designwerte, Markeninformationen, Screenshot und Seitentext zu einer generierten DESIGN.md mit YAML-Metadaten und Regeln für Farben, Typografie, Layout, Formen, Oberflächen und Komponenten.
- **Free-Regel:** Laut Nutzer vollständig kostenlos. Öffentliche Seiten zeigen keine erforderliche Bezahlmaske; ein fertiger Export konnte beim aktuellen Test nicht abgerufen werden.
- **Lizenz / Nennung:** MIT für den Werkzeug-Quellcode, kommerzielle Tool-Nutzung mit erhaltenen Lizenzhinweisen. Keine eigene pauschale Freigabe für sämtliche generierten Texte, fremden Fonts, Bilder oder Markenassets gefunden; diese einzeln prüfen. Sichtbare Attribution der Guide-Ausgabe ungeklärt. [Repository](https://github.com/context-dot-dev/designmd-supply)
- **MCP:** Kein offizieller kostenloser MCP gefunden. Domain-Guide und optionaler Cache-GET sind der dokumentierte Rechercheweg dieses Profils.
- **Flutter-Einsatz – eigene Einschätzung:** Als Ausgangspunkt für ein eigenes Designsystem verwenden, mit Mobile-Layout und App-Bedienung ergänzen.
- **Tags:** `design-md`, `design-tokens`, `design-system`, `tools`, `color`, `typography`, `spacing`.

**Schnellster Zugriff:**

1. Bekannte Domain direkt über `/guides/DOMAIN` öffnen, zum Beispiel [Apple](https://www.designmd.supply/guides/apple.com) oder [Linear](https://www.designmd.supply/guides/linear.app). Weitere Marken über das Verzeichnis wählen; Domain-Eingabe für neue Websites.
2. Fertigen Guide-Text abwarten und erst nach tatsächlich geladenem Inhalt übernehmen. „Fetching“, „Generating“ und Beispiel-Buttons während des Ladens sind Platzhalter.
3. Optionaler technischer Leseweg, aus dem öffentlichen [Route-Quellcode](https://raw.githubusercontent.com/context-dot-dev/designmd-supply/main/app/api/design-md/route.ts) abgeleitet: `GET https://www.designmd.supply/api/design-md?domain=DOMAIN`. Bei vorhandenem Cache liefert die Implementierung `status: ready` und `designMd`, andernfalls `status: miss`. Dies ist ein Implementierungsdetail ohne bestätigte stabile API-Garantie. Der Live-Test für Apple erhielt **HTTP 429**.
4. Bei Rate-Limit den Abruf für den aktuellen Arbeitsschritt beenden und [Refero Styles](../../DESIGN_RESOURCES.md#refero-styles) verwenden. Keine wiederholten Anfrageketten oder eigenmächtige kostenpflichtige Self-Hosting-Konfiguration starten. Die API-POST-Route erzeugt Inhalt und ist kein einfacher Cache-Lesezugriff.

**Grenzen:** Generierte Interpretation einer Website; keine offiziellen Unternehmensrichtlinien und kein Dart-Komponentenkatalog. Das Repository ist MIT-lizenziert; daraus folgt keine pauschale Lizenz für fremde Markenassets oder Fonts. Gehostete Gratisnutzung ist von den API-/Modellkosten eines eigenen Betriebs zu unterscheiden. [Projekt und Lizenz](https://github.com/context-dot-dev/designmd-supply)

**Prüfung, 2026-10-05:** Verzeichnis und Apple-/Linear-Guide-Seiten abgerufen; Apple-Seite im Browser blieb im Ladezustand. Öffentliche Projektbeschreibung und GET-Route gelesen; Live-GET wegen Rate-Limit erfolglos. Fertiger Guide, Kopierfunktion und Export bleiben unbestätigt.
