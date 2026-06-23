# Startup, Text Shift & Settings Polish Checklist

- [x] **1. Startup Flash Fix (Native Android)**
  - [x] Set `splashscreen_background` to `#000000` in [colors.xml](file:///c:/Users/Tarik/.gemini/antigravity/scratch/the-most-dangerous-writing-app/android/app/src/main/res/values/colors.xml)
  - [x] Set `android:windowBackground` to `#000000` in [styles.xml](file:///c:/Users/Tarik/.gemini/antigravity/scratch/the-most-dangerous-writing-app/android/app/src/main/res/values/styles.xml)
- [x] **2. Writing Screen Text Shift Fix**
  - [x] Update [VaporizingText.tsx](file:///c:/Users/Tarik/.gemini/antigravity/scratch/the-most-dangerous-writing-app/src/components/features/writing/VaporizingText.tsx) to pass down style to `VaporizingWord`
  - [x] Update `VaporizingWord` to accept style and animate text color's alpha channel instead of layout opacity
- [x] **3. AI Settings Provider Dropdown**
  - [x] Refactor [AiSettingsPanel.tsx](file:///c:/Users/Tarik/.gemini/antigravity/scratch/the-most-dangerous-writing-app/src/components/features/settings/AiSettingsPanel.tsx) to use dropdown styling and callback
  - [x] Add `showProviderModal` state and ActionSheet in [SettingsModal.tsx](file:///c:/Users/Tarik/.gemini/antigravity/scratch/the-most-dangerous-writing-app/src/components/features/settings/SettingsModal.tsx)
- [x] **4. Dynamic Model Fetching**
  - [x] Update useEffect in [SettingsModal.tsx](file:///c:/Users/Tarik/.gemini/antigravity/scratch/the-most-dangerous-writing-app/src/components/features/settings/SettingsModal.tsx) to refetch on provider/credential changes
- [x] **5. Verification**
  - [x] Run linter
  - [x] Run test suite
