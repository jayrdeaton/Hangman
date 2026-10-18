import { type ColorHarmony, resolveSeedColor } from '@rific/auto-paper'
import { ProfileColorProvider, type ProfileSwatchRenderer } from '@tastic/profile'
import { JSX, type ReactNode, useCallback, useMemo } from 'react'
import { useSelector } from 'react-redux'

import { DEFAULT_HARMONY } from '@/redux/playerThemeSlice'
import type { RootState } from '@/redux/store'
import { guestSeatKey } from '@/utils/players'
import { seatPlayer } from '@/utils/pnpSession'

import { PaletteSwatch } from './PaletteSwatch'

// @tastic/profile hands its swatch renderer only the color to draw, so each harmony is looked up by
// color.
const colorKey = (color: string) => color.toLowerCase()

// Every round swatch @tastic/profile draws (each ProfileChip, the picker's chip trigger, its Color row
// and color page) as the whole palette (PaletteSwatch) rather than a flat color. App-wide, a color is
// drawn with the harmony of the player it belongs to: a profile's own color in the harmony that player
// picked in Settings (playerTheme), or the default for a profile with nothing picked, which is what
// they'd play in; a Pass & Play guest seat's color (its own, utils/guestSeats.ts) in its own harmony.
// The active player wins a color two players share, then the profiles, then the guest seats in seat
// order. Any other color (a new profile's draft on the Profiles screen) takes the default too. Inside
// Providers, so every screen's Portal host is inside it.
export const PlayerSwatches = ({ children }: { children: ReactNode }): JSX.Element => {
  const profiles = useSelector((state: RootState) => state.profiles)
  const playerTheme = useSelector((state: RootState) => state.playerTheme)
  const players = useSelector((state: RootState) => state.round.pnp.session.players)
  const { profileId: activeProfileId, seatId: activeSeatId } = useSelector((state: RootState) => state.activePlayer)
  const harmonies = useMemo(() => {
    const byColor = new Map<string, ColorHarmony>()
    const claim = (color: string, harmony: ColorHarmony | undefined) => {
      if (!byColor.has(colorKey(color))) byColor.set(colorKey(color), harmony ?? DEFAULT_HARMONY)
    }
    const guestSeats = players.filter((seat) => !seatPlayer(seat, profiles).profileId)
    const claimSeat = (seatId: string) => {
      const entry = playerTheme[guestSeatKey(seatId)]
      if (entry) claim(resolveSeedColor(entry.color), entry.harmony)
    }
    if (activeSeatId) claimSeat(activeSeatId)
    const ordered = [...profiles.filter((profile) => profile.id === activeProfileId), ...profiles.filter((profile) => profile.id !== activeProfileId)]
    for (const profile of ordered) claim(profile.color, playerTheme[profile.id]?.harmony)
    for (const seat of guestSeats) claimSeat(seat.id)
    return byColor
  }, [profiles, playerTheme, players, activeProfileId, activeSeatId])
  const renderSwatch = useCallback<ProfileSwatchRenderer>((color, size) => <PaletteSwatch color={color} harmony={harmonies.get(colorKey(color)) ?? DEFAULT_HARMONY} size={size} />, [harmonies])
  return <ProfileColorProvider renderSwatch={renderSwatch}>{children}</ProfileColorProvider>
}

// Every swatch inside it in one harmony: a player's own, for their picker (see PlayerPicker). Its color
// page previews the palette each color would give this player, so every swatch there has to use their
// harmony, and with only a color to go on, the profile chips in its list do too; a seat that isn't the
// active player's has its chip drawn in its own player's harmony the same way.
export const HarmonySwatches = ({ harmony, children }: { harmony: ColorHarmony; children: ReactNode }): JSX.Element => {
  const renderSwatch = useCallback<ProfileSwatchRenderer>((color, size) => <PaletteSwatch color={color} harmony={harmony} size={size} />, [harmony])
  return <ProfileColorProvider renderSwatch={renderSwatch}>{children}</ProfileColorProvider>
}
