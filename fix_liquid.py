import re

path = 'src/components/ui/LiquidMorphIcon.tsx'
with open(path, 'r', encoding='utf-8-sig') as f:
    content = f.read()

# The file has: } catch (err: unknown) {
# followed by: // Graceful fallback...
# Replace the empty catch with one that logs

old = '''            } catch (err: unknown) {
                // Graceful fallback: instant swap if flubber fails'''

new = '''            } catch (err: unknown) {
                console.warn('[LiquidMorphIcon] Flubber morph failed, falling back to instant swap:', err);

                // Graceful fallback: instant swap if flubber fails'''

if old in content:
    content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    print('Fixed LiquidMorphIcon')
else:
    # Try with UTF-8 BOM version
    with open(path, 'rb') as f:
        raw = f.read()
    print('Looking for pattern in raw bytes...')
    idx = raw.find(b'catch (err: unknown)')
    print(f'Found at byte {idx}')
    if idx >= 0:
        print(repr(raw[idx:idx+200]))
