# Domain Instruction: Theme System & AMOLED Visuals (Flutter)

## Scope
All UI components, widgets, and screens under `mda_flutter/lib/ui/`.

## AMOLED Standard & Pure Black Canvas
- **Background**: Strictly pure AMOLED black (`#000000` via `AppColors.background`). Never substitute dark gray for the root background.
- **Tokens Only**: Never use hardcoded hex or raw `Color(0x...)` values in widgets. All colors must be imported from `mda_flutter/lib/core/theme/app_colors.dart` (`AppColors.*`).

### Primary Token Hierarchy (`AppColors`)
- **Background & Surfaces**:
  - `AppColors.background` (`#000000`)
  - `AppColors.surfaceDark` (`#0A0A0A`)
  - `AppColors.surfaceRaised` (`#1A1A1A`)
  - `AppColors.surfaceCard` (`#161616`)
  - `AppColors.surfaceMedium` (`#111111`)
  - `AppColors.surfaceLight` (`#222222`)
- **Text Ladder**:
  - `AppColors.textPrimary` (`#FFFFFF`)
  - `AppColors.textSecondary` (`rgba(255,255,255,0.6)`)
  - `AppColors.textDim` (`rgba(255,255,255,0.4)`)
  - `AppColors.textMuted` (`rgba(255,255,255,0.3)`)
- **Accents & Danger**:
  - `AppColors.danger` (`#FF2A2A`)
  - `AppColors.dangerBorder` (`#FF4D4D`)
  - `AppColors.green` (`#4ADE80`)
  - `AppColors.orange` (`#FF6B35`)
  - `AppColors.gold` (`#FFD700`)

## Liquid Glass UI & Fallback
- **Standard UI Treatment**: Floating pills, bottom tab navigation (`LiquidGlassNav`), and elevated modal cards use liquid glass shaders via `liquid_glass_easy: ^4.3.1`.
- **Mandatory Solid Fallback**: Every liquid glass element must supply a clean fallback using `AppColors.overlayLockAndroid` (`rgba(10,10,10,0.88)`) and `AppColors.glassBorder` when glass effects are disabled in user settings or on unsupported devices.
