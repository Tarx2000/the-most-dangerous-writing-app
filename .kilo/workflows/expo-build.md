---
description: Local Android Build — runs all tests first, then builds a release APK locally. No implementation plan needed.
---

<!-- 
  WORKFLOW: Local Android Release Build
  
  This workflow is fully automated (turbo-all). When invoked via /expo-build:
  1. Run the full test suite — ALL tests must pass
  2. Build a local release APK via Gradle
  3. Report the APK location with a clickable link
  
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
> **STOP HERE if any test fails.** Do NOT proceed to Step 4.  
> Instead, report the failing tests to the user and help them fix the issues. But dont fix anything yourself! ONLY REPORT THE ISSUE!
> Only continue to the build step after re-running tests and confirming 100% pass rate.

**What this runs:** `jest` with the project's `jest.config.js`, which discovers all `*.test.ts` / `*.test.tsx` files under `src/lib/__tests__/`.

---

## Step 2 — Build Release APK

Build an optimized local release APK targeting 64-bit modern devices (arm64-v8a architecture for significant build-time reduction):

```bash
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

---

## Step 3 — Report APK Location

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