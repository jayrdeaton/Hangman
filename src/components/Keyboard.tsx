import { type AutoPaperTheme, useAutoPaperTheme } from '@rific/auto-paper'
import { Button, useVibration } from '@rific/feedback-press'
import React, { useEffect, useLayoutEffect, useState } from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated'
import Svg, { Rect } from 'react-native-svg'

import type { KeyboardLayout } from '@/hooks/useKeyboardLayout'
import { SketchFill } from '@/modes/shared/sketchShapes'

export type KeyboardProps = {
  disabled?: boolean
  guessedLetters: string[]
  // Which of guessedLetters were actually wrong — folded into each key's own hatch-fill color
  // below (see KeyboardKey's own fill state) rather than a separate marker: a correct guess
  // re-draws its key's fill in the app's own secondary tone, a wrong one in its danger tone, so the
  // two read differently at a glance without needing anything extra layered on top.
  phrase: string
  // The letter whose guess completed the round, if the round was just won — undefined/null the
  // rest of the time. Drives a final hatch-fill redraw across the whole board, radiating outward
  // from this key: every key's fill re-draws itself once more in the app's success color, the same
  // SketchFill wipe-reveal every key's fill already uses for a guess landing — a win is just
  // another redraw, not a different visual language. Game.tsx sets it once, in the same tick as
  // setOutcome('win'), and never clears it (a fresh round means a fresh Keyboard instance, keyed
  // via Main.tsx's roundKey, so there's nothing to reset here).
  winningLetter?: string | null
  // True once the round has been lost — drives a quick shake across the whole board, then the same
  // final hatch-fill redraw a win uses, in the app's danger color instead, cascading down the board
  // top row first. Set synchronously by Game.tsx in the same tick as its own roundOverRef flip, NOT
  // gated behind outcome/dialogReady's 450ms delay, so the shake begins the instant the round is
  // actually decided rather than a beat later — RoundEndDialog's own Portal then covers the board
  // shortly after, but the redraw keeps running underneath it either way. Like winningLetter, only
  // ever set true, never reset — a fresh round is a fresh Keyboard instance.
  falling?: boolean
  // Mirrors Game.tsx's own gameReady (see gameModes.ts's own `started` comment for the same
  // convention already used by the mode artwork) — true once the whole screen's reveal curtain has
  // resolved. Drives this keyboard's own one-time entrance below: every key fades in while its own
  // hatch fill draws in for the first time, staggered left to right across the whole board (see
  // ENTRANCE_COLUMN_STAGGER_MS) so the entrance itself reads as the keyboard being drawn, after the
  // same ENTRANCE_START_DELAY_MS classicParts.tsx's own gallows sketch waits — so both read as one
  // deliberate beat once the curtain settles, not two animations racing it (or each other) on their
  // own schedules. Defaults true so a keyboard mounted without wiring the real signal still gets a
  // plain on-mount entrance rather than sitting permanently hidden. Also gates each key's own very
  // first hatch-fill draw-in, for the same reason.
  started?: boolean
  layout?: KeyboardLayout
  onGuess: (letter: string) => void
  // Fired whenever this keyboard's own "every key has its real, final width" readiness changes —
  // see keyWidth's own comment for why that's only known after a layout pass. Game.tsx combines
  // this with PuzzleStage's own readiness signal to hold the whole game screen hidden until
  // EVERYTHING on it — not just this keyboard — is already at its final size, then reveals all of
  // it as one already-correct unit (see Game.tsx's own gameReady comment). This component doesn't
  // hide itself: with nothing watching this prop, it plays no part in the reveal at all.
  onReadyChange?: (ready: boolean) => void
  style?: StyleProp<ViewStyle>
}

