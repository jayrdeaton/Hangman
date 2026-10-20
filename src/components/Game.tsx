import { JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Portal, useTheme } from 'react-native-paper'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'

import { type CelebrationEffect, DEFAULT_CELEBRATION } from '@/effects/registry'
import { useGameHaptics } from '@/hooks/useGameHaptics'
import { useKeyboardLayout } from '@/hooks/useKeyboardLayout'
import { useSoundEffects } from '@/hooks/useSoundEffects'
import { DEFAULT_MODE } from '@/modes/registry'
import { PIPS_SWEEP_DELAY_MS } from '@/modes/shared/sceneReveal'
import { FadeScaleIn, SketchCircle } from '@/modes/shared/sketchShapes'
import type { RoundProgress } from '@/redux/roundSlice'
import type { GameMode } from '@/types/gameModes'
import type { PuzzleDifficultyTier } from '@/utils/puzzleCatalog'

import { Keyboard } from './Keyboard'
import { PuzzleInfoRow } from './PuzzleInfoRow'
import { PuzzleStage } from './PuzzleStage'
import { type CategoryProgress, type PnpRoundSummary, RoundEndDialog } from './RoundEndDialog'

export type SolveDetails = { wrongGuesses: number; hintRevealed: boolean; guessCount: number }
export type LossDetails = { wrongGuesses: number; guessCount: number }

// How long a win holds off showing RoundEndDialog after the last letter lands - long enough for
// the finished word to actually register and for a couple of the celebration's firework bursts to
// go off (each burst runs ~1200ms and a new one starts every 180-420ms - see fireworks.tsx's
// BURST_LIFETIME_MS/MIN_BURST_INTERVAL_MS/MAX_BURST_INTERVAL_MS), rather than the dialog cutting
// the moment off immediately. Longer than the loss path's own 450ms delay below, which only needs
// to cover the final stage of the artwork drawing, not a whole show. Exported so tests can assert
// against the real value instead of a hand-copied magic number.
export const WIN_DIALOG_DELAY_MS = 2000

// Wrong-guess pip row anchored to the keyboard (see its own render comment below): a hand-drawn ring
// that blooms a dot on a miss, the same row for every art, Letters Only included.
const PIP_SIZE = 12
const PIP_CENTER = PIP_SIZE / 2
const PIP_STROKE_WIDTH = 1.5
const PIP_RADIUS = PIP_CENTER - PIP_STROKE_WIDTH
// Stagger between one pip ring's own reveal and the next at round start - same spirit as
// SketchWord's own BLANK_STAGGER_MS. Added on
// top of PIPS_SWEEP_DELAY_MS (see sceneReveal.ts), which is the whole-screen sweep's own head start
// for this band, not a per-pip amount.
const PIP_STAGGER_MS = 60

// Duck-typed rather than `instanceof HTMLElement` so it stays safe to call where the DOM globals
// don't exist. A keydown's target is the window or document when nothing is focused, and those
// have no tagName, so they fall through to false.
const EDITABLE_TAGS = ['INPUT', 'TEXTAREA', 'SELECT']
const isEditableTarget = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null
  return element !== null && (element.isContentEditable === true || EDITABLE_TAGS.includes(element.tagName))
}

export type GameProps = {
  onStop: () => void
  onSolved?: (details: SolveDetails) => void
  onLost?: (details: LossDetails) => void
  // Fired whenever a guess lands or the hint opens. The game screen saves it into the round slice,
  // so a relaunch puts the same board back (see initialGuessedLetters) and leaving mid-round keeps it.
  onProgress?: (progress: RoundProgress) => void
  // The board to start from, read once at mount: a saved round coming back after a relaunch or a trip
  // to the loadout. Omitted, the round starts blank.
  initialGuessedLetters?: string[]
  initialHintRevealed?: boolean
  phrase: string
  mode?: GameMode
  hint?: string
  packLabel?: string
  difficultyTier?: PuzzleDifficultyTier
  celebration?: CelebrationEffect
  categoryProgress?: CategoryProgress | null
  // A Pass & Play round's rows on the result card, and its Back button (see RoundEndDialog).
  passAndPlay?: PnpRoundSummary | null
  onBack?: () => void
  // True while a dialog covers the board (pass-and-play's prompt and hand-off, which mount the real
  // round underneath themselves rather than a blank screen, so there's nothing left to reveal once
  // the dialog closes; the Settings sheet), or while the game screen isn't the one showing. Guards handleGuess only, deliberately
  // NOT the Keyboard's own `disabled` styling below - greying it out would repaint the board the
  // instant the dialog disappears, which is the exact flash mounting it early was meant to avoid.
  // The dialog's backdrop already blocks on-screen taps; this only needs to catch the
  // physical-keyboard listener, which isn't gated by touch at all.
  locked?: boolean
}

