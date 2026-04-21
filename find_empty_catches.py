import os
import re

for root, dirs, files in os.walk('src'):
    for fname in files:
        if not fname.endswith(('.ts', '.tsx')):
            continue
        path = os.path.join(root, fname)
        try:
            with open(path, 'r', encoding='utf-8-sig') as f:
                content = f.read()
        except UnicodeDecodeError:
            try:
                with open(path, 'r', encoding='latin-1') as f:
                    content = f.read()
            except:
                continue
        pattern = r'\} catch \{\s*\n\s*(?:/[^\n]*)?\n'
        matches = list(re.finditer(pattern, content))
        if matches:
            print(f'{path}: {len(matches)} empty catch(es)')
