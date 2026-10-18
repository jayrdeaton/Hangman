import { resolveSeedColor, useThemeSettings } from '@rific/auto-paper'
import { type PopoverHost, WELL_SHADOW } from '@tastic/hud/chrome'
import { type Profile, ProfilePicker, type ProfilePickerColorSection } from '@tastic/profile'
import { router } from 'expo-router'
import { JSX, memo, useCallback, useMemo } from 'react'
import { StyleSheet } from 'react-native'
import { useTheme } from 'react-native-paper'

import { useProfiles } from '@/hooks/useProfiles'
import type { PlayerTheme } from '@/redux/playerThemeSlice'

import { HarmonySwatches } from './PlayerSwatches'

// A picker's popover id is `${idPrefix}-profile` (@tastic/profile's ProfilePicker).
export const PLAYER_PICKER_ID_PREFIX = 'loadout-player'

export type PlayerPickerProps = {
  // The page's popover host (LoadoutShell's useLoadoutPopoverHost), shared with any other picker on it.
  host: PopoverHost
  // One per seat, on a page with several.
  idPrefix?: string
  // Who sits here: a profile's id, or null for the guest.
  selectedId: string | null
  // Every profile seated at the table: none of them can sit here too (this seat's own is never taken).
  takenIds?: readonly string[]
  // The trigger's name for the guest: "Guest" on its own, a seat's "Player 2" at a table.
  guestLabel?: string
  onSelect: (profile: Profile | null) => void
  // A seat's own colors, for one that isn't the active player's (whose are the live theme's): its chip
  // is drawn in them. The page hands such a seat a host whose press focuses the seat instead of opening
  // anything (see SeatsRow), so its Color row is never reached.
  colors?: PlayerTheme
}

const handleManage = () => router.push('/profiles')

// Who sits in a seat, and their colors, as ONE control: @tastic/profile's ProfilePicker with its color
// section, Solitaire's Home player button. The trigger is a pill with a chip of the player's palette
// (and their tag), their name and a chevron; its popover has the Color row (a page of swatches, each
// drawn as the palette it would give this player), then Guest and every profile (any seated elsewhere at
// the table disabled), then Manage, which opens the Profiles screen. The seat is the active player's
// (the loadout's focused seat, see LoadoutScreen), so a color picked here is theirs, in Hangman only
// (the caption says so for a profile; the guest has no other games), filed by Theme's PlayerThemeSync
// like any palette change, and a profile's lapses if the profile is given a new color. Their harmony is
// Settings' HARMONY row, since the color page has none.
export const PlayerPicker = memo(({ host, idPrefix = PLAYER_PICKER_ID_PREFIX, selectedId, takenIds, guestLabel = 'Guest', onSelect, colors }: PlayerPickerProps): JSX.Element => {
  const theme = useTheme()
  const { settings, set } = useThemeSettings()
  const profiles = useProfiles()

  // The raw seed in effect (the seat's own, for a seat that isn't the active player's): the color
  // section checks it against each swatch's own value.
  const seed = resolveSeedColor(colors ? colors.color : settings.color)
  const setColor = useCallback((hex: string) => set({ color: hex }), [set])
  const hasProfile = selectedId !== null
  const colorSection = useMemo((): ProfilePickerColorSection => ({ value: seed, onChange: setColor, label: 'Color', caption: hasProfile ? 'Hangman only' : undefined }), [seed, setColor, hasProfile])
  // The board's surface behind the pill, the color the page's cards are drawn on, so the name reads on
  // the chalkboard and the whiteboard alike, raised off the board by the fleet's well shadow (on the
  // whiteboard the surface is the board's own color).
  const pillStyle = useMemo(() => [styles.pill, { backgroundColor: theme.colors.surface }], [theme.colors.surface])

  // Every swatch in this player's harmony: the color page previews the palette each color would give
  // them, and with only a color to go on, the profile chips in its list are drawn the same way.
  return (
    <HarmonySwatches harmony={colors ? colors.harmony : settings.harmony}>
      <ProfilePicker idPrefix={idPrefix} host={host} profiles={profiles} selectedId={selectedId} takenIds={takenIds} color={seed} dark={theme.dark} guestLabel={guestLabel} nullLabel='Guest' onSelect={onSelect} onManage={handleManage} colorSection={colorSection} triggerStyle={pillStyle} />
    </HarmonySwatches>
  )
})
PlayerPicker.displayName = 'PlayerPicker'

const styles = StyleSheet.create({
  // Never wider than the room it's given (a long name is cut short rather than the row running past
  // the page's gutters).
  pill: { borderRadius: 999, boxShadow: WELL_SHADOW, maxWidth: '100%' }
})
