---
description: Local Android Release Build — analyze, tests, commit & push, then build the Flutter release APK (source of truth: .agents/workflows/flutter-build.md)
mode: build
---

# Local Android Release Build (Flutter-only)

> **The Flutter app lives in `mda_flutter/`** — it is the ONLY app that gets
> built, installed and used. The RN app (`mda_rn/`) is legacy and is NEVER built.

Execute the canonical workflow stored at **`.agents/workflows/flutter-build.md`** — it is the single source of truth for this command. Read it first and follow its steps exactly:

1. **Step 1** — `cd mda_flutter && flutter analyze` (zero issues required, else STOP and report)
2. **Step 2** — `cd mda_flutter && flutter test --concurrency=1` (100 % pass rate required, else STOP and report)
3. **Step 3** — commit & push pending changes to `master` from the repo root (or push to keep remote up to date)
4. **Step 4** — `cd mda_flutter && flutter build apk --release --no-tree-shake-icons --split-per-abi` (canonical name `app-arm64-v8a-release.apk`)
5. **Step 5** — report the APK path as a clickable link (`mda_flutter/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk`)