// Exported for direct unit testing (see Keyboard.test.tsx) — the real layouts findKeyPosition's
// own tests check positions against, rather than a hand-rolled fixture that could drift from what
// the app actually ships.
export const LAYOUT_ROWS: Record<KeyboardLayout, string[][]> = {
  abc: ['ABCDEFGHI'.split(''), 'JKLMNOPQR'.split(''), 'STUVWXYZ'.split('')],
  qwerty: ['QWERTYUIOP'.split(''), 'ASDFGHJKL'.split(''), 'ZXCVBNM'.split('')]
}

const KEY_BORDER_RADIUS = 8
const KEY_MARGIN = 2
// Half of each visible gap between keys, so a key's hit area extends exactly to meet its
// neighbor's — no dead zone in the gap (tapping between two keys still hits one of them, like the
// native iOS keyboard), and no overlap either (adjacent hit areas meet, not cross, at the
// midpoint). Horizontal: two keys each contribute KEY_MARGIN of marginHorizontal, so the gap
// between them is 2 * KEY_MARGIN and half of that is KEY_MARGIN. Vertical: two rows each contribute
// ROW_MARGIN_VERTICAL of marginVertical, so the same halving applies.
const ROW_MARGIN_VERTICAL = 4
const KEY_HIT_SLOP = { top: ROW_MARGIN_VERTICAL, bottom: ROW_MARGIN_VERTICAL, left: KEY_MARGIN, right: KEY_MARGIN }
// Milliseconds of extra delay per grid-cell of (row, column) distance from the winning key — kept
// short (and RIPPLE_ROW_WEIGHT below keeps the shape honest) so the whole wave still reads as a
// quick, deliberate sweep rather than a slow crawl, comfortably inside WIN_DIALOG_DELAY_MS's own 2s
// buffer (see Game.tsx) before the round-end dialog arrives and covers the board.
const WIN_FILL_STAGGER_MS = 26
// A qwerty row only ever spans 3 rows but up to 10 columns, so raw (row, column) distance reaches
// its full vertical range in 1-2 steps and then spends the rest of its travel expanding sideways
// only — which reads as a left-to-right sweep, not something radiating outward from the pressed
// key. Multiplying row distance by this before combining it with column distance pulls a key's
// vertical neighbors into the same "ring" as its nearby horizontal ones, so the early wavefront
// actually looks like it's spreading in a circle around the winning key.
const RIPPLE_ROW_WEIGHT = 3

// -- Loss "shake then redraw" beat --
// Duration of a single shake lean; SHAKE_STEPS of these, alternating sign, then one more back to
// 0, bring the whole board to rest before the loss redraw cascade below begins — a quick tremor
// that lands as a physical impact beat ahead of the color change itself.
const SHAKE_STEP_MS = 45
const SHAKE_STEPS = 6
const SHAKE_TOTAL_MS = (SHAKE_STEPS + 1) * SHAKE_STEP_MS
const SHAKE_TRANSLATE_PX = 3
const SHAKE_ROTATE_DEG = 2.5
// Deterministic per-row head start for the loss redraw cascade below, so it visibly sweeps down
// the board top row first rather than every key redrawing at once.
const CASCADE_ROW_STAGGER_MS = 90
// Extra per-key randomness layered on top of the row-based delay, so ~26 keys redrawing reads as
// an organic sweep rather than a mechanical wave — a loss has no single "center" key to radiate
// from the way the win side's winning key does, so full per-key randomness is what sells it instead.
const CASCADE_JITTER_MS = 300

// -- Game-start "drawn in left to right" entrance --
// Same delay classicParts.tsx's own gallows sketch waits after `started` before it begins drawing
// — see KeyboardProps.started's own comment for why matching it matters.
const ENTRANCE_START_DELAY_MS = 400
// Per-column head start, keyed on a key's plain index within its own row (see findKeyPosition's
// own comment on why index rather than a measured pixel position) — every key sharing a column
// index across all three rows starts at the same moment, so the sweep reads as one wavefront
// moving left to right across the whole board rather than row by row.
const ENTRANCE_COLUMN_STAGGER_MS = 60
const ENTRANCE_DURATION_MS = 280

