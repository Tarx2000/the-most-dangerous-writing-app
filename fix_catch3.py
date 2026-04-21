import re

files = [
    'src/lib/storageManager.ts',
    'src/components/ui/LiquidMorphIcon.tsx',
    'src/components/features/library/PersonProfileModal.tsx',
]

# Pattern: empty catch -> catch with named err param + console.warn
# The empty catch block starts with: } catch {
# followed by a comment line

for path in files:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace } catch { followed by a comment line
    pattern = r'(} catch \{)(\n\s+//)'
    if 'storageManager' in path:
        replacement = r'} catch (err: unknown) {\n        console.warn("[StorageManager] " + ("vlog delete failed: " if "delete" in content else "dir read failed:"), err);\2'
    elif 'LiquidMorphIcon' in path:
        replacement = r'} catch (err: unknown) {\n                console.warn("[LiquidMorphIcon] Flubber morph failed:", err);\2'
    elif 'PersonProfileModal' in path:
        replacement = r'} catch (err: unknown) {\n            console.warn("[PersonProfileModal] Date parse failed:", err);\2'
    
    new_content = re.sub(pattern, replacement, content)
    
    if new_content != content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Fixed: {path}")
    else:
        print(f"No change: {path}")

print("Done")
