# Domain Instruction: Theme System

## Scope
All UI components, screens, and feature components. Any file importing from `react-native` or `@expo/ui`.

## CRITICAL: No Hardcoded Colors
**Never use hardcoded hex/rgba values anywhere.** Every color must come from `theme.colors` in `src/styles/theme.ts`.

This includes: `#FFF`, `#fff`, `#000`, `rgba(...)` values — ALL must be theme tokens.

### Common Mappings (Memorize These)
| Hardcoded | Theme Token |
|---|---|
| `#FFF` / `#fff` | `theme.colors.textPrimary` |
| `#000` / `#000000` | `theme.colors.background` |
| `rgba(255,255,255,0.6)` | `theme.colors.textSecondary` |
| `rgba(255,255,255,0.4)` | `theme.colors.textDim` |
| `rgba(255,255,255,0.3)` | `theme.colors.textMuted` |
| `rgba(255,255,255,0.5)` | `theme.colors.lightGrey` |
| `rgba(255,255,255,0.2)` | `theme.colors.grey` |
| `rgba(255,255,255,0.1)` | `theme.colors.glassBorder` |
| `rgba(255,255,255,0.05)` | `theme.colors.glassBackground` |
| `rgba(255,255,255,0.06)` | `theme.colors.glassSurface` |
| `rgba(255,255,255,0.08)` | `theme.colors.glassSurfaceMedium` |
| `rgba(255,255,255,0.12)` | `theme.colors.glassBorderMedium` |
| `rgba(255,255,255,0.15)` | `theme.colors.glassHighlight` |
| `rgba(0,0,0,0.6)` | `theme.colors.modalBackground` |
| `rgba(0,0,0,0.85)` | `theme.colors.overlayMedium` |
| `rgba(10,10,10,0.88)` | `theme.colors.overlayLockAndroid` |
| `#FF2A2A` | `theme.colors.danger` |
| `#4ADE80` | `theme.colors.green` |
| `#FF6B35` | `theme.colors.orange` |
| `#FFD700` | `theme.colors.gold` |

### Allowed Exceptions
1. `transparent` string literal
2. Dynamically-constructed colors in animation code (e.g., `rgba(r, g, b, blend)` in `DangerOverlay` which uses CONFIG values)
3. Values inside `alignmentScores.ts` — single source of truth for alignment score visuals

## Naming Conventions for New Tokens
- **Danger scale**: `dangerSubtle` (0.06) → `dangerLight` (0.08) → `dangerTint` (0.1) → `dangerFill` (0.15) → `dangerBorderStrong` (0.3) → `dangerFillStrong` (0.3) → `dangerOverlayLight` (0.45)
- **Glass scale**: `glassBackground` → `glassSurface` → `glassSurfaceMedium` → `glassBorder` → `glassBorderSubtle` → `glassBorderMedium` → `glassHighlight`
- **Surface scale**: `background` (#000) → `surfaceDark` (#0A0A0A) → `surfaceRaised` (#1A1A1A) → `surfaceMedium` (#111) → `surfaceLight` (#222)
- **Animation springs**: `theme.animation.springDefault` / `springSnappy` / `springGentle` / `springLight`

## Liquid Glass UI
- Use `expo-glass-effect` where available
- For custom implementations, follow the Apple Liquid Glass design guidelines (see skill `expo-liquid-glass`)
- Liquid Glass components: `LiquidGlassNav`, `LiquidMorphIcon`
