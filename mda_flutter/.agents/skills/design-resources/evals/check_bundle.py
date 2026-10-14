"""Check bundled paths, lookup behavior and generated-profile coverage."""
from pathlib import Path
import importlib.util,re
BASE=Path(__file__).resolve().parents[1]

def check():
    for p in BASE.rglob('*.md'):
        for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)',p.read_text()):
            file=target.split('#')[0]
            if not file or file.startswith(('http:','https:','mailto:')):continue
            assert (p.parent/file).is_file(),(p,target)
    skill=(BASE/'SKILL.md').read_text()
    assert skill.startswith('---\nname: design-resources\ndescription:')
    assert len(skill.splitlines())<100
    spec=importlib.util.spec_from_file_location('lookup',BASE/'scripts/find_resources.py')
    lookup=importlib.util.module_from_spec(spec);spec.loader.exec_module(lookup)
    assert len(list(lookup.records()))==170
    for query,expected in [('OTP','beui'),('Textanimation','calligraph'),('Bottom-sheet','beui')]:
        assert expected in [r[1] for r in lookup.search(query,20)],query
    assert not lookup.search('zzzznotacomponentzzzz',5)
    print('Bundle checks passed: references, metadata, 170 profiles and task lookup.')

if __name__=='__main__':check()
