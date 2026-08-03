import { TouchableRipple } from '@rific/haptic-press'
import { JSX } from 'react'
import { StyleSheet, View } from 'react-native'
import { Icon, Text, useTheme } from 'react-native-paper'

import { useDifficultyColors } from '@/hooks/useDifficultyColors'
import type { PuzzleDifficultyTier } from '@/utils/puzzleCatalog'

const DIFFICULTY_LABELS: Record<PuzzleDifficultyTier, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard'
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
  // easy/medium/hard map onto @rific/auto-paper's success/warning/danger theme roles — see
  // useDifficultyColors. Shared with PuzzleDrawer's difficulty picker, so both reflect the exact
  // same colors.
  const difficultyColors = useDifficultyColors()

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
