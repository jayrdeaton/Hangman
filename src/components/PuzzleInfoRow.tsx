import { getRgb, getTonalColor } from '@rific/auto-paper'
import { TouchableRipple } from '@rific/haptic-press'
import { JSX, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Icon, Text, useTheme } from 'react-native-paper'

import type { PuzzleDifficultyTier } from '@/utils/puzzleCatalog'

const DIFFICULTY_LABELS: Record<PuzzleDifficultyTier, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard'
}

// Fixed hue and saturation (a real, semantic green/amber/red — never touched, so "easy" always
// reads as safe and "hard" always reads as danger, independent of theme). Only LIGHTNESS is
// re-tuned per theme below, via getTonalColor (the same tool the theme itself is built from —
// see @rific/auto-paper's useComputedTheme) — so a saturated, dark-toned green/amber/red doesn't
// visually clash sitting next to a much lighter or much more muted accent color.
// Exported for src/__tests__/components/PuzzleInfoRow.test.tsx, which directly checks contrast at
// DIFFICULTY_LIGHTNESS's own declared boundary values — not just at whatever lightness a real
// accent color happens to reach today — since that boundary-safety guarantee is exactly the thing
// that's easy to silently break by tuning THEME_LIGHTNESS_NUDGE later without revisiting it.
export const DIFFICULTY_BASE_COLORS: Record<PuzzleDifficultyTier, string> = {
  easy: '#2E7D32',
  medium: '#B8860B',
  hard: '#B00020'
}

// How dark (light mode) or light (dark mode) these badges land by default, and how far a theme's
// own lightness is allowed to nudge that — clamped to a narrow band, not blended freely toward
// the theme's raw lightness. An earlier version tried a straight blend toward
// theme.colors.primary's own lightness and it read fine for typical accents, but broke down at
// the extremes: a very pale pastel accent in light mode dragged the badges light enough to drop
// below 3:1 contrast against the (light) surface, and a very dark accent in dark mode had the same
// problem in reverse.
//
// The risky bound in each mode — light's max (pushing toward the light surface) and dark's min
// (pushing toward the dark surface) — is chosen to itself guarantee at least ~4.6:1 contrast for
// all three tiers against react-native-paper's actual MD3 surface tokens (#FFFBFE light,
// #1C1B1F dark), verified by computing real WCAG contrast ratios rather than eyeballing it, so the
// guarantee holds no matter what THEME_LIGHTNESS_NUDGE below is set to — NOT merely because the
// current nudge value happens to be too small to ever reach it. (The other bound in each mode —
// light's min, dark's max — only pushes further AWAY from its surface, so it's safe by
// construction and was picked for a reasonable-looking floor/ceiling rather than a contrast limit.)
export const DIFFICULTY_LIGHTNESS = {
  light: { baseline: 0.24, min: 0.18, max: 0.3 },
  dark: { baseline: 0.7, min: 0.66, max: 0.82 }
}
const THEME_LIGHTNESS_NUDGE = 0.12

// HSL lightness only (not hue/saturation, unlike getTonalColor which also needs those to rebuild
// the color) — mirrors the same extraction getTonalColor and getTriadicPalette already do
// internally in @rific/auto-paper, just returning the one component this needs.
const getLightness = (hex: string): number => {
  const rgb = getRgb(hex)
  if (!rgb) return 0.5
  const max = Math.max(rgb.r, rgb.g, rgb.b) / 255
  const min = Math.min(rgb.r, rgb.g, rgb.b) / 255
  return (max + min) / 2
}

// Some pack labels are generated as "<Group> <Specific>" (e.g. "Theme Superheroes", "Geography
// National Parks") — run together inside the hint pill they read like a garbled sentence, so the
// group word gets split into its own "|" segment, matching every other join in that pill.
const GROUP_LABEL_PREFIXES = ['Theme', 'Geography']

const formatCatalogLabel = (label: string): string => {
  const prefix = GROUP_LABEL_PREFIXES.find((p) => label.startsWith(`${p} `))
  return prefix ? `${prefix} | ${label.slice(prefix.length + 1)}` : label
}

export type PuzzleInfoRowProps = {
  difficultyTier?: PuzzleDifficultyTier
  packLabel?: string
  hint?: string
  hintRevealed: boolean
  onRevealHint: () => void
}

