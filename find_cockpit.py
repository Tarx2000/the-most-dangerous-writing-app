import os

result = []
for root, dirs, files in os.walk(r"C:\Users\Tarik"):
    for file in files:
        if "cockpit" in file.lower() and file.lower().endswith(".exe"):
            result.append(os.path.join(root, file))

with open("found.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(result))
