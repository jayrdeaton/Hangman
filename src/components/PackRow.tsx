import { Card } from '@rific/haptic-press'
import { JSX, ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { ProgressBar, Text, useTheme } from 'react-native-paper'

export type PackRowProps = {
  label: string
  // Small eyebrow tag shown above the label for a pack that's one of several related siblings
  // (e.g. "Sports" above "NFL") — omit for a standalone pack with nothing to group it with.
  group?: string
  subtitle: string
  progress?: number
  onPress?: () => void
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

export const PackRow = ({ label, group, subtitle, progress, onPress, leading, trailing, accessibilityLabel, testID }: PackRowProps): JSX.Element => {
  const theme = useTheme()

  const card = (
    <Card style={styles.card} mode='contained' onPress={onPress} testID={testID}>
      <Card.Content style={styles.row}>
        {leading}
        <View style={styles.text}>
          {group === undefined ? null : (
            <Text variant='labelSmall' style={[styles.group, { color: theme.colors.primary }]}>
              {group.toUpperCase()}
            </Text>
          )}
          <Text variant='titleSmall'>{label}</Text>
          <Text variant='bodySmall' style={styles.muted}>
            {subtitle}
          </Text>
          {progress === undefined ? null : (
            <View style={styles.progressBarWrapper}>
              <ProgressBar progress={progress} style={[styles.progressBar, { backgroundColor: theme.colors.background }]} />
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
}

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
