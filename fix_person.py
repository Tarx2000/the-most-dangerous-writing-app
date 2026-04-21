path = 'src/components/features/library/PersonProfileModal.tsx'
with open(path, 'r', encoding='utf-8-sig') as f:
    content = f.read()

old = '''        } catch {
            return dateStr;'''

new = '''        } catch (err: unknown) {
            console.warn('[PersonProfileModal] Failed to parse birthday:', dateStr, err);
            return dateStr;'''

if old in content:
    content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    print('Fixed PersonProfileModal')
else:
    print('Pattern not found')