// Finds a letter's (row, column) position in the current layout — used to compute every other
// key's distance from the winning key below. Column is the letter's plain index within its row,
// not a measured pixel position (rows are staggered on a real keyboard, e.g. ASDFGHJKL sits offset
// from QWERTYUIOP) — close enough for a delay stagger nobody's measuring with a ruler, and it
// avoids needing an onLayout pass per key just to find where the ripple should start.
export const findKeyPosition = (rows: string[][], letter: string | null | undefined): { row: number; col: number } | null => {
  if (!letter) return null
  for (let row = 0; row < rows.length; row++) {
    const col = rows[row].indexOf(letter)
    if (col !== -1) return { row, col }
  }
  return null
}

type KeyboardKeyProps = {
  letter: string
  isGuessed: boolean
  isWrong: boolean
  disabled: boolean
  width?: number
  // Straight-line grid distance from the winning key, in (weighted-row, column) units — see
  // RIPPLE_ROW_WEIGHT for why row distance is scaled up before combining. Null while there's no
  // win yet, so this key has nothing to animate. A distance of 0 is the winning key itself. Drives
  // how long this key waits for its own turn in the win redraw wave below — see WIN_FILL_STAGGER_MS.
  rippleDistance: number | null
  // See KeyboardProps.falling's own comment — set once, true, and never cleared.
  falling: boolean
  // This key's row-based head start (ms) into the cascade below — see CASCADE_ROW_STAGGER_MS.
  cascadeBaseDelayMs: number
  // See KeyboardProps.started's own comment — defaults true at the Keyboard level.
  started: boolean
  // This key's column-based head start (ms) into the entrance below — left column first, so the
  // draw-in sweeps left to right across the whole board. See ENTRANCE_COLUMN_STAGGER_MS.
  entranceBaseDelayMs: number
  onPress: () => void
  theme: AutoPaperTheme
}

// Draws a key's own background as a hand-sketched hatch fill — the exact same SketchFill
// wipe-reveal balloons/hourglass/etc. already use for their own filled shapes — instead of a flat
// react-native-paper Button color. This is what makes the keyboard itself read as hand-drawn rather
// than a plain flat UI control, and it's the ONLY thing that ever changes a key's color: entrance,
// a guess landing, a win, a loss all just redraw this in a new color (see KeyboardKey's own `fill`
// state below), the same drawing code every time rather than a bespoke look per outcome.
//
// `clip` hands SketchFill the key's own rounded-rect silhouette (stroke/fill on it don't matter,
// only its outline), the same way balloons hand it an Ellipse. Sized off the same keySize
// KeyboardKey already measures via onLayout, and always mounted behind the Button (see its own
// z-order comment below) so the Button's own transparent body lets it show through.
//
// spacing/strokeWidth are both tighter than SketchFill's own balloon-tuned defaults (2.4/2.2) — at
// a key's own much smaller size, those defaults leave gaps between hatch strokes wide enough that
// the letter sitting on top loses its background behind it entirely wherever a gap and a glyph
// stroke happen to overlap (confirmed on screen, not just in theory: the label read as broken up
// and partly invisible against it). Packing the hatch this much tighter reads as a solid-ish fill
// with just a hint of hand-drawn texture instead of bold candy-stripes, which is what a key this
// small needs to keep its own letter legible.
const KEY_FILL_SPACING = 1.1
const KEY_FILL_STROKE_WIDTH = 1.6

