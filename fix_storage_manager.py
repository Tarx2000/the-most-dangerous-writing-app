with open('src/lib/storageManager.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the inner catch in the file deletion loop
content = content.replace(
    "try {\n                    await FileSystem.deleteAsync(fullPath, { idempotent: true });\n                    cleaned++;\n                } catch {\n\n                    // File may be locked \u2014 skip",
    "try {\n                    await FileSystem.deleteAsync(fullPath, { idempotent: true });\n                    cleaned++;\n                } catch (err) {\n                    console.warn('[StorageManager] Failed to delete orphaned vlog:', fullPath, err);"
)

# Fix the outer catch in cleanupOrphanedVlogs
content = content.replace(
    "    } catch {\n\n        // Directory read failed \u2014 nothing to clean",
    "    } catch (err) {\n        console.warn('[StorageManager] Failed to read vlog directory:', vlogDir, err);"
)

with open('src/lib/storageManager.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done')
