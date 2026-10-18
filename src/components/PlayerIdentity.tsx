import { Chip } from '@rific/feedback-press'
import { type Profile, ProfileChip } from '@tastic/profile'
import { JSX, memo, type ReactNode, useCallback } from 'react'
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'

// Who a player is, the one way every screen shows it: a profile has its chip (@tastic/profile's
// ProfileChip: its tag, or the account glyph, on its color drawn as the whole palette, which
// PlayerSwatches does app-wide), and a guest has none, only their name. So a table of guests reads
// exactly as it did before profiles, and a profile reads the same wherever it's named: the Pass & Play
// prompt, hand-off, result and session cards, and the standings.

// The chip inside a Paper Chip (its avatar slot is 24 across).
export const PLAYER_CHIP_AVATAR_SIZE = 24

export type PlayerMarkProps = {
  profile: Profile | null | undefined
  size: number
  // Holds the mark's room open for a guest, so a list of names with a profile among them lines up.
  reserve?: boolean
}

// A profile's chip, or nothing for a guest (an empty slot of the same size with `reserve`).
export const PlayerMark = ({ profile, size, reserve = false }: PlayerMarkProps): JSX.Element | null => {
  if (profile) return <ProfileChip profile={profile} size={size} />
  return reserve ? <View testID='player-mark-slot' style={{ height: size, width: size }} /> : null
}

export type PlayerChipProps<Id extends string | null> = {
  // What a press hands to onSelect: a seat's id, or a profile's (null for the guest).
  id: Id
  name: string
  profile: Profile | null | undefined
  selected: boolean
  onSelect: (id: Id) => void
  accessibilityLabel: string
}

// A pick between players (the prompt's For row): an outlined Paper
// Chip with the player's name, led by their profile's chip. Selected, Paper fills it and checks it (the
// check sits over a profile's chip, as Paper draws a selected avatar). Memoized, with one stable
// onSelect for the whole row, so a row of these re-renders only the chips whose selection moved.
const PlayerChipBase = <Id extends string | null>({ id, name, profile, selected, onSelect, accessibilityLabel }: PlayerChipProps<Id>): JSX.Element => {
  const handlePress = useCallback(() => onSelect(id), [onSelect, id])
  return (
    <Chip mode='outlined' selected={selected} onPress={handlePress} accessibilityLabel={accessibilityLabel} avatar={profile ? <ProfileChip profile={profile} size={PLAYER_CHIP_AVATAR_SIZE} /> : undefined}>
      {name}
    </Chip>
  )
}
export const PlayerChip = memo(PlayerChipBase) as typeof PlayerChipBase

export type PlayerLineProps = {
  profile: Profile | null | undefined
  size: number
  // The line itself: a Text, which shrinks and wraps beside the chip.
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

// A line naming a player, led by their chip: the result card's who guessed whose word and who writes
// next, the prompt's title. Centered, the chip beside the text, which wraps beside it. A guest's line
// is just the text, as it always was.
export const PlayerLine = ({ profile, size, children, style }: PlayerLineProps): JSX.Element => {
  if (!profile) return <>{children}</>
  return (
    <View style={[styles.line, style]}>
      <ProfileChip profile={profile} size={size} />
      <View style={styles.text}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  line: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', maxWidth: '100%' },
  text: { flexShrink: 1 }
})