// Inset by KEY_MARGIN on both sides, same as the Button's own marginHorizontal below — without
// this, StyleSheet.absoluteFill stretches this wrapper to the FULL width of the shared parent
// Animated.View, which is wider than the Button by exactly 2 * KEY_MARGIN (margin is outside a
// box, so the parent auto-sizes to include it). A fixed-width Svg dropped into that wider,
// un-centered wrapper defaults to flush-left, so the painted key ends up shifted KEY_MARGIN left
// of the Button's own box — the letter (centered correctly WITHIN the Button) then reads as
// off-center relative to the visible key shape underneath it, not because the label itself is
// mispositioned, but because the two boxes it's being judged against don't line up.
const KeyFill = ({ width, height, color, start, delayMs }: { width: number; height: number; color: string; start: boolean; delayMs: number }) => (
  <View pointerEvents='none' style={[StyleSheet.absoluteFill, { left: KEY_MARGIN, right: KEY_MARGIN }]}>
    <Svg width={width} height={height}>
      <SketchFill bounds={{ x: 0, y: 0, width, height }} clip={<Rect x={0} y={0} width={width} height={height} rx={KEY_BORDER_RADIUS} />} mode='hatch' color={color} spacing={KEY_FILL_SPACING} strokeWidth={KEY_FILL_STROKE_WIDTH} start={start} delayMs={delayMs} />
    </Svg>
  </View>
)

