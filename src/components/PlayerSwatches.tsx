import { type ColorHarmony, useThemeSettings } from '@rific/auto-paper'
import { ProfileColorProvider, type ProfileSwatchRenderer } from '@tastic/profile'
import { JSX, type ReactNode, useCallback, useMemo } from 'react'
import { useSelector } from 'react-redux'

import { DEFAULT_HARMONY } from '@/redux/playerThemeSlice'
import type { RootState } from '@/redux/store'

import { PaletteSwatch } from './PaletteSwatch'

// @tastic/profile hands its swatch renderer only the color to draw, so each harmony is looked up by
// color.
const colorKey = (color: string) => color.toLowerCase()

// Every round swatch @tastic/profile draws (each ProfileChip, the picker's chip trigger, its Color row
// and color page) as the whole palette (PaletteSwatch) rather than a flat color. App-wide, a color is
// drawn with the harmony of the profile it belongs to: the one that player picked in Settings
// (playerTheme), or the default for a profile with nothing picked, which is what they'd play in. The
// active player's profile wins a color two profiles share. Any other color (a new profile's draft on
// the Profiles screen) takes the default too. Inside Providers, so every screen's Portal host is
// inside it.
export const PlayerSwatches = ({ children }: { children: ReactNode }): JSX.Element => {
  const profiles = useSelector((state: RootState) => state.profiles)
  const playerTheme = useSelector((state: RootState) => state.playerTheme)
  const activeProfileId = useSelector((state: RootState) => state.activePlayer.profileId)
  const harmonies = useMemo(() => {
    const byColor = new Map<string, ColorHarmony>()
    const ordered = [...profiles.filter((profile) => profile.id === activeProfileId), ...profiles.filter((profile) => profile.id !== activeProfileId)]
    for (const profile of ordered) if (!byColor.has(colorKey(profile.color))) byColor.set(colorKey(profile.color), playerTheme[profile.id]?.harmony ?? DEFAULT_HARMONY)
    return byColor
  }, [profiles, playerTheme, activeProfileId])
  const renderSwatch = useCallback<ProfileSwatchRenderer>((color, size) => <PaletteSwatch color={color} harmony={harmonies.get(colorKey(color)) ?? DEFAULT_HARMONY} size={size} />, [harmonies])
  return <ProfileColorProvider renderSwatch={renderSwatch}>{children}</ProfileColorProvider>
}

// Every swatch inside it in the active player's own harmony, for the player picker (see PlayerPicker):
// its color page previews the palette each color would give this player, so every swatch there has to
// use their harmony, and with only a color to go on, the profile chips in its list do too. Must sit
// inside Theme, for the live settings.
export const ActivePlayerSwatches = ({ children }: { children: ReactNode }): JSX.Element => {
  const { harmony } = useThemeSettings().settings
  const renderSwatch = useCallback<ProfileSwatchRenderer>((color, size) => <PaletteSwatch color={color} harmony={harmony} size={size} />, [harmony])
  return <ProfileColorProvider renderSwatch={renderSwatch}>{children}</ProfileColorProvider>
}
