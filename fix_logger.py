path = 'src/lib/aiLogger.ts'
with open(path, 'r', encoding='utf-8-sig') as f:
    content = f.read()
old = '    } catch {\n        return [];'
new = '    } catch (err: unknown) {\n        console.warn("[aiLogger] Failed to read AI log:", err);\n        return [];'
if old in content:
    content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    print("Fixed aiLogger")
else:
    print("Pattern not found in aiLogger")
