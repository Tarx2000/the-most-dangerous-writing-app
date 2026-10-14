#!/usr/bin/env python3
"""Search generated local profiles; no third-party dependencies or network calls."""
from pathlib import Path
import argparse, re, unicodedata
BASE = Path(__file__).resolve().parents[1]
REF = BASE / 'references'
ALIASES = {
    'otp': ['otp', 'code-eingabe'],
    'bottom-sheet': ['bottom sheet', 'bottom-sheet', 'drawer'],
    'textanimation': ['text', 'zahlen', 'text-effect'],
    'sounds': ['sound', 'klang', 'klänge'],
    'farben': ['color', 'farben', 'farbpalette'],
    'charts': ['chart', 'diagramm'],
}

def norm(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s.casefold()) if not unicodedata.combining(c))

def records():
    for p in sorted((REF / 'providers').glob('*/README.md')):
        yield p.parent.name, p
    for p in sorted((REF / 'designeer').glob('D*.md')):
        yield p.stem, p

def search(query, limit):
    words = re.findall(r'[\w-]+', query.casefold())
    groups = [[norm(t) for t in ALIASES.get(w, [w])] for w in words]
    if not groups: return []
    found = []
    for key, path in records():
        body = path.read_text()
        searchable = norm(body)
        hits = sum(any(t in searchable for t in g) for g in groups)
        if not hits: continue
        offer = '\n'.join(l for l in body.splitlines() if any(x in l for x in ['Angebot', '**Tags:', '**Konkrete Referenz']))
        score = hits * 10 + sum(any(t in norm(offer) for t in g) for g in groups) * 5
        if key in ['spectrum-ui', 'obsidian-ui', 'xevrion-lab', 'beui']: score += 2
        if key == 'vibeprompts': score -= 3
        found.append((score, key, path, body.splitlines()[0].lstrip('# '), offer))
    return sorted(found, key=lambda x: (-x[0], x[1]))[:limit]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('query', nargs='?')
    parser.add_argument('--limit', type=int, default=5)
    parser.add_argument('--show', help='Exact provider ID or D001–D137')
    args = parser.parse_args()
    if args.show:
        matches = [p for k,p in records() if k == args.show]
        if not matches: parser.error('Unbekannte Profilkennung')
        print(matches[0].read_text()); return
    if not args.query: parser.error('Suchbegriff oder --show angeben')
    if args.limit < 1 or args.limit > 20: parser.error('--limit muss 1–20 sein')
    matches = search(args.query, args.limit)
    if not matches: print('Kein lokaler Treffer. Aufgabenindex prüfen oder gezielt neue Quelle recherchieren.'); return
    for _, key, path, title, offer in matches:
        print(f'{key} · {title}\nDetails: {path.relative_to(BASE)}')
        print((offer[:600] if offer else 'Angebot im Detailprofil lesen.')+'\n')
    print('Suchtreffer sind Kandidaten, keine Lizenzfreigabe. Free-Scope, Rechte und Plattform im Profil prüfen.')

if __name__ == '__main__': main()
