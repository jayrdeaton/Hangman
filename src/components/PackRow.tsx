import { Card } from '@rific/feedback-press'
import { JSX, memo, ReactNode, useCallback } from 'react'
import { type AccessibilityActionEvent, Platform, StyleSheet, View } from 'react-native'
import { Avatar, ProgressBar, Text, useTheme } from 'react-native-paper'

import { packGroupColors, packGroupIcon, packGroupLabel } from '@/utils/packGroupStyle'

// A control in a row's `trailing` (browse a pack, remove it), offered to a screen
// reader as one of the row's actions too: see PackRow's wrapper below for why the button itself can't be.
export type PackRowAction = { name: string; label: string; onPress: () => void }

export type PackRowProps = {
  label: string
  // Small eyebrow tag shown above the label for a pack that's one of several related siblings
  // (e.g. "Sports" above "NFL"). Only rendered (and only recolors the card) when `isPack` is true
  // - see its own comment below for why a puzzle row inside a pack never sets this.
  group?: string
  // True for a row that represents a whole PACK (PacksScreen's pack lists, PackPuzzleList's
  // pack summary) - false (the default) for a row that represents a single PUZZLE within one
  // (PackPuzzleList), which has no group of its own to show. Gates the group icon/eyebrow AND the
  // card's own tinted background: without this split, an ungrouped custom pack (group=== undefined,
  // meant to fall back to the "Custom" bucket - see packGroupStyle.ts) would be indistinguishable
  // from a plain puzzle row, which never has a group at all and must stay untinted.
  isPack?: boolean
  subtitle?: string
  // Renders in place of the plain subtitle text when provided - e.g. a colored difficulty pill
  // instead of "Hard" as flat gray text (see PackPuzzleList's own usage). subtitle itself becomes
  // optional in that case; nothing else about the row depends on it being present.
  subtitleBadge?: ReactNode
  progress?: number
  // No long press: every row action is a visible control (a hidden long press used to unselect a
  // pack).
  onPress?: () => void
  leading?: ReactNode
  trailing?: ReactNode
  // Overrides the accessible name derived from label/subtitle's own text content - needed
  // whenever that text isn't meant to be read literally (e.g. a masked "_ _ _ _" blank row).
  accessibilityLabel?: string
  // The controls in `trailing`, again, as the row's accessibility actions (VoiceOver's rotor, TalkBack's
  // actions menu). Pass one for every button `trailing` holds.
  actions?: PackRowAction[]
  // A stable per-row identifier for callers whose label/subtitle/accessibilityLabel can collide
  // across rows (e.g. two masked puzzles that happen to share a letter count) - label text alone
  // isn't always enough to target one specific row.
  testID?: string
}

// Memoized: the long lists render this as a FlatList renderItem (PacksScreen's pack list, up to 50
// rows in the built-in manifest, and PackPuzzleList's puzzles) rather than a plain
// .map() inside a ScrollView - this component is the actual list-item cost that virtualization
// exists to avoid paying for off-screen rows, so keeping it a pure, memoizable presentational
// component (no inline-recreated non-primitive props from its own body) matters here.
export const PackRow = memo(({ label, group, isPack = false, subtitle, subtitleBadge, progress, onPress, leading, trailing, accessibilityLabel, actions, testID }: PackRowProps): JSX.Element => {
  const theme = useTheme()
  // Cycles primary/secondary/tertiary per group (see packGroupStyle.ts) so scanning down a long
  // pack list reads as visibly different clusters instead of one uniform color end to end -
  // untinted (plain `card`) for a puzzle row, which has no group concept at all.
  const groupColors = isPack ? packGroupColors(group, theme) : null

  const card = (
    <Card style={[styles.card, groupColors ? { backgroundColor: groupColors.container } : null]} mode='contained' onPress={onPress} testID={testID}>
      <Card.Content style={styles.row}>
        {/* A badge on the left (Avatar.Icon at a vibrant triad color, size 40), the same shape as
            the Pass & Play seats' avatars, so group identity reads at the same glance-weight. */}
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
  // outer, non-accessible wrapper - not onto the inner Pressable that's actually exposed to a
  // screen reader (Card builds that Pressable from its own fixed prop list, accessibilityLabel
  // not among them). Passing it straight to Card, as this used to, silently never reached
  // VoiceOver/TalkBack at all. Wrapping in an accessible View here is what actually works:
  // accessible=true collapses the whole subtree into one element using this label, instead of the
  // default fallback of reading every descendant Text node - a masked row's literal "_ _ _ _".
  //
  // The same wrapper carries `actions`. The card's own Pressable is one accessible element, so on iOS
  // VoiceOver never reaches the buttons inside it (`trailing`): a row's browse and remove buttons would
  // be unreachable without these. An activation (a double tap) still lands on the card underneath. Not
  // on the web, where the browser reaches those buttons itself, and where a View with the button role
  // renders a real <button>, which can't hold the trailing buttons inside it.
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      actions?.find((action) => action.name === event.nativeEvent.actionName)?.onPress()
    },
    [actions]
  )
  const offersActions = Platform.OS !== 'web' && Boolean(actions?.length)
  if (!accessibilityLabel && !offersActions) return card
  const spokenLabel = accessibilityLabel ?? [groupColors ? packGroupLabel(group) : null, label, subtitle].filter(Boolean).join(', ')
  return (
    <View accessible accessibilityLabel={spokenLabel} accessibilityRole={onPress ? 'button' : undefined} accessibilityActions={offersActions ? actions?.map(({ name, label: actionLabel }) => ({ name, label: actionLabel })) : undefined} onAccessibilityAction={offersActions ? handleAccessibilityAction : undefined}>
      {card}
    </View>
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
