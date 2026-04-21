with open('src/lib/storageManager.ts', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace(
    "try {\n                    await FileSystem.deleteAsync(fullPath, { idempotent: true });\n                    cleaned++;\n                } catch {\n\n                    // File may be locked",
    "try {\n                    await FileSystem.deleteAsync(fullPath, { idempotent: true });\n                    cleaned++;\n                } catch (err) {\n                    console.warn('[StorageManager] Failed to delete orphaned vlog:', fullPath, err);"
)
content = content.replace(
    "    } catch {\n\n        // Directory read failed",
    "    } catch (err) {\n        console.warn('[StorageManager] Failed to read vlog directory:', vlogDir, err);"
)
with open('src/lib/storageManager.ts', 'w', encoding='utf-8') as f:
    f.write(content)

with open('src/components/ui/LiquidMorphIcon.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace(
    "            } catch {\n\n                // Graceful fallback",
    "            } catch (err) {\n                console.warn('[LiquidMorphIcon] Flubber morph failed, using fallback:', err);\n\n                // Graceful fallback"
)
with open('src/components/ui/LiquidMorphIcon.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

with open('src/components/features/library/PersonProfileModal.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace(
    "        } catch {\n\n            return dateStr;",
    "        } catch (err) {\n            console.warn('[PersonProfileModal] Failed to format birthday:', dateStr, err);\n            return dateStr;"
)
with open('src/components/features/library/PersonProfileModal.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('All done')
