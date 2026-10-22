import { type ColorHarmony } from '@rific/auto-paper'
import { ProfileColorProvider, type ProfileSwatchRenderer } from '@tastic/profile'
import { JSX, type ReactNode, useMemo } from 'react'

import { PaletteSwatch } from './PaletteSwatch'

// @tastic/profile's swatch renderer for one harmony (0.16.2+, told where each swatch is): the whole
// palette (PaletteSwatch) wherever a color is being chosen, the picker's Color row and its color page,
// and null for a chip, which keeps its flat fill. A chip says who someone is (one color and a legible
// tag or glyph), and the pie under a white tag let it vanish over a pale slice at the small sizes the
// standings and the For row use (Jay, 2026-10-18); every other game draws its chips flat too. Exported
// for its tests.
export const harmonySwatchRenderer = (harmony: ColorHarmony): ProfileSwatchRenderer =>
  function renderHarmonySwatch(color, size, place) {
    return place === 'chip' ? null : <PaletteSwatch color={color} harmony={harmony} size={size} />
  }

// A player's harmony for the pickers inside it (see PlayerPicker): their color page previews the palette
// each color would give this player, and the Color row shows the one in effect. The Profiles screen wraps
// itself in the active player's, for its edit rows' color pickers (see ManageProfilesScreen). Everything
// else the package draws stays flat, chips included (there's no app-wide renderer).
export const HarmonySwatches = ({ harmony, children }: { harmony: ColorHarmony; children: ReactNode }): JSX.Element => {
  const renderSwatch = useMemo(() => harmonySwatchRenderer(harmony), [harmony])
  return <ProfileColorProvider renderSwatch={renderSwatch}>{children}</ProfileColorProvider>
}
