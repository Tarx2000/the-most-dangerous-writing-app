---
description: Local Android Release Build — lint, tests, commit & push, then build a release APK (source of truth: .agents/workflows/expo-build.md)
mode: build
---

# Local Android Release Build

Execute the canonical workflow stored at **`.agents/workflows/expo-build.md`** — it is the single source of truth for this command. Read it first and follow its steps exactly:

1. **Step 1** — `npm run lint` (zero errors required, else STOP and report)
2. **Step 2** — `npm test` (100 % pass rate required, else STOP and only REPORT — do not fix)
3. **Step 3** — commit & push pending changes to `master` (or push to keep remote up to date)
4. **Step 4** — `cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --quiet`
5. **Step 5** — report the APK path as a clickable link

Troubleshooting (ninja/Windows/buffer issues) is documented in the workflow file — read it for edge cases before deviating.