// Split out of Keyboard's own render loop — each key needs its own Reanimated shared value for
// the shake below, and hooks can't be called from inside a .map() in the parent.
const KeyboardKey = ({ letter, isGuessed, isWrong, disabled, width, rippleDistance, falling, cascadeBaseDelayMs, started, entranceBaseDelayMs, onPress, theme }: KeyboardKeyProps) => {
  const translateX = useSharedValue(0)
  const rotate = useSharedValue(0)
  // Starts invisible, not 1 — fades in as this key's own hatch fill draws in below, rather than the
  // plain-text label popping in stark and instant ahead of its own background. Nothing outside the
  // entrance effect ever touches this, so it stays at 1 for the rest of the key's life once the
  // entrance completes.
  const opacity = useSharedValue(0)

  useLayoutEffect(() => {
    if (!started) return
    const delay = ENTRANCE_START_DELAY_MS + entranceBaseDelayMs
    opacity.value = withDelay(delay, withTiming(1, { duration: ENTRANCE_DURATION_MS, easing: Easing.out(Easing.cubic) }))
    // started is only ever set true once per Keyboard instance (see its own prop comment) —
    // re-running this if entranceBaseDelayMs happened to change identity would just no-op against
    // the same delay value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started])

  // Randomized once per key, at mount — same pattern as fireworks.tsx's per-particle trajectory —
  // so the loss redraw cascade below reads as an organic sweep rather than every key redrawing in
  // lockstep. Layered on top of the deterministic cascadeBaseDelayMs passed in from the parent.

  // useState's lazy initializer, not useMemo — React only guarantees the latter runs once per
  // mount in practice, not by contract (it may discard and recompute the cache), which is exactly
  // the impurity react-hooks/purity flags Math.random() for here. The lazy initializer is the
  // pattern React itself documents for one-time-per-mount randomness.
  const [jitterMs] = useState(() => Math.random() * CASCADE_JITTER_MS)

  // This key's own hatch fill: `color`/`textColor` are whatever this key should currently be
  // showing, `gen` is bumped every time either changes so KeyFill (keyed on it below) remounts and
  // replays its own draw-in in the new color — SketchFill's own mask has no "already fully open,
  // just recolor instantly" mode, so a fresh mount is what makes each transition read as a redraw
  // rather than a flat color swap. `delayMs` is whatever stagger that particular transition uses
  // (none for a single key's own guess, the win/loss wave's own stagger for those).
  const [fill, setFill] = useState({ gen: 0, color: theme.colors.primary, textColor: theme.colors.onPrimary, delayMs: ENTRANCE_START_DELAY_MS + entranceBaseDelayMs })

  // Redraws this key's own fill the instant its own guess lands — a correct guess gets no color
  // of its own at all, just the same muted "spent" look a disabled control already has everywhere
  // else in this app (surfaceVariant, not a special hand-picked hue); a wrong one gets the app's
  // own danger *container* tone (dangerContainer, the same pale role WrongGuessWipe used to use for
  // a wrong key's own background), not the full saturated danger color the win/loss redraw below
  // still uses — a single guess landing is a much quieter beat than the round actually ending.
  // isWrong is already correct in this same render (both derive together from guessedLetters up in
  // Keyboard, see its own map below), so there's nothing to race between the two.
  /* eslint-disable react-hooks/set-state-in-effect -- a real one-shot transition driven by an
     external prop (isGuessed can only ever flip false->true once, a letter can't be un-guessed),
     not state derived from other state within this render. */
  useLayoutEffect(() => {
    if (!isGuessed) return
    setFill((f) => ({ gen: f.gen + 1, color: isWrong ? theme.colors.dangerContainer : theme.colors.surfaceVariant, textColor: isWrong ? theme.colors.onDangerContainer : theme.colors.onSurfaceVariant, delayMs: 0 }))
    // isGuessed is only ever set true once per key (a letter can't be un-guessed) — re-running
    // this if theme/isWrong happened to change identity would just no-op against the same values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuessed])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Redraws every key's fill once more in the app's success color once the round is won — same
  // radiating stagger the ripple always used, just driving a fill redraw instead of a transform.
  /* eslint-disable react-hooks/set-state-in-effect -- same one-shot-external-prop reasoning as the
     isGuessed effect above (rippleDistance only ever flips null -> a number once, see its own prop
     comment). */
  useLayoutEffect(() => {
    if (rippleDistance === null) return
    setFill((f) => ({ gen: f.gen + 1, color: theme.colors.success, textColor: theme.colors.onSuccess, delayMs: rippleDistance * WIN_FILL_STAGGER_MS }))
    // rippleDistance is only ever set once per round (see its own prop comment) — re-running this
    // if its own identity happened to change would just re-fire the same one-shot transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rippleDistance])
  /* eslint-enable react-hooks/set-state-in-effect */

  useLayoutEffect(() => {
    if (!falling) return
    // A quick, physical impact beat before the loss redraw itself lands.
    translateX.value = withSequence(...Array.from({ length: SHAKE_STEPS }, (_, i) => withTiming(i % 2 === 0 ? SHAKE_TRANSLATE_PX : -SHAKE_TRANSLATE_PX, { duration: SHAKE_STEP_MS })), withTiming(0, { duration: SHAKE_STEP_MS }))
    rotate.value = withSequence(...Array.from({ length: SHAKE_STEPS }, (_, i) => withTiming(i % 2 === 0 ? SHAKE_ROTATE_DEG : -SHAKE_ROTATE_DEG, { duration: SHAKE_STEP_MS })), withTiming(0, { duration: SHAKE_STEP_MS }))
    // Same row-based-plus-jitter delay the loss cascade has always used — now staged through a
    // plain setTimeout (rather than passed as SketchFill's own delayMs) so this key's redraw only
    // actually mounts once its own turn arrives, keeping 26 keys' worth of shake sequences and 26
    // keys' worth of fill redraws from all getting scheduled in the exact same synchronous burst.
    const timer = setTimeout(() => setFill((f) => ({ gen: f.gen + 1, color: theme.colors.danger, textColor: theme.colors.onDanger, delayMs: 0 })), SHAKE_TOTAL_MS + cascadeBaseDelayMs + jitterMs)
    return () => clearTimeout(timer)
    // falling is only ever set true once per Keyboard instance (see its own prop comment) —
    // re-running this if jitterMs/cascadeBaseDelayMs/theme happened to change would just re-fire
    // the same one-shot animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [falling])

  const keyStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }, { rotate: `${rotate.value}deg` }]
  }))

  // Height only — measured once, on this key's first layout, and never re-measured: a Button's
  // height is intrinsic (padding + font size), stable from its very first layout pass regardless
  // of width. WIDTH deliberately does NOT come from this same onLayout measurement, even though it
  // would be simpler to capture both at once: on a key's very first layout pass, before this
  // keyboard's own containerWidth (see Keyboard's own comment on keyWidth below) has resolved, the
  // Button is still auto-sized to its own one-letter label — a real, narrower width than its final
  // one. Since this onLayout handler disables itself after firing once, measuring width here would
  // permanently lock onto that first, too-narrow value for any key whose first layout pass happens
  // to land before containerWidth resolves — confirmed on screen, not just in theory: KeyFill,
  // sized off that stale width, left a visible unfilled strip down one side of the key. `width`
  // below is instead the SAME already-correct, already-final value Keyboard computes once and
  // hands to every key as a prop (see its own keyWidth comment) — reusing it here is what keeps
  // KeyFill's own size from ever having this same race to lose.
  const [keyHeight, setKeyHeight] = useState<number | null>(null)

  return (
    <Animated.View style={keyStyle} onLayout={keyHeight !== null ? undefined : (e) => setKeyHeight(e.nativeEvent.layout.height)}>
      {/* Painted first (behind the Button, same stacking order as CSS) — the Button's own
          background is always transparent (see styles.key below) so this shows through it. */}
      {width !== undefined && keyHeight !== null && <KeyFill key={fill.gen} width={width} height={keyHeight} color={fill.color} start={fill.gen === 0 ? started : true} delayMs={fill.delayMs} />}
      {/* soundDisabled — a letter guess already plays playCorrect()/playWrong() from Game.tsx's
          handleGuess, a beat after this same press; without this, the generic feedback-press click
          would double up with that on every single guess. The key still keeps its own
          onPress-triggered haptic. labelStyle (not the textColor prop) is what carries fill's own
          textColor — react-native-paper's Button ignores buttonColor/textColor entirely once
          disabled=true (it checks `!disabled` before using either — see its own getButtonColors)
          and substitutes its own flat colors regardless, which is why only a style/labelStyle
          override (applied after that internal color) can override a disabled key's color at all,
          same reasoning as styles.key's own transparent background below. */}
      <Button mode='contained' soundDisabled disabled={isGuessed || disabled} style={[styles.key, width ? { width } : null]} onPress={onPress} hitSlop={KEY_HIT_SLOP} labelStyle={[styles.text, { color: fill.textColor }]}>
        {letter}
      </Button>
    </Animated.View>
  )
}

export const Keyboard: React.FC<KeyboardProps> = ({ disabled = false, guessedLetters, phrase, winningLetter, falling = false, started = true, layout = 'qwerty', onGuess, onReadyChange, style }) => {
  // useAutoPaperTheme, not react-native-paper's plain useTheme — success/danger below are
  // @rific/auto-paper's own extended color roles (see useDifficultyColors.ts's own comment on
  // this same danger-not-error naming), not part of react-native-paper's own MD3 theme type.
  const theme = useAutoPaperTheme()
  const vibration = useVibration()
  const rows = LAYOUT_ROWS[layout]
  const winningPosition = findKeyPosition(rows, winningLetter)
  const [containerWidth, setContainerWidth] = useState(0)
  // Every key gets the same fixed width, sized off the longest row, so the widest row spans the
  // full measured width edge to edge and shorter rows end up narrower but centered — same as a
  // physical keyboard's staggered rows. Pixel width (not a percentage flexBasis) because RN's
  // Yoga layout doesn't reliably resolve percentage flexBasis nested inside an alignItems:
  // 'center' ancestor chain.
  const maxCols = Math.max(...rows.map((r) => r.length))
  const keyWidth = containerWidth > 0 ? containerWidth / maxCols - KEY_MARGIN * 2 : undefined
  // Reported to the parent (see onReadyChange's own comment) rather than hidden here: every key
  // used to render unconstrained — each sized to its own label — until this measurement landed,
  // then all ~26 snapped to their final uniform width in one visible pop. Hiding just this
  // component wouldn't have been enough on its own either, since the SAME "wrong size, then a
  // moment later the real one" problem already existed independently in PuzzleStage's own artwork
  // box — fixing only one of the two still leaves the other popping in on its own schedule, which
  // is exactly the kind of "different frame" the combined gate in Game.tsx exists to rule out.
  useEffect(() => {
    onReadyChange?.(keyWidth !== undefined)
    // onReadyChange is Game.tsx's own setState, whose identity is already stable — including it
    // here would only add a footgun if a future caller passed an inline arrow instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyWidth])
  // One light tap per row, timed to when that row's own loss redraw cascade actually starts
  // (SHAKE_TOTAL_MS, then CASCADE_ROW_STAGGER_MS per row — same constants KeyboardKey uses below),
  // rather than per-key: 26 individual taps that close together would blur into a buzz on real
  // hardware, while 3 read as a distinct cascade. Unlike every other game-feedback haptic in this
  // app (wrong/correct/win in Game.tsx, bursts in fireworks.tsx — all unconditional expo-haptics
  // calls), this one deliberately goes through useVibration() so it respects the Settings > Haptics
  // toggle; that's an intentional exception, not an oversight.
  useEffect(() => {
    if (!falling) return
    const timers = rows.map((_, rowIndex) => setTimeout(() => vibration.short(), SHAKE_TOTAL_MS + rowIndex * CASCADE_ROW_STAGGER_MS))
    return () => timers.forEach(clearTimeout)
    // falling is only ever set true once per Keyboard instance (see its own prop comment) —
    // re-running this if rows/vibration happened to change identity would just re-fire the same
    // one-shot cascade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [falling])
  return (
    <View testID='keyboard' style={[styles.keyboard, style]} onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} testID={`keyboard-row-${rowIndex}`} style={styles.row}>
          {row.map((letter, colIndex) => {
            const isGuessed = guessedLetters.includes(letter)
            const isWrong = isGuessed && !phrase.includes(letter)
            const rippleDistance = winningPosition ? Math.hypot((rowIndex - winningPosition.row) * RIPPLE_ROW_WEIGHT, colIndex - winningPosition.col) : null
            const cascadeBaseDelayMs = rowIndex * CASCADE_ROW_STAGGER_MS
            const entranceBaseDelayMs = colIndex * ENTRANCE_COLUMN_STAGGER_MS
            return <KeyboardKey key={letter} letter={letter} isGuessed={isGuessed} isWrong={isWrong} disabled={disabled} width={keyWidth} rippleDistance={rippleDistance} falling={falling} cascadeBaseDelayMs={cascadeBaseDelayMs} started={started} entranceBaseDelayMs={entranceBaseDelayMs} onPress={() => onGuess(letter)} theme={theme} />
          })}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  // backgroundColor: 'transparent' always (not just for a wrong guess) — every key's real color
  // now comes entirely from KeyFill, sitting behind this Button (see its own z-order comment
  // above); react-native-paper still paints its own opaque color for a disabled Button's
  // background otherwise, which would hide KeyFill the instant a key gets guessed.
  key: {
    backgroundColor: 'transparent',
    borderRadius: KEY_BORDER_RADIUS,
    marginHorizontal: KEY_MARGIN,
    minWidth: 0
  },
  keyboard: {
    width: '100%'
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: ROW_MARGIN_VERTICAL
  },
  // A dark, tight shadow behind the letter — insurance on top of KEY_FILL_SPACING/
  // KEY_FILL_STROKE_WIDTH's own denser hatch: even a tightly-packed hatch is still real texture,
  // not a flat color, and every fill color here is light enough (see KeyboardKey's own fill state)
  // that a plain light label can still lose contrast right where a stroke happens to cross it
  // without something anchoring its edges regardless of what's directly behind them.
  text: {
    marginHorizontal: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2
  }
})
