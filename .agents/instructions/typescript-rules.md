# Domain Instruction: TypeScript & Code Quality

## Scope
All `.ts` and `.tsx` files.

## Strict TypeScript Rules
- **No `any` types** — always use proper interfaces
- **Type guards**: Use `isAlignmentReflection(note)`, never `(note as any).isAlignmentReflection`
- **Complex prop types**: Use `ReturnType<typeof useHook>` to derive from hooks

## Style & Patterns
- **StyleSheet.create()** over inline `style={{}}`. Only dynamic values (e.g., `width: progress + '%'`) should be inline.
- **Dimensions**: Always use `useWindowDimensions()` hook, never module-level `Dimensions.get('window')`. The latter freezes values at module load and breaks on rotation.
- **Error handling**: Never bare `catch (_) {}` or `.catch(() => {})`. Always log with context:
  ```typescript
  try { ... } catch (err) {
    console.error('[ModuleName] Operation failed:', err);
  }
  ```

## React Compiler
- Enabled via `babel-plugin-react-compiler` (target 19)
- Do not add explicit `useMemo`/`useCallback` where the compiler handles it
- Existing explicit memoization is kept for clarity with the ref pattern

## Alignment Score Logic
Always use `getAlignmentScoreDetails()`, `getAlignmentScoreColor()`, or `getAlignmentScoreFeed()` from `@/lib/alignmentScores`. Never duplicate score-tier logic inline.

## Version Pinning (Do NOT Upgrade)
These packages are pinned to match Expo SDK 55's bundled native code. Upgrading causes `installTurboModule` crashes:

| Package | Pinned Version |
|---|---|
| `react-native-reanimated` | **4.2.1** |
| `react-native-worklets` | **0.7.2** |
| `jest` | **~29.7.0** |
| `@types/jest` | **29.5.14** |

**Before upgrading any dependency**, run `npx expo-doctor` and ensure all 17 checks pass.
