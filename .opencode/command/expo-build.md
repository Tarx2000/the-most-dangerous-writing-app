---
description: Local Android Release Build — lint, tests, commit & push, then build a release APK (source of truth: .agents/workflows/expo-build.md)
mode: build
---

# Local Android Release Build

> **All RN commands run inside `mda_rn/`** — the React Native app lives in the `mda_rn/` subfolder of this monorepo.

Execute the canonical workflow stored at **`.agents/workflows/expo-build.md`** — it is the single source of truth for this command. Read it first and follow its steps exactly:

1. **Step 1** — `cd mda_rn && npm run lint` (zero errors required, else STOP and report)
2. **Step 2** — `cd mda_rn && npm test` (100 % pass rate required, else STOP and only REPORT — do not fix)
3. **Step 3** — commit & push pending changes to `master` from the repo root (or push to keep remote up to date)
4. **Step 4** — `cd mda_rn/android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --quiet`
5. **Step 5** — report the APK path as a clickable link (`mda_rn/android/app/build/outputs/apk/release/app-release.apk`)

Troubleshooting (ninja/Windows/buffer issues) is documented in the workflow file — read it for edge cases before deviating.
