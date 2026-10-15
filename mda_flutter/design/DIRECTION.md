# Dangerous Journal — Design Direction

## The Brief

- **App:** Dangerous Journal (High-Stakes Writing & Flow Journal).
- **Audience:** High-performers, introspective thinkers, and creators who struggle with overthinking, procrastination, or writer's block and want real accountability.
- **Core Action:** Open the app, choose difficulty (or subject: self vs. circle/person), and immediately hit "Start Writing" (within 10 seconds).
- **Signature Mechanic:** Inactivity countdown timer. If you stop writing for more than a few seconds (e.g. 2–5s depending on difficulty), your current session vaporizes into smoke.
- **Three Words:** Minimal, High-Tension, Obsidian (AMOLED).
- **Outside References:** 
  1. Liquid Glass & Leica lenses (physical optical refraction & precision specular rim).
  2. The Monolith (pure black OLED, absolute stillness, razor-sharp light reflection).
  3. Chronometer / Cockpit telemetry (exact urgency, countdown dial, vital feedback).
- **User Requirements:**
  - Dramatically reduce text and clutter. Cut out verbose explanations and cliché motivational subtitles.
  - Modern, fluid Liquid Glass aesthetic with AMOLED black background.
  - High performance, stable, instant touch feedback.
  - Remove AI tells (no emoji icons, no purple/indigo glows, no cheesy wellness pastel cards).

---

## Current app audit

### Audit of before-start screen
- **Slop tells identified:**
  - Emoji icons in navigation & top bar (`🔥`, `🔒`, `⚙️`, `✍️`, `⚡`, `👥`, `📹`, `🎯`).
  - Text clutter: subtitle paragraphs explaining the obvious ("Write continuously, or all is lost.", "Record your thoughts on camera.").
  - Low contrast numbers on tick dial and difficulty pills (3.6:1 – 3.8:1).
  - Stacked pill containers competing with each other without clear visual hierarchy.
  - Inconsistent type scale (9 distinct text sizes across the screen).

### Inventory
- **Keep:**
  - 4 core modes: Journal (Free writing), Circles (People/Relationships), Vlog (Video Journal), Check-in (Alignment / Life Satisfaction).
  - Inactivity vaporization timer logic and difficulty tiers (Easy / Mid / Hard).
  - Session duration selector (3, 5, 10, 15, 20 min).
  - Quick note / Tweet sprint (280-char option).
  - Streak & Vision Lock indicators.
  - Bottom navigation bar with smooth gesture reveal for feed and swipe to library.
- **Lose:**
  - Emoji icons in UI controls and navigation.
  - Explanatory subline paragraphs cluttering the hero.
  - Generic Google fonts (SpaceMono, PlayfairDisplay, DMSans) in favor of Apple's calibrated SF Pro suite (SF Pro Expanded for hero display, SF Pro Text for UI, SF Mono for countdown telemetry).
  - Low-contrast grey text and muddy container outlines.
- **Decisions for user:**
  - Transform the hero into a sleek optical lens or clean typographic countdown instead of a generic concentric ring.
  - Replace the text-heavy difficulty buttons with an integrated Liquid Glass slider pill.
  - Clean up the bottom navigation into a floating Liquid Glass capsule using native vector iconography.

---

## The Three Directions (Exploration)

1. **Direction A — "The Smoked Lens" (Material Craft / Obsidian & Liquid Glass)**
   *Concept:* Dangerous Journal is an obsidian optical lens cut with diamond precision.
   - Ground: True AMOLED Black (`#000000`).
   - Type: SF Pro Expanded (display) + SF Pro Text.
   - Richness: Specular glass refraction, razor-thin 1px light edges, frosted blur, smoked black lenses.
   - Accent: Signal Crimson (`#FF3B30`).

2. **Direction B — "The Flow Telemetry" (Instrument / Precision Cockpit)**
   *Concept:* Dangerous Journal is a supersonic flight chronometer measuring flow rate under pressure.
   - Ground: Deep Carbon Black (`#070709`).
   - Type: SF Pro Compressed (numeral scale) + SF Mono (telemetry figures) + SF Pro Text.
   - Richness: Hairline data grid, linear pressure gauge, micro-tick marks.
   - Accent: Sodium Amber / Ember (`#FF9500`).

3. **Direction C — "The Tension Manifesto" (Swiss Typographic Poster)**
   *Concept:* Dangerous Journal is an avant-garde editorial manifesto on urgency.
   - Ground: Stark High-Contrast Black (`#000000`) with warm bone typography (`#F5F3EF`).
   - Type: New York (heavy editorial serif display) + SF Pro tracking.
   - Richness: Extreme typographic scale (56pt vs 13pt), asymmetric whitespace, singular red ink stamp.
   - Accent: International Signal Red (`#E5322D`).

