path = 'src/lib/aiService.ts'
with open(path, 'r', encoding='utf-8-sig') as f:
    content = f.read()
old = '    } catch {\n        console.warn(\'[AI] Failed to parse grammar response as JSON:\', raw);'
new = '    } catch (err: unknown) {\n        console.warn(\'[AI] Failed to parse grammar response as JSON:\', raw, err);'
if old in content:
    content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    print("Fixed aiService grammar catch")
else:
    print("Pattern not found")
