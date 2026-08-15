import { type AutoPaperTheme, useAutoPaperTheme } from '@rific/auto-paper'
import { Button, useVibration } from '@rific/haptic-press'
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { StyleProp, StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated'

import type { KeyboardLayout } from '@/hooks/useKeyboardLayout'

export type KeyboardProps = {
  disabled?: boolean
  guessedLetters: string[]
  // Which of guessedLetters were actually wrong — the only thing that separates a wrong key's
  // color from a correct one below. A correct guess needs no such marker: it's already visible in
  // the word blanks filling in, so it stays exactly as before (disabled, same secondary color) —
  // this is only about surfacing the one thing that's otherwise invisible once guessed: which
  // specific letters were wrong.
  phrase: string
  // The letter whose guess completed the round, if the round was just won — undefined/null the
  // rest of the time. Drives the win ripple below; Game.tsx sets it once, in the same tick as
  // setOutcome('win'), and never clears it (a fresh round means a fresh Keyboard instance, keyed
  // via Main.tsx's roundKey, so there's nothing to reset here).
  winningLetter?: string | null
  // True once the round has been lost — drives the keyboard's own "falling apart" collapse below:
  // a quick shake across the whole board, then every key peels off and tumbles off the bottom of
  // the screen. Set synchronously by Game.tsx in the same tick as its own roundOverRef flip, NOT
  // gated behind outcome/dialogReady's 450ms delay, so the fall begins the instant the round is
  // actually decided rather than a beat later — RoundEndDialog's own Portal then covers the board
  // shortly after, but the fall keeps running underneath it either way. Like winningLetter, only
  // ever set true, never reset — a fresh round is a fresh Keyboard instance.
  falling?: boolean
  // Mirrors Game.tsx's own gameReady (see gameModes.ts's own `started` comment for the same
  // convention already used by the mode artwork) — true once the whole screen's reveal curtain has
  // resolved. Drives this keyboard's own one-time "slide up into place" entrance below: every key
  // starts ENTRANCE_OFFSET_PX below its resting spot and slides up to it, staggered bottom-row-first
  // (the direction they're sliding from), after the same ENTRANCE_START_DELAY_MS classicParts.tsx's
  // own gallows sketch waits — so both read as one deliberate beat once the curtain settles, not two
  // animations racing it (or each other) on their own schedules. Defaults true so a keyboard mounted
  // without wiring the real signal still gets a plain on-mount slide-in rather than sitting
  // permanently offset.
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
// short (and RIPPLE_ROW_WEIGHT below keeps the shape honest) so the whole wave reads as a quick,
// snappy pop rather than a slow crawl, comfortably inside WIN_DIALOG_DELAY_MS's own 2s buffer (see
// Game.tsx) before the round-end dialog arrives and covers the board.
const RIPPLE_STAGGER_MS = 26
// A qwerty row only ever spans 3 rows but up to 10 columns, so raw (row, column) distance reaches
// its full vertical range in 1-2 steps and then spends the rest of its travel expanding sideways
// only — which reads as a left-to-right sweep, not something radiating outward from the pressed
// key. Multiplying row distance by this before combining it with column distance pulls a key's
// vertical neighbors into the same "ring" as its nearby horizontal ones, so the early wavefront
// actually looks like it's spreading in a circle around the winning key.
const RIPPLE_ROW_WEIGHT = 3
const RIPPLE_PEAK_SCALE = 1.2

// -- Loss "falling apart" animation --
// Duration of a single shake lean; SHAKE_STEPS of these, alternating sign, then one more back to
// 0, bring the whole board to rest before the cascade below begins — a quick tremor in the same
// snappy register as the ripple above (100+160ms), not a slow wobble.
const SHAKE_STEP_MS = 45
const SHAKE_STEPS = 6
const SHAKE_TOTAL_MS = (SHAKE_STEPS + 1) * SHAKE_STEP_MS
const SHAKE_TRANSLATE_PX = 3
const SHAKE_ROTATE_DEG = 2.5
// Deterministic per-row head start for the cascade, so the top row — which has the farthest to
// fall to clear the screen — starts first, and every row finishes leaving the viewport around the
// same time rather than the top row visibly lagging behind.
const CASCADE_ROW_STAGGER_MS = 90
// Extra per-key randomness layered on top of the row-based delay, so ~26 keys peeling off reads
// as organic chaos rather than a mechanical wave — unlike the win ripple, a loss has no single
// "center" key to radiate from, so full per-key randomness is what actually sells "falling apart".
const CASCADE_JITTER_MS = 300
const FALL_DURATION_BASE_MS = 650
const FALL_DURATION_JITTER_MS = 300
const FALL_ROTATE_DEG_BASE = 220
const FALL_ROTATE_DEG_JITTER = 250
const FALL_DRIFT_PX = 70

// -- Game-start "slide up into place" entrance --
// Same delay classicParts.tsx's own gallows sketch waits after `started` before it begins drawing
// — see KeyboardProps.started's own comment for why matching it matters.
const ENTRANCE_START_DELAY_MS = 400
const ENTRANCE_OFFSET_PX = 28
const ENTRANCE_ROW_STAGGER_MS = 60
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
  // win yet, so this key has nothing to animate. A distance of 0 is the winning key itself.
  rippleDistance: number | null
  // See KeyboardProps.falling's own comment — set once, true, and never cleared.
  falling: boolean
  // How far (px) this key needs to translateY to clear the bottom of the screen once it falls —
  // the full window height, not this key's own measured distance to the screen edge (see
  // Keyboard's own comment on why that's a deliberate simplification).
  fallDistance: number
  // This key's row-based head start (ms) into the cascade below — see CASCADE_ROW_STAGGER_MS.
  cascadeBaseDelayMs: number
  // See KeyboardProps.started's own comment — defaults true at the Keyboard level.
  started: boolean
  // This key's row-based head start (ms) into the entrance below — bottom row first, since that's
  // the direction the keys are sliding up from. See ENTRANCE_ROW_STAGGER_MS.
  entranceBaseDelayMs: number
  onPress: () => void
  theme: AutoPaperTheme
}

// Split out of Keyboard's own render loop — each key needs its own Reanimated shared value for
// the ripple below, and hooks can't be called from inside a .map() in the parent.
const KeyboardKey = ({ letter, isGuessed, isWrong, disabled, width, rippleDistance, falling, fallDistance, cascadeBaseDelayMs, started, entranceBaseDelayMs, onPress, theme }: KeyboardKeyProps) => {
  const scale = useSharedValue(1)
  const translateX = useSharedValue(0)
  // Starts ENTRANCE_OFFSET_PX below rest, not 0 — see the entrance effect below, which slides it
  // up to 0 once `started` fires. Shared with the falling effect further down (which drives it back
  // out to fallDistance on a loss); the two never run concurrently, since a fresh round's entrance
  // has always long finished by the time a full round of guessing could end in a loss.
  const translateY = useSharedValue(ENTRANCE_OFFSET_PX)
  const rotate = useSharedValue(0)
  // Starts invisible, not 1 — fades in alongside the slide-up below rather than the key already
  // sitting fully opaque (behind the screen's own curtain) and just physically sliding once
  // revealed. Nothing outside the entrance effect ever touches this, so it stays at 1 for the rest
  // of the key's life once the entrance completes.
  const opacity = useSharedValue(0)

  useLayoutEffect(() => {
    if (!started) return
    const delay = ENTRANCE_START_DELAY_MS + entranceBaseDelayMs
    translateY.value = withDelay(delay, withTiming(0, { duration: ENTRANCE_DURATION_MS, easing: Easing.out(Easing.cubic) }))
    opacity.value = withDelay(delay, withTiming(1, { duration: ENTRANCE_DURATION_MS, easing: Easing.out(Easing.cubic) }))
    // started is only ever set true once per Keyboard instance (see its own prop comment) —
    // re-running this if entranceBaseDelayMs happened to change identity would just no-op against
    // the same delay value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started])

  // Randomized once per key, at mount — same pattern as fireworks.tsx's per-particle trajectory —
  // so the cascade below reads as organic tumbling rather than every key following an identical
  // path. Layered on top of the deterministic cascadeBaseDelayMs passed in from the parent.
  /* eslint-disable-next-line react-hooks/purity */
  const fallTrajectory = useMemo(
    () => ({
      jitterMs: Math.random() * CASCADE_JITTER_MS,
      durationMs: FALL_DURATION_BASE_MS + Math.random() * FALL_DURATION_JITTER_MS,
      rotateDeg: (Math.random() < 0.5 ? -1 : 1) * (FALL_ROTATE_DEG_BASE + Math.random() * FALL_ROTATE_DEG_JITTER),
      driftPx: (Math.random() * 2 - 1) * FALL_DRIFT_PX
    }),
    []
  )

  useLayoutEffect(() => {
    if (!falling) return
    const cascadeDelayMs = SHAKE_TOTAL_MS + cascadeBaseDelayMs + fallTrajectory.jitterMs
    // Each shared value's shake + fall is composed into ONE chain here rather than set in two
    // separate assignments — Reanimated's own .value setter cancels and replaces whatever's still
    // mid-flight, so a later assignment for "phase 2" would cut phase 1's shake off before it's
    // ever seen.
    translateX.value = withSequence(
      ...Array.from({ length: SHAKE_STEPS }, (_, i) => withTiming(i % 2 === 0 ? SHAKE_TRANSLATE_PX : -SHAKE_TRANSLATE_PX, { duration: SHAKE_STEP_MS })),
      withTiming(0, { duration: SHAKE_STEP_MS }),
      withDelay(cascadeBaseDelayMs + fallTrajectory.jitterMs, withTiming(fallTrajectory.driftPx, { duration: fallTrajectory.durationMs, easing: Easing.inOut(Easing.quad) }))
    )
    rotate.value = withSequence(
      ...Array.from({ length: SHAKE_STEPS }, (_, i) => withTiming(i % 2 === 0 ? SHAKE_ROTATE_DEG : -SHAKE_ROTATE_DEG, { duration: SHAKE_STEP_MS })),
      withTiming(0, { duration: SHAKE_STEP_MS }),
      withDelay(cascadeBaseDelayMs + fallTrajectory.jitterMs, withTiming(fallTrajectory.rotateDeg, { duration: fallTrajectory.durationMs, easing: Easing.linear }))
    )
    // No shake phase for translateY (keys don't move vertically while trembling) — just the fall,
    // delayed to start exactly when translateX/rotate's own shake-then-wait finishes above.
    translateY.value = withDelay(cascadeDelayMs, withTiming(fallDistance, { duration: fallTrajectory.durationMs, easing: Easing.in(Easing.quad) }))
    // falling is only ever set true once per Keyboard instance (see its own prop comment) —
    // re-running this if fallTrajectory/fallDistance/cascadeBaseDelayMs happened to change would
    // just re-fire the same one-shot animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [falling])

  // useLayoutEffect, not useEffect — fires synchronously right after this key's own DOM/native
  // update commits, rather than deferred to a separate pass after the browser/native has already
  // painted. The winning key's own delay is 0 either way, so this is about starting the wave as
  // close to the actual commit as possible rather than adding an extra scheduling hop on top of
  // whatever else the win moment is already doing in the same render (mounting the fireworks
  // celebration, two haptics calls, a ~26-key re-render for the now-disabled keyboard).
  useLayoutEffect(() => {
    if (rippleDistance === null) return
    // withDelay's own delay grows with distance from the winning key, so the pulse visibly
    // travels outward from it rather than every key popping at once — the winning key itself
    // (distance 0) pulses immediately.
    scale.value = withDelay(rippleDistance * RIPPLE_STAGGER_MS, withSequence(withTiming(RIPPLE_PEAK_SCALE, { duration: 100, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) })))
    // rippleDistance is only ever set once per round (see its own prop comment) — re-running this
    // if scale's own identity happened to change would just no-op against the same distance value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rippleDistance])

  const rippleStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { translateX: translateX.value }, { translateY: translateY.value }, { rotate: `${rotate.value}deg` }]
  }))

  return (
    <Animated.View style={rippleStyle}>
      {/* buttonColor/textColor alone can't color a wrong-guessed key: react-native-paper's Button
          ignores both once disabled=true (it checks `!disabled` before using them — see its own
          getButtonColors) and substitutes its own flat surfaceDisabled/onSurfaceDisabled
          regardless, which is why every guessed key looked the same before this. style/labelStyle
          land after that internal color in the component's own style arrays, so an explicit color
          there wins even while disabled — that's what actually shows the wrong-guess color rather
          than the generic disabled grey. */}
      <Button mode='contained' disabled={isGuessed || disabled} buttonColor={theme.colors.primary} textColor={theme.colors.onPrimary} style={[styles.key, width ? { width } : null, isWrong ? { backgroundColor: theme.colors.dangerContainer } : null]} onPress={onPress} hitSlop={KEY_HIT_SLOP} labelStyle={[styles.text, isWrong ? { color: theme.colors.onDangerContainer } : null]}>
        {letter}
      </Button>
    </Animated.View>
  )
}

export const Keyboard: React.FC<KeyboardProps> = ({ disabled = false, guessedLetters, phrase, winningLetter, falling = false, started = true, layout = 'qwerty', onGuess, onReadyChange, style }) => {
  // useAutoPaperTheme, not react-native-paper's plain useTheme — danger/onDanger below are
  // @rific/auto-paper's own extended color roles (see useDifficultyColors.ts's own comment on
  // this same danger-not-error naming), not part of react-native-paper's own MD3 theme type.
  const theme = useAutoPaperTheme()
  const vibration = useVibration()
  const rows = LAYOUT_ROWS[layout]
  const winningPosition = findKeyPosition(rows, winningLetter)
  const [containerWidth, setContainerWidth] = useState(0)
  // Read once and handed to every key as their shared fall target (see KeyboardKeyProps.fallDistance's
  // own comment) rather than each key measuring its own on-screen position.
  const { height: fallDistance } = useWindowDimensions()
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
  // One light tap per row, timed to when that row's own fall actually starts (SHAKE_TOTAL_MS, then
  // CASCADE_ROW_STAGGER_MS per row — same constants KeyboardKey uses below), rather than per-key:
  // 26 individual taps that close together would blur into a buzz on real hardware, while 3 read as
  // a distinct cascade. Unlike every other game-feedback haptic in this app (wrong/correct/win in
  // Game.tsx, bursts in fireworks.tsx — all unconditional expo-haptics calls), this one deliberately
  // goes through useVibration() so it respects the Settings > Haptics toggle; that's an intentional
  // exception, not an oversight.
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
            const entranceBaseDelayMs = (rows.length - 1 - rowIndex) * ENTRANCE_ROW_STAGGER_MS
            return <KeyboardKey key={letter} letter={letter} isGuessed={isGuessed} isWrong={isWrong} disabled={disabled} width={keyWidth} rippleDistance={rippleDistance} falling={falling} fallDistance={fallDistance} cascadeBaseDelayMs={cascadeBaseDelayMs} started={started} entranceBaseDelayMs={entranceBaseDelayMs} onPress={() => onGuess(letter)} theme={theme} />
          })}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  key: {
    borderRadius: 8,
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
  text: {
    marginHorizontal: 4
  }
})