export const PuzzleInfoRow = ({ difficultyTier, packLabel, hint, hintRevealed, onRevealHint }: PuzzleInfoRowProps): JSX.Element | null => {
  const theme = useTheme()
  const tertiaryColor = theme.colors.tertiary
  // The hint pill is FILLED with tertiary and draws its icon/text in onTertiary, rather than
  // tinting them tertiary against the surface the way the pips below do. tertiary is derived from
  // whatever accent the player picked (see Theme.tsx / @rific/auto-paper), and at the pale end of
  // that range — yellows especially — tertiary-on-surface text washes out to nearly unreadable.
  // onTertiary is the one color the palette guarantees is legible against tertiary, in both the
  // light and dark variants, so pairing them keeps the label readable for every accent choice.
  const onTertiaryColor = theme.colors.onTertiary

  // See DIFFICULTY_BASE_COLORS/DIFFICULTY_LIGHTNESS above for the reasoning — re-lightened per
  // theme, hue/saturation untouched. Only recomputes when the theme's mode or accent actually
  // changes, not on every guess.
  const difficultyColors = useMemo((): Record<PuzzleDifficultyTier, string> => {
    const range = theme.dark ? DIFFICULTY_LIGHTNESS.dark : DIFFICULTY_LIGHTNESS.light
    const nudge = (getLightness(theme.colors.primary) - 0.5) * THEME_LIGHTNESS_NUDGE
    const targetLightness = Math.min(range.max, Math.max(range.min, range.baseline + nudge))
    return {
      easy: getTonalColor(DIFFICULTY_BASE_COLORS.easy, targetLightness),
      medium: getTonalColor(DIFFICULTY_BASE_COLORS.medium, targetLightness),
      hard: getTonalColor(DIFFICULTY_BASE_COLORS.hard, targetLightness)
    }
  }, [theme.dark, theme.colors.primary])

  // Difficulty sits in its own pill, always visible when known — unlike the hint, glancing at it
  // isn't "getting help", so it doesn't route through hintRevealed (which onSolved reports for the
  // no-hints achievement; see achievements.ts). The pack it was drawn from and the derived
  // category/artist/year hint share a second pill next to it, revealed together by "Show hint".
  const hintSegments = [packLabel ? formatCatalogLabel(packLabel) : undefined, hint].filter((segment): segment is string => Boolean(segment))
  const hasHintContent = hintSegments.length > 0
  const hasInfoRow = Boolean(difficultyTier) || hasHintContent
  const hintAccessibilityLabel = hintSegments.join('. ')

  if (!hasInfoRow) return null

  return (
    <View style={styles.hintSlot}>
      <View style={styles.infoRow}>
        {difficultyTier ? (
          <View style={[styles.pill, { borderColor: difficultyColors[difficultyTier] }]} accessibilityLabel={`Difficulty: ${DIFFICULTY_LABELS[difficultyTier]}`}>
            <Text style={[styles.pillTextStrong, { color: difficultyColors[difficultyTier] }]}>{DIFFICULTY_LABELS[difficultyTier]}</Text>
          </View>
        ) : null}
        {hasHintContent ? (
          // One persistent TouchableRipple across both states (not a View/TouchableRipple
          // swap keyed on hintRevealed) — swapping component type on press unmounts the
          // touchable mid-gesture, tearing down the native view its ripple/underlay
          // animation is running on before it has time to play. Keeping the same element
          // and only changing its content/disabled state lets that animation finish
          // naturally. TouchableRipple itself (not Button) imposes no padding/min-height of
          // its own, so it still matches the difficulty pill's geometry exactly. The
          // @rific/haptic-press wrapper (not react-native-paper's own) fires the app's
          // haptic-setting-aware selection tap on top of that for free.
          <TouchableRipple onPress={onRevealHint} disabled={hintRevealed} accessibilityRole='button' accessibilityLabel={hintRevealed ? hintAccessibilityLabel : 'Show hint'} hitSlop={8} style={[styles.pill, { backgroundColor: tertiaryColor, borderColor: tertiaryColor }]}>
            <View style={styles.hintPill}>
              <Icon source={hintRevealed ? 'lightbulb-on' : 'lightbulb-outline'} size={15} color={onTertiaryColor} />
              <Text style={[styles.pillText, { color: onTertiaryColor }]} numberOfLines={2}>
                {hintRevealed ? hintSegments.join('  |  ') : 'Show hint'}
              </Text>
            </View>
          </TouchableRipple>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  hintPill: { alignItems: 'center', columnGap: 6, flexDirection: 'row' },
  hintSlot: { alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center', marginBottom: 4, marginTop: 4, minHeight: 38, paddingHorizontal: 24 },
  infoRow: { alignItems: 'center', columnGap: 10, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 6 },
  pill: { borderRadius: 14, borderWidth: 1.5, maxWidth: '100%', overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 5 },
  pillText: { fontSize: 13, textAlign: 'center' },
  pillTextStrong: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }
})
