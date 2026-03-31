import os
path = os.environ.get("PATH", "")
with open("path.txt", "w", encoding="utf-8") as f:
    f.write(path)
