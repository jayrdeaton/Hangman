import { type ColorHarmony, getTriadicPalette, type TriadicPalette } from '@rific/auto-paper'
import { JSX, memo, useMemo } from 'react'
import Svg, { Circle, Path } from 'react-native-svg'

export type PaletteSwatchProps = {
  // The seed color: the palette's primary.
  color: string
  harmony: ColorHarmony
  // The circle's diameter.
  size: number
}

// A color that isn't one auto-paper can read draws flat, rather than throwing mid-render.
const paletteFor = (color: string, harmony: ColorHarmony): TriadicPalette => {
  try {
    return getTriadicPalette(color, harmony)
  } catch {
    return { primary: color, secondary: color, tertiary: color }
  }
}

// One player's whole palette as a round swatch: the 2:1:1 pie auto-paper's palette picker draws for
// each of its swatches (its private Pie), primary across the top half (centered at 12 o'clock),
// secondary bottom left and tertiary bottom right, from getTriadicPalette with the player's harmony.
// Every profile chip and swatch in the app draws through it (see PlayerSwatches), so a player's chip
// shows the colors they actually play in. Drawn in a 2x2 box scaled to `size`, layered rather than
// cut into three wedges: the full circle in primary, the bottom half in secondary over it, then the
// bottom-right quarter in tertiary, so any antialiased seam shows a neighboring color, never the page.
export const PaletteSwatch = memo(({ color, harmony, size }: PaletteSwatchProps): JSX.Element => {
  const { primary, secondary, tertiary } = useMemo(() => paletteFor(color, harmony), [color, harmony])
  return (
    <Svg testID='palette-swatch' width={size} height={size} viewBox='0 0 2 2'>
      <Circle cx={1} cy={1} r={1} fill={primary} />
      <Path d='M0 1A1 1 0 0 0 2 1Z' fill={secondary} />
      <Path d='M1 1L2 1A1 1 0 0 1 1 2Z' fill={tertiary} />
    </Svg>
  )
})

PaletteSwatch.displayName = 'PaletteSwatch'
