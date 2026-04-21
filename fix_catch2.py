import re

files = [
    ('src/lib/storageManager.ts', [
        (r'                } catch \{', '                } catch (err) {\n                    console.warn(\'[StorageManager] Failed to delete vlog:\', fullPath, err);'),
        (r'    \} catch \{(\n\s+// Directory)', r'    } catch (err) {\n        console.warn(\'[StorageManager] Failed to read vlog directory:\', err);\1'),
    ]),
    ('src/components/ui/LiquidMorphIcon.tsx', [
        (r'            \} catch \{(\n\s+// Graceful)', r'            } catch (err) {\n                console.warn(\'[LiquidMorphIcon] Flubber morph failed:\', err);\1'),
    ]),
    ('src/components/features/library/PersonProfileModal.tsx', [
        (r'        \} catch \{(\n\s+            return dateStr;)', r'        } catch (err) {\n            console.warn(\'[PersonProfileModal] Date parse failed:\', dateStr, err);\1'),
    ]),
]

for path, replacements in files:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    for pattern, replacement in replacements:
        content = re.sub(pattern, replacement, content)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'Fixed {path}')

print('All done')
