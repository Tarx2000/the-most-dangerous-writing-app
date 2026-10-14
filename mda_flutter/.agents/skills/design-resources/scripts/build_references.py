#!/usr/bin/env python3
"""Rebuild derived lookups from the single canonical Markdown catalog. No network."""
from pathlib import Path
import re
BASE = Path(__file__).resolve().parents[1]
REF = BASE / 'references'

def build():
    source = (REF / 'DESIGN_RESOURCES.md').read_text()
    profiles = {}
    for m in re.finditer(r'^### ([a-z][a-z0-9-]+)\n', source, re.M):
        rest = source[m.end():]
        stop = re.search(r'^#{1,3} ', rest, re.M)
        profiles[m[1]] = rest[:stop.start() if stop else len(rest)].strip()
    rows = []
    quick = source.split('### Persönliche Sammlung\n', 1)[1].split('## Zugriff auf einen Blick', 1)[0]
    for line in quick.splitlines():
        if not line.startswith('|') or '(#' not in line:
            continue
        cells = [c.strip() for c in line.strip('|').split('|')]
        link = re.search(r'\(#([a-z0-9-]+)\)', cells[-1])
        if link:
            key = link[1]
            assert key in profiles, key
            rows.append((key, cells[0], cells[1:4]))
    profiles = {key: profiles[key] for key, _, _ in rows}
    assert len(rows) == len(profiles) == 33, (len(rows), len(profiles))
    header = '> Generierte Leseansicht. Angaben nur im zentralen [Katalog](../../DESIGN_RESOURCES.md) ändern; danach `scripts/build_references.py` ausführen.\n\n'
    index = ['# Quellen auf einen Blick', '', '> Abgeleitet aus DESIGN_RESOURCES.md; keine zweite gepflegte Datenbasis. Prüfumfang und Einschränkungen stehen im jeweiligen Profil.', '', 'Zuerst 1–3 passende Profile lesen. Die Angaben beschreiben das dokumentierte Angebot, keine Prüfung jeder Variante.', '', '| Quelle | Komponentenarten / Angebot | Free / Einschränkung | Detail |', '| --- | --- | --- | --- |']
    for key, name, fields in rows:
        body = re.sub(r'\]\((#[^)]+)\)', r'](../../DESIGN_RESOURCES.md\1)', profiles[key])
        folder = REF / 'providers' / key
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'README.md').write_text(f'# {name}\n\n{header}{body}\n')
        tags = re.search(r'^- \*\*Tags:\*\* (.+)', body, re.M)
        types = fields[0] + ('<br>Tags: '+tags[1].rstrip('.') if tags else '')
        index.append(f'| {name} | {types} | {fields[1]} | [{key}](providers/{key}/README.md) |')
    index += ['', '## Zusätzliche Bibliotheken', '', 'Bei fehlendem Treffer den [Designeer-Index](designeer/INDEX.md) durchsuchen: alle 137 Quellen mit konkreten Angebotsarten und Rechte-/Prioritätsstatus. Einzelheiten stehen in den jeweiligen D-Dateien.', '', 'Gezielt suchen: `python3 scripts/find_resources.py "OTP" --limit 5`; ein Profil lesen: `python3 scripts/find_resources.py --show beui`.', '', 'Favoriten: Spectrum, Obsidian, xevrion; beUI bei passendem Bedarf. VibePrompt zuletzt. Native Flutter-Widgets und vorhandene Projektkomponenten zuerst prüfen.', '']
    (REF / 'INDEX.md').write_text('\n'.join(index))
    directory = REF / 'designeer'; directory.mkdir(exist_ok=True)
    dindex = ['# Weitere Quellen nach Komponentenangebot', '', '> Generierte Ansicht des zentralen Katalogs. A = für genannten Bedarf priorisiert; B = ergänzend; I = Spezial-/Referenzquelle; ? = offen. Kein Status ersetzt die Prüfung der konkreten Lizenz.', '', '| ID / Quelle | Komponentenarten / Angebot | Auswahl | Detail |', '| --- | --- | --- | --- |']
    count = 0
    for line in source.splitlines():
        if not re.match(r'^\| D\d{3} · ', line): continue
        cells = [c.strip() for c in line.strip('|').split('|')]
        assert len(cells) == 6, cells
        key = cells[0].split(' · ')[0]
        body = f'# {cells[0]}\n\n{header.replace("../../DESIGN_RESOURCES.md", "../DESIGN_RESOURCES.md")}'
        body += '\n'.join(f'- **{label}:** {value}' for label, value in zip(['Komponentenarten / Angebot','Free-Zugang','Kommerziell / Nennung','Schnellster Zugriff / MCP','Auswahl / Prüfumfang'], cells[1:]))
        (directory / f'{key}.md').write_text(body+'\n')
        dindex.append(f'| {cells[0]} | {cells[1]} | {cells[5]} | [{key}]({key}.md) |')
        count += 1
    assert count == 137, count
    (directory / 'INDEX.md').write_text('\n'.join(dindex)+'\n')
    print(f'Referenzen aktualisiert: {len(profiles)} Profile, {count} Designeer-Quellen.')

if __name__ == '__main__': build()
