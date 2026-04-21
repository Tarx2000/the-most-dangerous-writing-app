path = 'src/components/features/library/PersonProfileModal.tsx'
with open(path, 'r', encoding='utf-8-sig') as f:
    content = f.read()
old = '        } catch {\n            return dateStr;'
new = '        } catch (err: unknown) {\n            console.warn("[PersonProfileModal] Failed to parse birthday:", dateStr, err);\n            return dateStr;'
if old in content:
    content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    print('Fixed')
else:
    print('Not found')
