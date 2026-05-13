---
description: Local Android Build — commits pending changes, pushes to remote, runs all tests, then builds a release APK locally. No implementation plan needed.
---

<!-- 
  WORKFLOW: Local Android Release Build
  
  This workflow is fully automated (turbo-all). When invoked via /expo-build:
  1. Commit and push any pending changes to remote
  2. Run the full test suite — ALL tests must pass
  3. Build a local release APK via Gradle
  4. Report the APK location with a clickable link
  
  NO implementation plan is generated. Execution starts immediately.
-->

// turbo-all

# Local Android Release Build

> **No implementation plan required.** This workflow executes immediately when invoked.

---

## Step 1 — Lint Check (Zero Errors Required)

Run ESLint. **The build is blocked if any errors are present.**

```bash
npm run lint
```

> [!CAUTION]
> **STOP HERE if ESLint reports any errors.** Do NOT proceed to Step 2.  
> Warnings are acceptable, but **errors must be zero**. Report the error output and help the user fix it. Only continue after `npm run lint` exits clean.

---

## Step 2 — Run Test Suite

Run all project tests. **Every single test must pass before proceeding.**

```bash
npm test
```

> [!CAUTION]
> **STOP HERE if any test fails.** Do NOT proceed to Step 3.  
> Instead, report the failing tests to the user and help them fix the issues. But dont fix anything yourself! ONLY REPORT THE ISSUE!
> Only continue to the build step after re-running tests and confirming 100% pass rate.

**What this runs:** `jest` with the project's `jest.config.js`, which discovers all `*.test.ts` / `*.test.tsx` files under `src/lib/__tests__/`.

---

## Step 3 — Commit and Push to Remote

**All changes must be committed and pushed to the remote repository before building.** This ensures the APK is built from code that is safely backed up and versioned.

1. Stage all modified files:
   ```bash
   git add -A
   ```

2. Create a conventional commit (the agent should analyze the diff and generate an appropriate `<type>(<scope>): <description>` message):
   ```bash
   git commit -m "type(scope): description"
   ```

3. **Push to remote origin:**
   ```bash
   git push origin $(git branch --show-current)
   ```

> [!NOTE]
> If there are no changes to commit (working tree clean), skip straight to Step 4.
> Never commit files that likely contain secrets (`.env`, `credentials.json`, etc.).

---

## Step 4 — Build Release APK

Build an optimized local release APK targeting 64-bit modern devices (arm64-v8a architecture for significant build-time reduction).

**CRITICAL: Use `--quiet` flag** — Gradle produces thousands of lines of task output. Without `--quiet`, the agent's shell buffer overflows (51,200-byte / 2,000-line limit), causing a perceived infinite hang on Windows even though the build already finished. `--quiet` suppresses task spam and only prints warnings, errors, and the final `BUILD SUCCESSFUL` message.

**Unix/macOS:**
```bash
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --quiet
```

**Windows (must use `cmd /c` for `.bat` scripts):**
```cmd
cmd /c "cd /d android && gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a --quiet"
```

> [!NOTE]
> `gradlew.bat` is a batch file and requires the `cmd /c` wrapper to execute correctly in non-CMD shells. Direct execution via `cd android && gradlew.bat ...` fails with "'gradlew.bat' is not recognized" because the shell spawns a new process that cannot resolve `.bat` files directly.

---

## Step 5 — Report APK Location

After a successful build, report the APK location to the user with a clickable link:

**APK output path:** [app-release.apk](file:///c:/Users/Tarik/.gemini/antigravity/scratch/the-most-dangerous-writing-app/android/app/build/outputs/apk/release/app-release.apk)

---

## Hardware Acceleration & Parallelization

To fully utilize PC performance (e.g. bundling 1500+ modules in seconds), ensure `android/gradle.properties` contains:

```properties
org.gradle.parallel=true
org.gradle.daemon=true
org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=512m
```

---

## Common Issues

- **"App not installed as package conflicts with an existing package"**: When installing a locally built APK over an EAS Cloud build (or vice-versa), Android blocks the installation because the cryptographic signing keys do not match. **Fix:** Simply uninstall the existing version of the app from your smartphone first, then install the new APK.
- **"ninja: error: manifest 'build.ninja' still dirty after 100 tries" (Windows)**: A notorious bug caused by the Android SDK shipping an outdated Ninja executable (v1.10) that ignores the Windows 260-character Long Path Registry override. **Fix:** Download Ninja v1.12.1+ from GitHub and replace the bundled executable at `%LOCALAPPDATA%\Android\Sdk\cmake\3.22.1\bin\ninja.exe`.
- **"Metro bundler error after installing native modules"**: Run `npx expo start -c` to clear cache.
- **"Build fails with missing babel-preset-expo"**: Run `npm install --save-dev babel-preset-expo`.
- **"App crashes on startup after adding reanimated"**: Ensure `babel.config.js` includes `'react-native-reanimated/plugin'` as the LAST plugin.
- **`gradlew.bat` not recognized on Windows**: Batch files (`.bat`) cannot be executed directly from non-CMD shells. Always use `cmd /c "cd /d android && gradlew.bat ..."` instead of `cd android && gradlew.bat ...`.
- **Agent appears stuck during build (Windows)**: Gradle prints thousands of task lines. The bash tool truncates output at 51,200 bytes / 2,000 lines, and the buffer flush can take 20–30 seconds after the build actually finished. **Fix:** Always append `--quiet` to the Gradle command (see Step 4). This suppresses the task spam and prevents the buffer overflow hang.
