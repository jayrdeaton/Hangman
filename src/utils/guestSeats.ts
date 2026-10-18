import { defaultColors, resolveSeedColor } from '@rific/auto-paper'
import type { Profile } from '@tastic/profile'

import { DEFAULT_HARMONY, type PlayerThemeEntry, type PlayerThemeState, resolvePlayerTheme } from '@/redux/playerThemeSlice'
import type { RoundState } from '@/redux/roundSlice'

import { guestSeatKey, type PlayerKey, playerKeyFor } from './players'
import { seatPlayer } from './pnpSession'

// Each Pass & Play guest seat is a player of its own (utils/players.ts' guestSeatKey), and a table of
// guests should be told apart at a glance (Jay, 2026-10-18): so a guest seat starts on a color of its
// own, the auto-paper swatch whose hue is farthest from every color the table is showing (a seated
// profile's colors, as resolvePlayerTheme has them, or another guest seat's), in the default harmony.
// Taking the next swatch in order put Coral beside Red, which read as the same color on a chip. Its art, difficulty and packs start at the defaults (no playerSettings entry: the default
// art, Any and every pack). A guest seat is given its colors the first time it's shown (the Pass & Play
// page, see LoadoutScreen) or made the active player (useProfiles' selectPlayer), whichever comes
// first, so a new seat and one in a table stored before guest seats had colors are treated alike.
// Single Player's guest isn't at the table, so their colors never count.

export type GuestSeatColor = { playerKey: PlayerKey; theme: PlayerThemeEntry }

type ColorState = { round: Pick<RoundState, 'pnp'>; profiles: readonly Profile[]; playerTheme: PlayerThemeState }

const colorKey = (color: string): string => color.toLowerCase()

// A swatch this washed out (brown, grey, blue grey) has no hue worth spacing from: it's only a guest's
// color once every vivid one is taken.
const MIN_CHROMA = 0.25

// A color's hue (0 to 360) and chroma (0 to 1), from its hex.
const hueOf = (hex: string): { hue: number; chroma: number } => {
  const value = Number.parseInt(hex.replace('#', '').slice(0, 6), 16)
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => channel / 255)
  const max = Math.max(r, g, b)
  const chroma = max - Math.min(r, g, b)
  if (chroma === 0) return { hue: 0, chroma: 0 }
  const sector = max === r ? ((g - b) / chroma + 6) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4
  return { hue: sector * 60, chroma }
}

const hueDistance = (a: number, b: number): number => {
  const apart = Math.abs(a - b) % 360
  return Math.min(apart, 360 - apart)
}

// The free swatch farthest in hue from every vivid color shown (ties to the earlier swatch), so the
// first guest is the first swatch (Hangman's own red) and each after it lands across the wheel from
// the rest. Washed-out swatches only when every vivid one is taken.
const pickSpacedSwatch = (shown: ReadonlySet<string>): string => {
  const shownHues = [...shown].map(hueOf).filter((color) => color.chroma >= MIN_CHROMA)
  let best: string | null = null
  let bestDistance = -1
  for (const swatch of defaultColors) {
    if (shown.has(colorKey(swatch.value))) continue
    const { hue, chroma } = hueOf(swatch.value)
    if (chroma < MIN_CHROMA) continue
    const distance = shownHues.length === 0 ? 360 : Math.min(...shownHues.map((color) => hueDistance(color.hue, hue)))
    if (distance > bestDistance) {
      best = swatch.value
      bestDistance = distance
    }
  }
  return best ?? defaultColors.find((swatch) => !shown.has(colorKey(swatch.value)))?.value ?? defaultColors[0].value
}

// The colors every guest seat at the table with none kept yet should start on, in seat order (each one
// taken counts as shown for the seats after it). Empty when every seat already has colors.
export const pickGuestSeatColors = ({ round, profiles, playerTheme }: ColorState): GuestSeatColor[] => {
  const shown = new Set<string>()
  const uncolored: string[] = []
  for (const seat of round.pnp.session.players) {
    const { profileId, seatId } = seatPlayer(seat, profiles)
    const profileColor = profileId ? (profiles.find((profile) => profile.id === profileId)?.color ?? null) : null
    // A profile always has colors to show (its own at least); only a guest seat can have none yet.
    const colors = resolvePlayerTheme(playerTheme[playerKeyFor(profileId, seatId)], profileColor)
    if (colors) shown.add(colorKey(resolveSeedColor(colors.color)))
    else if (seatId) uncolored.push(seatId)
  }
  return uncolored.map((seatId) => {
    // Eight seats at most, among twenty swatches, so one is always free; the first is the fallback anyway.
    const color = pickSpacedSwatch(shown)
    shown.add(colorKey(color))
    return { playerKey: guestSeatKey(seatId), theme: { color, harmony: DEFAULT_HARMONY } }
  })
}
