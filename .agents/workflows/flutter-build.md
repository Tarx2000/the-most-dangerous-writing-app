---
description: Local Android Build — tests, commit & push, then builds the Flutter release APK locally. No implementation plan needed.
---

<!-- 
  WORKFLOW: Local Android Release Build (Flutter-only)

  ONLY the Flutter app (`mda_flutter/`) is built, installed, and used.
  The RN app (`mda_rn/`) is retired and legacy — it is NEVER built.

  This workflow is fully automated (turbo-all). When invoked via /flutter-build:
  1. Commit and push any pending changes to remote
  2. Run the full Flutter test suite — ALL tests must pass
  3. Build the Flutter release APK for arm64 (S24 Ultra)
  4. Report the APK location with a clickable link
  
  NO implementation plan is generated. Execution starts immediately.
-->

// turbo-all

# Local Android Release Build (Flutter)

> **No implementation plan required.** This workflow executes immediately when invoked.

> [!IMPORTANT]
> **The Flutter app lives in `mda_flutter/`.** All flutter commands in this
> workflow run inside `mda_flutter/`. Git commands run from the monorepo root.
> APK output: `mda_flutter/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk`.
> The RN app in `mda_rn/` is legacy and is NEVER built anymore.

---

## Step 1 — Analyze (Zero Issues Required)

Run the Flutter analyzer. **The build is blocked if any issues are present.**

```bash
cd mda_flutter && flutter analyze
```

> [!CAUTION]
> **STOP HERE if `flutter analyze` reports any issues.** Do NOT proceed to Step 2.
> Report the output and help the user fix it. Only continue after `flutter analyze` exits clean.

---

## Step 2 — Run Test Suite

Run all project tests. **Every single test must pass before proceeding.**

```bash
cd mda_flutter && flutter test --concurrency=1
```

> [!CAUTION]
> **STOP HERE if any test fails.** Do NOT proceed to Step 3.
> Instead, report the failing tests to the user and help them fix the issues.
> Only continue to the build step after re-running tests and confirming 100% pass rate.
>
> **Widget-test rule:** testWidgets must NEVER do real DB I/O — override
> `appDataProvider` with a fake `StorageNotifier` instead.

---

## Step 3 — Commit and Push to Main/Master Branch and Remote

**All changes must be committed, merged to the primary branch (`master` or `main`), and pushed to the remote repository before building.** This ensures the APK is built from clean, versioned, and merged code.

1. Stage all modified files on your current branch (run from the monorepo root):
   ```bash
   git add -A
   ```

2. Create a conventional commit (analyze the diff and generate an appropriate `<type>(<scope>): <description>` message):
   ```bash
   git commit -m "type(scope): description"
   ```

3. **Merge and Push to the Primary Branch (`master` / `main`):**
   * If you are already on the primary branch (`master`), push directly:
     ```bash
     git push origin master
     ```
   * If you are on a feature branch, merge it into the primary branch (`master`) and push:
     ```bash
     git checkout master && git merge - --no-edit && git push origin master
     ```

> [!NOTE]
> If there are no changes to commit (working tree clean), push the current branch/master branch to ensure remote is up to date, then skip straight to Step 4.
> Never commit files that likely contain secrets (`.env`, `credentials.json`, etc.).

---

## Step 4 — Build Flutter Release APK

Build the optimized Flutter release APK for arm64 (Samsung Galaxy S24 Ultra).
`--split-per-abi` produces per-architecture APKs; the arm64 one is renamed to
the canonical `app-arm64-v8a-release.apk` name the user's phone recognizes as
an update. `--no-tree-shake-icons` keeps the full MDI font (runtime
`Mdi.get()` IconData prevents tree-shaking).

```bash
cd mda_flutter && flutter build apk --release --no-tree-shake-icons --split-per-abi
```

> [!NOTE]
> `versionCode` comes from `pubspec.yaml` (`1.5.12+2005` → code 2005). Bump the `+NNN`
> suffix for every release so Android accepts it as an update.

---

## Step 5 — Report APK Location

After a successful build, report the APK location to the user with a clickable link:

**APK output path:** [mda_flutter/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk](file:///Users/tarikkuc/Coding%20Projektordner/MostDangerousWritingApp/mda_flutter/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk)

---

## Update Hygiene (phone only sees updates it accepts)

- **Package must stay `com.anonymous.mda_flutter`** and the APK must be
  signed with the SAME key as the installed one (currently debug keys —
  see `android/app/build.gradle.kts`). A different package or key means
  "package conflicts", not an update.
- **versionCode must grow** with every release (`pubspec.yaml` `+NNN` suffix).
- The RN app (`com.anonymous.themostdangerouswritingapp`, different package
  AND different key) can NEVER be updated by a Flutter APK — data moves via backup export/import.

---

## Common Issues

- **"App not installed as package conflicts with an existing package"**: package name or signing key differs from the installed app. **Fix:** uninstall the conflicting app first (export a backup first!), then install the new APK.
- **"There was a problem parsing the package" / downgrade**: versionCode went down. **Fix:** bump the `+NNN` suffix in `mda_flutter/pubspec.yaml`.
