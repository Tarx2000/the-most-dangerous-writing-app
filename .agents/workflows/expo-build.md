---
description: Expo Build & Deploy - Step-by-step guide to build APKs and deploy the app
---

# Expo Build & Deploy Skill

## Prerequisites
- Expo account (free at expo.dev)
- EAS CLI installed: `npm install -g eas-cli`
- Logged in: `eas login`

## Build APK (Android)

### 1. Configure `eas.json`
Ensure your `eas.json` has a preview profile that outputs an APK:
```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

### 2. Bump Version
In `app.json`, increment `expo.version` and `expo.android.versionCode`:
```json
"version": "1.1.0",
"android": {
  "versionCode": 2
}
```

### 3. Build
// turbo
```bash
eas build -p android --profile preview
```

### 4. Download
After the build completes (~5-10 min), download the APK from the Expo dashboard or use:
// turbo
```bash
eas build:list --platform android --limit 1
```

## Build iOS (requires Apple Developer account)
// turbo
```bash
eas build -p ios --profile preview
```

## Local Development Build (no cloud)
For testing native modules locally without EAS cloud:
// turbo
```bash
npx expo run:android
```

### Generating Local Release APK
To build a local release APK quickly without using the cloud (useful for rapid testing):
// turbo
```bash
cd android && ./gradlew assembleRelease
```
The resulting APK will be located at `android/app/build/outputs/apk/release/app-release.apk`.

## Common Issues
- **"App not installed as package conflicts with an existing package"**: When installing a locally built APK over an EAS Cloud build (or vice-versa), Android blocks the installation because the cryptographic signing keys do not match. **Fix:** Simply uninstall the existing version of the app from your smartphone first, then install the new APK.
- **"ninja: error: manifest 'build.ninja' still dirty after 100 tries" (Windows)**: A notorious bug caused by the Android SDK shipping an outdated Ninja executable (v1.10) that ignores the Windows 260-character Long Path Registry override. **Fix:** Download Ninja v1.12.1+ from GitHub and replace the bundled executable at `%LOCALAPPDATA%\Android\Sdk\cmake\3.22.1\bin\ninja.exe`.
- **"Metro bundler error after installing native modules"**: Run `npx expo start -c` to clear cache.
- **"Build fails with missing babel-preset-expo"**: Run `npm install --save-dev babel-preset-expo`.
- **"App crashes on startup after adding reanimated"**: Ensure `babel.config.js` includes `'react-native-reanimated/plugin'` as the LAST plugin.
