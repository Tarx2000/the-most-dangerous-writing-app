# Startup, AI Providers & Writing Screen Polish Task

## Checklist

- [x] **Optimize app startup**
  - [x] Update native splash background color in [app.json](file:///c:/Users/Tarik/.gemini/antigravity/scratch/the-most-dangerous-writing-app/app.json) to `#000000`
  - [x] Import and lock `expo-splash-screen` in [App.tsx](file:///c:/Users/Tarik/.gemini/antigravity/scratch/the-most-dangerous-writing-app/App.tsx), then hide it when `fontsLoaded` becomes true
  - [x] Define and pass custom black-background `navigationTheme` to `NavigationContainer` in [App.tsx](file:///c:/Users/Tarik/.gemini/antigravity/scratch/the-most-dangerous-writing-app/App.tsx)
- [x] **Add Multiple AI Providers (Ollama & Neuralwatt)**
  - [x] Update config variables and storage keys in [src/config/ai.ts](file:///c:/Users/Tarik/.gemini/antigravity/scratch/the-most-dangerous-writing-app/src/config/ai.ts)
  - [x] Update `LoadContext` and loading logic in [src/lib/dataLoaders.ts](file:///c:/Users/Tarik/.gemini/antigravity/scratch/the-most-dangerous-writing-app/src/lib/dataLoaders.ts)
  - [x] Update context state, refs, computed variables, and operations in [src/lib/hooks/useStorage.tsx](file:///c:/Users/Tarik/.gemini/antigravity/scratch/the-most-dangerous-writing-app/src/lib/hooks/useStorage.tsx)
  - [x] Update queue dependency tracking in [src/lib/hooks/useAiQueueProvider.tsx](file:///c:/Users/Tarik/.gemini/antigravity/scratch/the-most-dangerous-writing-app/src/lib/hooks/useAiQueueProvider.tsx)
  - [x] Support conditional payloads and dynamic endpoint routing in [src/lib/aiService.ts](file:///c:/Users/Tarik/.gemini/antigravity/scratch/the-most-dangerous-writing-app/src/lib/aiService.ts)
  - [x] Add provider selector and adjust dynamic key/URL fields in [src/components/features/settings/AiSettingsPanel.tsx](file:///c:/Users/Tarik/.gemini/antigravity/scratch/the-most-dangerous-writing-app/src/components/features/settings/AiSettingsPanel.tsx)
  - [x] Load dynamic model selections and pass state in [src/components/features/settings/SettingsModal.tsx](file:///c:/Users/Tarik/.gemini/antigravity/scratch/the-most-dangerous-writing-app/src/components/features/settings/SettingsModal.tsx)
- [x] **Fix Writing Screen Alignment**
  - [x] Adjust paddings and add `includeFontPadding: false` to align `<TextInput>` and `<VaporizingText>` in [src/screens/WritingScreen.tsx](file:///c:/Users/Tarik/.gemini/antigravity/scratch/the-most-dangerous-writing-app/src/screens/WritingScreen.tsx)
- [x] **Verify changes**
  - [x] Run linter and typecheck
  - [x] Run test suite
