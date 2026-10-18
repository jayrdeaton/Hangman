import { resolveSeedColor, useThemeSettings } from '@rific/auto-paper'
import { type PopoverHost, WELL_SHADOW } from '@tastic/hud/chrome'
import { type Profile, ProfilePicker, type ProfilePickerColorSection } from '@tastic/profile'
import { router } from 'expo-router'
import { JSX, useCallback, useMemo } from 'react'
import { StyleSheet } from 'react-native'
import { useTheme } from 'react-native-paper'

import { useActiveProfile, useProfiles, useProfilesActions } from '@/hooks/useProfiles'

import { ActivePlayerSwatches } from './PlayerSwatches'

// The picker's popover id is `${PLAYER_PICKER_ID_PREFIX}-profile` (@tastic/profile's ProfilePicker).
export const PLAYER_PICKER_ID_PREFIX = 'loadout-player'

export type PlayerPickerProps = {
  // The page's popover host (LoadoutShell's useLoadoutPopoverHost), shared with any other picker on it.
  host: PopoverHost
}

// Who is playing, and their colors, as ONE control: @tastic/profile's ProfilePicker with its color
// section, Solitaire's Home player button. The trigger is a pill with a chip of the player's palette
// (and their tag), their name and a chevron; its popover has the Color row (a page of swatches, each
// drawn as the palette it would give this player), then Guest and every profile, then Manage, which
// opens the Profiles screen. Picking a player makes them the active player: their waiting round,
// Continue, art, difficulty, packs, unlocked puzzles and colors all follow. A color picked here is the
// active player's in Hangman only (the caption says so for a profile; the guest has no other games),
// filed by Theme's PlayerThemeSync like any palette change, and a profile's lapses if the profile is
// given a new color. Their harmony is Settings' HARMONY row, since the color page has none.
export const PlayerPicker = ({ host }: PlayerPickerProps): JSX.Element => {
  const theme = useTheme()
  const { settings, set } = useThemeSettings()
  const profiles = useProfiles()
  const activeProfile = useActiveProfile()
  const { selectPlayer } = useProfilesActions()

  // The raw seed in effect: the color section checks it against each swatch's own value.
  const seed = resolveSeedColor(settings.color)
  const setColor = useCallback((hex: string) => set({ color: hex }), [set])
  const hasProfile = activeProfile !== null
  const colorSection = useMemo((): ProfilePickerColorSection => ({ value: seed, onChange: setColor, label: 'Color', caption: hasProfile ? 'Hangman only' : undefined }), [seed, setColor, hasProfile])
  const handleSelect = useCallback((profile: Profile | null) => selectPlayer(profile?.id ?? null), [selectPlayer])
  const handleManage = useCallback(() => router.push('/profiles'), [])
  // The board's surface behind the pill, the color the page's cards are drawn on, so the name reads on
  // the chalkboard and the whiteboard alike, raised off the board by the fleet's well shadow (on the
  // whiteboard the surface is the board's own color).
  const pillStyle = useMemo(() => [styles.pill, { backgroundColor: theme.colors.surface }], [theme.colors.surface])

  return (
    <ActivePlayerSwatches>
      <ProfilePicker idPrefix={PLAYER_PICKER_ID_PREFIX} host={host} profiles={profiles} selectedId={activeProfile?.id ?? null} color={seed} dark={theme.dark} guestLabel='Guest' nullLabel='Guest' onSelect={handleSelect} onManage={handleManage} colorSection={colorSection} triggerStyle={pillStyle} />
    </ActivePlayerSwatches>
  )
}

const styles = StyleSheet.create({
  // Never wider than the room it's given (the Single Player loadout's settings row narrows it for a
  // long name, so the name is cut short rather than the row running past the reset).
  pill: { borderRadius: 999, boxShadow: WELL_SHADOW, maxWidth: '100%' }
})