export const Game = ({ onStop, onSolved, onLost, onProgress, initialGuessedLetters, initialHintRevealed = false, phrase, mode = DEFAULT_MODE, hint, packLabel, difficultyTier, celebration = DEFAULT_CELEBRATION, categoryProgress, passAndPlay, onBack, locked = false }: GameProps): JSX.Element => {
  const { layout } = useKeyboardLayout()
  const { playCorrect, playWrong, playWin, playLoss } = useSoundEffects()
  const gameHaptics = useGameHaptics()
  const theme = useTheme()
  const secondaryColor = theme.colors.secondary
  const [guessedLetters, setGuessedLetters] = useState<string[]>(() => initialGuessedLetters ?? [])
  const [wrongGuesses, setWrongGuesses] = useState(() => (initialGuessedLetters ?? []).filter((letter) => !phrase.includes(letter)).length)
  const [hintRevealed, setHintRevealed] = useState(initialHintRevealed)
  const [outcome, setOutcome] = useState<'win' | 'loss' | null>(null)
  // The letter whose guess completed the round, once won - see Keyboard.tsx's own comment on why
  // it's only ever set, never cleared (a fresh round is a fresh Game/Keyboard instance).
  const [winningLetter, setWinningLetter] = useState<string | null>(null)
  // Separate from `outcome` itself - outcome flips the instant the round is decided (disabling the
  // keyboard, starting the celebration), but RoundEndDialog's own visibility waits on this too, so
  // a win doesn't get cut off by the dialog popping up over the celebration that just started (see
  // WIN_DIALOG_DELAY_MS above). A loss sets this true in the same tick as its own already-delayed
  // setOutcome('loss') below - nothing extra to wait for there beyond what that delay already covers.
  const [dialogReady, setDialogReady] = useState(false)
  // Drives the keyboard's own "falling apart" collapse (see Keyboard.tsx's own falling prop
  // comment) - set in the same tick as roundOverRef's own flip below, NOT inside the delayed
  // setOutcome('loss') timeout, so the shake/fall begins the instant the round is actually lost
  // rather than waiting on the 450ms delay that only exists to let the final hangman art render.
  const [keyboardFalling, setKeyboardFalling] = useState(false)
  // Set by Next and by Back. Every next-puzzle path remounts Game, so this usually never matters, but a
  // shared-link puzzle's Next and Pass & Play's Back leave for the loadout instead, and the web keeps a
  // left screen mounted: without this the card (and a win's fireworks) would still be up if the player
  // came back.
  const [roundEndDismissed, setRoundEndDismissed] = useState(false)
  const handleRoundEndDismiss = useCallback(() => {
    setRoundEndDismissed(true)
    onStop()
  }, [onStop])
  const handleRoundEndBack = useMemo(
    () =>
      onBack
        ? () => {
            setRoundEndDismissed(true)
            onBack()
          }
        : undefined,
    [onBack]
  )
  // Bumped every time the celebration effect finishes a cycle, which remounts CelebrationView
  // (keyed on this value below) to start a fresh cycle - keeping the effect running for as long
  // as outcome stays 'win', i.e. for as long as the win dialog is open.
  const [celebrationCycle, setCelebrationCycle] = useState(0)
  // Captured once, not read live from `mode` - `mode` itself updates when the player picks a new art
  // style for a round left waiting on the loadout (see roundSlice's setRoundArt), which should only change how
  // the round is drawn, never its mechanics. Every built-in mode shares the same 6-mistake baseline
  // today, but this freeze still guards a future or custom mode that doesn't - without it, switching
  // to or from one mid-round would shift how many wrong guesses the player has left partway through.
  const [maxWrong] = useState(() => mode.maxMistakes)
  // Set synchronously the instant the round is decided (win, or the wrong-guess threshold is
  // crossed) - a ref rather than state so it takes effect immediately, before React commits a
  // re-render. Guards handleGuess against a stray guess during the win celebration, and against a
  // fast guess landing in the gap between crossing the loss threshold and the delayed
  // setOutcome('loss') below, either of which could otherwise flip a decided round's outcome.
  const roundOverRef = useRef(false)
  const lossTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const winDialogTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Both start false on every fresh mount (a new round is a new Game instance - see roundSlice's
  // round id), and each flips true once, permanently, the moment its own owner reports it's fully
  // measured (see PuzzleStage's and Keyboard's own onReadyChange comments for what that covers:
  // the artwork box, the word row, and every keyboard key's real width). Before this fix, each of
  // those measured its own size independently and popped into its final layout the moment ITS OWN
  // measurement landed - meaning the artwork/word area and the keyboard could (and did) each
  // visibly snap into place at a different moment, on top of a game screen whose other pieces
  // (difficulty pill, wrong-guess pips) were already sitting there fully visible the whole time.
  // Gating the reveal on BOTH signals together, and applying it to the whole screen at once (see
  // gameFadeStyle below), is what makes that a single already-correct reveal instead of a handful
  // of separately-timed ones.
  const [puzzleStageReady, setPuzzleStageReady] = useState(false)
  const [keyboardReady, setKeyboardReady] = useState(false)
  const gameReady = puzzleStageReady && keyboardReady
  const gameOpacity = useSharedValue(0)
  useEffect(() => {
    if (!gameReady) return
    gameOpacity.value = withTiming(1, { duration: 220 })
  }, [gameReady, gameOpacity])
  const gameFadeStyle = useAnimatedStyle(() => ({ opacity: gameOpacity.value }))

  useEffect(
    () => () => {
      if (lossTimeoutRef.current) clearTimeout(lossTimeoutRef.current)
      if (winDialogTimeoutRef.current) clearTimeout(winDialogTimeoutRef.current)
    },
    []
  )

  useEffect(() => {
    onProgress?.({ guessedLetters, hintRevealed })
  }, [guessedLetters, hintRevealed, onProgress])

  const handleGuess = (letter: string) => {
    if (locked || roundOverRef.current) return
    const L = letter.toUpperCase()
    if (guessedLetters.includes(L)) return
    const next = [...guessedLetters, L]
    setGuessedLetters(next)
    if (!phrase.includes(L)) {
      const w = wrongGuesses + 1
      setWrongGuesses(w)
      gameHaptics.wrongGuess()
      playWrong()
      if (w >= maxWrong) {
        roundOverRef.current = true
        setKeyboardFalling(true)
        onLost?.({ wrongGuesses: w, guessCount: next.length })
        // Stacks with the wrong-guess buzz above, same as a winning guess stacks its own correct
        // blip with the fanfare below - the final wrong guess is still a wrong guess first.
        playLoss()
        lossTimeoutRef.current = setTimeout(() => {
          setOutcome('loss')
          setDialogReady(true)
        }, 450)
      }
    } else {
      gameHaptics.correctGuess()
      playCorrect()
      const allRevealed = phrase.split('').every((c) => c === ' ' || next.includes(c))
      if (allRevealed) {
        roundOverRef.current = true
        onSolved?.({ wrongGuesses, hintRevealed, guessCount: next.length })
        setOutcome('win')
        // Drives the keyboard's own ripple (see Keyboard.tsx) - set in the same batch as
        // setOutcome so the ripple starts the instant the board freezes, not a tick later.
        setWinningLetter(L)
        gameHaptics.win()
        playWin()
        winDialogTimeoutRef.current = setTimeout(() => setDialogReady(true), WIN_DIALOG_DELAY_MS)
      }
    }
  }

  // Physical keyboard guessing on web - deliberately no dep array so the listener always closes
  // over the current guess state. The listener is on window, so it hears every keystroke on the
  // page: a shortcut (Cmd+R, Ctrl+F) or a letter typed into any text field (a pack name, a Pass &
  // Play word) would otherwise also guess that letter in the round behind it.
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isEditableTarget(e.target)) return
      const key = e.key.toUpperCase()
      if (key.length === 1 && key >= 'A' && key <= 'Z') handleGuess(key)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const CelebrationView = celebration.Component
  // Order-preserving: guessedLetters is already in guess order, so the screen reader's label below
  // spells the wrong guesses out in the order they actually happened.
  const wrongLetters = guessedLetters.filter((letter) => !phrase.includes(letter))
  const pipsLabel = `Wrong guesses: ${wrongGuesses} of ${maxWrong}${wrongLetters.length > 0 ? ` (${wrongLetters.join(', ')})` : ''}`

  return (
    <View style={styles.root}>
      {/* One curtain over the whole screen, not per-piece - see gameReady's own comment for why a
          fade per measured region still isn't the same thing as this. PuzzleInfoRow and the pip
          row below have nothing of their own to measure, so they're covered by this for
          consistency (revealed as part of the same screen, not a beat ahead of it) rather than
          because they'd otherwise show anything wrong. */}
      <Animated.View testID='game-container' style={[styles.gameContainer, gameFadeStyle]}>
        <PuzzleInfoRow difficultyTier={difficultyTier} packLabel={packLabel} hint={hint} hintRevealed={hintRevealed} onRevealHint={() => setHintRevealed(true)} started={gameReady} />
        <PuzzleStage mode={mode} phrase={phrase} guessedLetters={guessedLetters} wrongGuesses={wrongGuesses} maxWrong={maxWrong} onReadyChange={setPuzzleStageReady} started={gameReady} />
        {/* Anchored to the keyboard (not the artwork, and not wherever PuzzleStage's own word-row
            centering happens to land it) - the pips are a "guesses remaining" readout, most useful
            right where your eyes already are while choosing the next letter, rather than a step
            removed near the art that's already telling the same story its own way. A plain dot
            row, deliberately small, the same for every art: Letters Only too (Jay, 2026-10-20: its
            own big lettered pips, in the artwork's slot, took the room its letters needed), whose
            word gets the whole artwork area instead. The keyboard already marks the wrong letters,
            and accessibilityLabel (pipsLabel) spells them out for a screen reader. */}
        <View style={styles.pipRow} accessibilityLabel={pipsLabel}>
          {Array.from({ length: maxWrong }, (_, i) => {
            const filled = i < wrongGuesses
            return (
              // testID lives on this wrapping View, not the Svg itself: Svg has no single host node
              // of its own to carry one (it's a pure viewport around its children).
              <View key={i} testID={`pip-${i}`}>
                <Svg width={PIP_SIZE} height={PIP_SIZE} viewBox={`0 0 ${PIP_SIZE} ${PIP_SIZE}`}>
                  <SketchCircle cx={PIP_CENTER} cy={PIP_CENTER} r={PIP_RADIUS} color={secondaryColor} strokeWidth={PIP_STROKE_WIDTH} start={gameReady} delayMs={PIPS_SWEEP_DELAY_MS + i * PIP_STAGGER_MS} />
                  {filled ? (
                    <FadeScaleIn cx={PIP_CENTER} cy={PIP_CENTER}>
                      <Circle cx={PIP_CENTER} cy={PIP_CENTER} r={PIP_RADIUS} fill={secondaryColor} />
                    </FadeScaleIn>
                  ) : null}
                </Svg>
              </View>
            )
          })}
        </View>
        <Keyboard guessedLetters={guessedLetters} phrase={phrase} winningLetter={winningLetter} falling={keyboardFalling} started={gameReady} disabled={outcome !== null} layout={layout} onGuess={handleGuess} onReadyChange={setKeyboardReady} />
      </Animated.View>
      {outcome === 'win' && !roundEndDismissed ? (
        // Portal escapes this component's own box (which sits below the app header and inside
        // safe-area padding) to render at the app root instead (the same mechanism
        // RoundEndDialog's card uses for its full-screen backdrop), so the celebration covers
        // the entire screen (header, keyboard, everything) rather than just Game's local area.
        <Portal>
          <CelebrationView key={celebrationCycle} colors={[theme.colors.primary, theme.colors.secondary, theme.colors.tertiary]} dark={theme.dark} onComplete={() => setCelebrationCycle((c) => c + 1)} />
        </Portal>
      ) : null}
      <RoundEndDialog visible={outcome !== null && dialogReady && !roundEndDismissed} outcome={outcome} phrase={phrase} guessedLetters={guessedLetters} categoryProgress={categoryProgress} passAndPlay={passAndPlay} onBack={handleRoundEndBack} onDismiss={handleRoundEndDismiss} />
    </View>
  )
}

const styles = StyleSheet.create({
  gameContainer: { alignItems: 'center', flex: 1 },
  pipRow: { flexDirection: 'row', gap: 8, marginBottom: 12, marginTop: 4 },
  root: { flex: 1 }
})
