import { getBlendedColor } from '@rific/auto-paper'
import { useId } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { useTheme } from 'react-native-paper'
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg'

// Where the old writing was wiped: wide, soft streaks, as fractions of the window, each turned a few
// degrees like the swipe of an eraser. Fixed, not random, so the board looks the same on every screen
// and every launch.
const SMUDGES = [
  { cx: 0.24, cy: 0.16, rx: 0.42, ry: 0.07, angle: -7 },
  { cx: 0.78, cy: 0.38, rx: 0.36, ry: 0.06, angle: 5 },
  { cx: 0.3, cy: 0.62, rx: 0.46, ry: 0.08, angle: -3 },
  { cx: 0.72, cy: 0.85, rx: 0.32, ry: 0.06, angle: 8 }
]

// How far the dark board is shaded from the theme's surface toward black (see boardColor).
const DARK_BOARD_SHADE = 0.5

// The board's base color, which the OS root background matches too (Theme.tsx's RootBackground). In light
// appearance it is the theme's surface: a whiteboard, where the cards drawn on the surface (the Stats screen's
// wells, the drawers) stand off it on @tastic/hud's well shadow, as on the fleet's white screens. In dark
// appearance it is that surface shaded halfway to black, a step below it, so the same cards read on the
// chalkboard the way the fleet's other games put surface cards on a black screen (Jay, 2026-10-17: with hud
// 0.22's wells, the theme's surface, a surface-colored chalkboard left them showing only by a shadow that
// barely shows in the dark).
export const boardColor = (dark: boolean, surface: string): string => (dark ? getBlendedColor('#000000', surface, DARK_BOARD_SHADE) : surface)

// Hangman's answer to Solitaire's felt: the one board the whole app is played on, mounted once at the
// root (src/app/_layout.tsx) behind the navigation stack, whose screens are all transparent. Home, the
// loadouts, the game and Stats all draw over it, so moving between them reads as one board rather
// than several screens that happen to paint the same color, and a screen that hasn't drawn yet shows
// board, not a flash of something else.
//
// The base is boardColor: the theme's surface in light appearance (a whiteboard) and a step below it in dark (a
// chalkboard); the OS root background matches it. Over it,
// muted on purpose so it never competes with the writing: a vignette that dims toward the edges, and a
// few faint smudges where earlier writing was wiped (chalk dust on the chalkboard, marker ghosting on
// the whiteboard).
export const BoardBackground = () => {
  const theme = useTheme()
  const vignetteId = useId()
  const smudgeId = useId()
  // Remounts the Svg on a window resize: react-native-svg doesn't re-resolve a percentage-based
  // gradient against a resized view on iOS (Solitaire's felt hit this), and the smudges are placed in
  // absolute units.
  const { width, height } = useWindowDimensions()
  const vignette = theme.dark ? { color: '#000000', opacity: 0.5 } : { color: '#000000', opacity: 0.07 }
  const smudge = theme.dark ? { color: '#FFFFFF', opacity: 0.045 } : { color: theme.colors.onSurface, opacity: 0.03 }

  return (
    <View testID='board-background' style={StyleSheet.absoluteFill} pointerEvents='none'>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: boardColor(theme.dark, theme.colors.surface) }]} />
      <Svg key={`${width}x${height}`} style={StyleSheet.absoluteFill} width='100%' height='100%'>
        <Defs>
          {/* r, not rx/ry: react-native-svg's web build passes rx/ry straight to the DOM, where a
              radialGradient ignores them, so the web drew a far tighter (darker) vignette. In the
              default objectBoundingBox units r already stretches to the screen's aspect. */}
          <RadialGradient id={vignetteId} cx='50%' cy='45%' r='75%'>
            <Stop offset='55%' stopColor={vignette.color} stopOpacity={0} />
            <Stop offset='100%' stopColor={vignette.color} stopOpacity={vignette.opacity} />
          </RadialGradient>
          <RadialGradient id={smudgeId} cx='50%' cy='50%' r='50%'>
            <Stop offset='0%' stopColor={smudge.color} stopOpacity={smudge.opacity} />
            <Stop offset='100%' stopColor={smudge.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {SMUDGES.map((s, i) => {
          const cx = s.cx * width
          const cy = s.cy * height
          return <Ellipse key={i} cx={cx} cy={cy} rx={s.rx * width} ry={s.ry * height} fill={`url(#${smudgeId})`} transform={`rotate(${s.angle} ${cx} ${cy})`} />
        })}
        <Rect x={0} y={0} width='100%' height='100%' fill={`url(#${vignetteId})`} />
      </Svg>
    </View>
  )
}
