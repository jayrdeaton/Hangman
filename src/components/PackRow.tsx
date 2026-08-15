import { Card } from '@rific/haptic-press'
import { JSX, memo, ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { Avatar, ProgressBar, Text, useTheme } from 'react-native-paper'

import { packGroupColors, packGroupIcon, packGroupLabel } from '@/utils/packGroupStyle'

export type PackRowProps = {
  label: string
  // Small eyebrow tag shown above the label for a pack that's one of several related siblings
  // (e.g. "Sports" above "NFL"). Only rendered (and only recolors the card) when `isPack` is true
  // — see its own comment below for why a puzzle row inside a pack never sets this.
  group?: string
  // True for a row that represents a whole PACK (PuzzleDrawer/PacksScreen/AchievementsDrawer's
  // own pack lists) — false (the default) for a row that represents a single PUZZLE within one
  // (PackPuzzleList), which has no group of its own to show. Gates the group icon/eyebrow AND the
  // card's own tinted background: without this split, an ungrouped custom pack (group=== undefined,
  // meant to fall back to the "Custom" bucket — see packGroupStyle.ts) would be indistinguishable
  // from a plain puzzle row, which never has a group at all and must stay untinted.
  isPack?: boolean
  subtitle?: string
  // Renders in place of the plain subtitle text when provided — e.g. a colored difficulty pill
  // instead of "Hard" as flat gray text (see PackPuzzleList's own usage). subtitle itself becomes
  // optional in that case; nothing else about the row depends on it being present.
  subtitleBadge?: ReactNode
  progress?: number
  onPress?: () => void
  onLongPress?: () => void
  leading?: ReactNode
  trailing?: ReactNode
  // Overrides the accessible name derived from label/subtitle's own text content — needed
  // whenever that text isn't meant to be read literally (e.g. a masked "_ _ _ _" blank row).
  accessibilityLabel?: string
  // A stable per-row identifier for callers whose label/subtitle/accessibilityLabel can collide
  // across rows (e.g. two masked puzzles that happen to share a letter count) — label text alone
  // isn't always enough to target one specific row.
  testID?: string
}

// Memoized: every caller now renders this as a FlatList renderItem (PuzzleDrawer/PacksScreen/
// AchievementsDrawer's pack lists, up to 50 rows in the built-in manifest) rather than a plain
// .map() inside a ScrollView — this component is the actual list-item cost that virtualization
// exists to avoid paying for off-screen rows, so keeping it a pure, memoizable presentational
// component (no inline-recreated non-primitive props from its own body) matters here.
export const PackRow = memo(({ label, group, isPack = false, subtitle, subtitleBadge, progress, onPress, onLongPress, leading, trailing, accessibilityLabel, testID }: PackRowProps): JSX.Element => {
  const theme = useTheme()
  // Cycles primary/secondary/tertiary per group (see packGroupStyle.ts) so scanning down a long
  // pack list reads as visibly different clusters instead of one uniform color end to end —
  // untinted (plain `card`) for a puzzle row, which has no group concept at all.
  const groupColors = isPack ? packGroupColors(group, theme) : null

  const card = (
    <Card style={[styles.card, groupColors ? { backgroundColor: groupColors.container } : null]} mode='contained' onPress={onPress} onLongPress={onLongPress} testID={testID}>
      <Card.Content style={styles.row}>
        {/* Same badge-on-the-left shape as AchievementsDrawer's own achievement cards (Avatar.Icon
            at the vibrant triad color, size 40) — group identity reads at the same glance-weight
            as achievement/locked state does there. */}
        {groupColors ? <Avatar.Icon size={40} icon={packGroupIcon(group)} color={groupColors.onColor} style={{ backgroundColor: groupColors.color }} /> : null}
        {leading}
        <View style={styles.text}>
          {groupColors ? (
            <Text variant='labelSmall' style={[styles.group, { color: groupColors.color }]}>
              {packGroupLabel(group).toUpperCase()}
            </Text>
          ) : null}
          <Text variant='titleSmall' style={groupColors ? { color: groupColors.onContainer } : undefined}>
            {label}
          </Text>
          {subtitleBadge ??
            (subtitle ? (
              <Text variant='bodySmall' style={[styles.muted, groupColors ? { color: groupColors.onContainer } : null]}>
                {subtitle}
              </Text>
            ) : null)}
          {progress === undefined ? null : (
            <View style={styles.progressBarWrapper}>
              <ProgressBar progress={progress} style={[styles.progressBar, { backgroundColor: theme.colors.surface }]} />
            </View>
          )}
        </View>
        {trailing}
      </Card.Content>
    </Card>
  )

  // react-native-paper's Card forwards an unrecognized prop like accessibilityLabel onto its own
  // outer, non-accessible wrapper — not onto the inner Pressable that's actually exposed to a
  // screen reader (Card builds that Pressable from its own fixed prop list, accessibilityLabel
  // not among them). Passing it straight to Card, as this used to, silently never reached
  // VoiceOver/TalkBack at all. Wrapping in an accessible View here is what actually works:
  // accessible=true collapses the whole subtree into one element using this label, instead of the
  // default fallback of reading every descendant Text node — a masked row's literal "_ _ _ _".
  return accessibilityLabel ? (
    <View accessible accessibilityLabel={accessibilityLabel} accessibilityRole={onPress ? 'button' : undefined}>
      {card}
    </View>
  ) : (
    card
  )
})
PackRow.displayName = 'PackRow'

const styles = StyleSheet.create({
  card: { marginBottom: 4 },
  group: { fontWeight: '700', letterSpacing: 0.5 },
  muted: { opacity: 0.7 },
  progressBar: {
    borderRadius: 6,
    height: 6
  },
  progressBarWrapper: {
    height: 6,
    marginTop: 8,
    overflow: 'hidden'
  },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  text: { flex: 1, flexShrink: 1 }
})
