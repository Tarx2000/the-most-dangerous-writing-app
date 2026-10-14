# Design Resources

Ein Agent-Skill zum Finden, Empfehlen, Anpassen und Wiederverwenden hochwertiger UI-Komponenten. Schwerpunkt: Flutter-Apps, kostenlose Quellen, kommerzielle Nutzbarkeit und eine projektlokale Komponentenbibliothek.

## Einstieg

- **Skill-Name:** `design-resources`
- **Skill-Paket:** dieser gesamte Repository-Ordner, einschließlich `references/` und `scripts/`
- **Agent-Einstieg:** [SKILL.md](SKILL.md)
- **Schnellübersicht:** [Quellen und Komponentenarten](references/INDEX.md)
- **Wissensbasis:** [vollständiger Ressourcenkatalog](references/DESIGN_RESOURCES.md)

Der kurze Einstieg führt zu ausgewählten Detailprofilen. Der Bestand umfasst 33 ausführliche Profile und 137 Designeer-Einträge; Überschneidungen sind enthalten. Die erfassten Lizenz- und Zugriffsangaben haben einen dokumentierten Prüfstand und werden vor tatsächlicher Übernahme gezielt aktualisiert.

## Installation

Den gesamten Repository-Ordner unter dem Namen `design-resources` in das vom Agent unterstützte Skill-Verzeichnis kopieren. Für eine projektlokale Installation:

```sh
git clone https://github.com/Tarx2000/design-resources.git .agents/skills/design-resources
```

Für ein privates Repository sind GitHub-Zugriffsrechte erforderlich. Bereits vorhandene Ordner zuerst prüfen; nicht überschreiben. Die Installation registriert keine MCP-Server und installiert keine UI-Bibliotheken.

## Aufbau

```text
SKILL.md
references/
  INDEX.md
  DESIGN_RESOURCES.md
  PROJECT_LIBRARY.md
  MAINTENANCE.md
  providers/<quelle>/README.md
  designeer/INDEX.md
  designeer/D001.md ... D137.md
scripts/
  find_resources.py
  build_references.py
evals/
  evals.json
  check_bundle.py
```

## Lokale Suche und Pflege

Python 3 genügt; keine zusätzlichen Python-Pakete notwendig. Vom Repository-Ordner aus:

```sh
python3 scripts/find_resources.py "OTP" --limit 5
python3 scripts/find_resources.py --show beui
python3 scripts/build_references.py
python3 evals/check_bundle.py
```

Quelleninformationen nur in `references/DESIGN_RESOURCES.md` pflegen und anschließend die abgeleiteten Detailprofile neu erzeugen. Der vollständige Skill-Ordner ist unabhängig vom ursprünglichen Rechercheprojekt nutzbar.

## Nutzung

Beispiel: „Nutze design-resources und empfehle eine kostenlose OTP-Komponente für meine kommerzielle Flutter-App.“

Der Agent prüft vorhandene Projektkomponenten, wählt passende Quellen, berücksichtigt Free-Scope und Lizenz, passt an das gemeinsame Theme an und iteriert im tatsächlichen Screen. React-Komponenten werden als Web-Vorbild bzw. lizenzkonforme Portierung behandelt; sie sind keine direkt installierbaren Flutter-Widgets.

Der Katalog verteilt keine fremden Komponentenpakete. Für übernommene Komponenten, Fonts, Bilder und Sounds gelten die jeweiligen Originalbedingungen.
