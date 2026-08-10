import * as haptics from 'expo-haptics'
import { JSX, useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Portal, useTheme } from 'react-native-paper'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

import { type CelebrationEffect, DEFAULT_CELEBRATION } from '@/effects/registry'
import { useKeyboardLayout } from '@/hooks/useKeyboardLayout'
import { DEFAULT_MODE } from '@/modes/registry'
import type { GameMode } from '@/types/gameModes'
import type { PuzzleDifficultyTier } from '@/utils/puzzleCatalog'

import { Keyboard } from './Keyboard'
import { PuzzleInfoRow } from './PuzzleInfoRow'
import { PuzzleStage } from './PuzzleStage'
import { type CategoryProgress, RoundEndDialog } from './RoundEndDialog'

export type SolveDetails = { wrongGuesses: number; hintRevealed: boolean; guessCount: number }
export type LossDetails = { wrongGuesses: number; guessCount: number }

// How long a win holds off showing RoundEndDialog after the last letter lands — long enough for
// the finished word to actually register and for a couple of the celebration's firework bursts to
// go off (each burst runs ~1200ms and a new one starts every 180-420ms — see fireworks.tsx's
// BURST_LIFETIME_MS/MIN_BURST_INTERVAL_MS/MAX_BURST_INTERVAL_MS), rather than the dialog cutting
// the moment off immediately. Longer than the loss path's own 450ms delay below, which only needs
// to cover the final stage of the artwork drawing, not a whole show. Exported so tests can assert
// against the real value instead of a hand-copied magic number.
export const WIN_DIALOG_DELAY_MS = 2000

export type GameProps = {
  onStop: () => void
  onSolved?: (details: SolveDetails) => void
  onLost?: (details: LossDetails) => void
  // Fired whenever the guessed-letter set changes, mid-round — lets a caller track "has the
  // player guessed anything yet" and "how many wrong guesses so far" for THIS round without
  // lifting the full guessedLetters state, e.g. to decide whether starting a different puzzle
  // should count as an abandoned loss (see Main.tsx's shouldConfirmAbandon).
  onGuessProgress?: (details: LossDetails) => void
  phrase: string
  mode?: GameMode
  hint?: string
  packLabel?: string
  difficultyTier?: PuzzleDifficultyTier
  celebration?: CelebrationEffect
  categoryProgress?: CategoryProgress | null
  // Passed straight through to RoundEndDialog, same as categoryProgress above — see its own prop
  // comment there for why this arrives pre-resolved rather than as raw AchievementIds.
  unlockedAchievementTitles?: string[]
  // Passed straight through to RoundEndDialog — Game plays a pass-and-play round exactly like any
  // other, it just needs the continue button to say "write the next word" instead of "next puzzle".
  continueLabel?: string
  // True while a dialog covers the board — currently only pass-and-play's handoff step, which
  // mounts the real round underneath itself rather than a blank screen (see Main.tsx), so that
  // there's nothing left to reveal once the dialog closes. Guards handleGuess only, deliberately
  // NOT the Keyboard's own `disabled` styling below — greying it out would repaint the board the
  // instant the dialog disappears, which is the exact flash mounting it early was meant to avoid.
  // The dialog's backdrop already blocks on-screen taps; this only needs to catch the
  // physical-keyboard listener, which isn't gated by touch at all.
  locked?: boolean
}

export const Game = ({ onStop, onSolved, onLost, onGuessProgress, phrase, mode = DEFAULT_MODE, hint, packLabel, difficultyTier, celebration = DEFAULT_CELEBRATION, categoryProgress, unlockedAchievementTitles, continueLabel, locked = false }: GameProps): JSX.Element => {
  const { layout } = useKeyboardLayout()
  const theme = useTheme()
  const tertiaryColor = theme.colors.tertiary
  const [guessedLetters, setGuessedLetters] = useState<string[]>([])
  const [wrongGuesses, setWrongGuesses] = useState(0)
  const [hintRevealed, setHintRevealed] = useState(false)
  const [outcome, setOutcome] = useState<'win' | 'loss' | null>(null)
  // The letter whose guess completed the round, once won — see Keyboard.tsx's own comment on why
  // it's only ever set, never cleared (a fresh round is a fresh Game/Keyboard instance).
  const [winningLetter, setWinningLetter] = useState<string | null>(null)
  // Separate from `outcome` itself — outcome flips the instant the round is decided (disabling the
  // keyboard, starting the celebration), but RoundEndDialog's own visibility waits on this too, so
  // a win doesn't get cut off by the dialog popping up over the celebration that just started (see
  // WIN_DIALOG_DELAY_MS above). A loss sets this true in the same tick as its own already-delayed
  // setOutcome('loss') below — nothing extra to wait for there beyond what that delay already covers.
  const [dialogReady, setDialogReady] = useState(false)
  // Drives the keyboard's own "falling apart" collapse (see Keyboard.tsx's own falling prop
  // comment) — set in the same tick as roundOverRef's own flip below, NOT inside the delayed
  // setOutcome('loss') timeout, so the shake/fall begins the instant the round is actually lost
  // rather than waiting on the 450ms delay that only exists to let the final hangman art render.
  const [keyboardFalling, setKeyboardFalling] = useState(false)
  // Bumped every time the celebration effect finishes a cycle, which remounts CelebrationView
  // (keyed on this value below) to start a fresh cycle — keeping the effect running for as long
  // as outcome stays 'win', i.e. for as long as the win dialog is open.
  const [celebrationCycle, setCelebrationCycle] = useState(0)
  // Captured once, not read live from `mode` — `mode` itself updates immediately when the player
  // picks a new art style mid-round (see PuzzleDrawer's onModeChange), which should only change how
  // the round is drawn, never its mechanics. Every built-in mode shares the same 6-mistake baseline
  // today, but this freeze still guards a future or custom mode that doesn't — without it, switching
  // to or from one mid-round would shift how many wrong guesses the player has left partway through.
  const [maxWrong] = useState(() => mode.maxMistakes)
  // Set synchronously the instant the round is decided (win, or the wrong-guess threshold is
  // crossed) — a ref rather than state so it takes effect immediately, before React commits a
  // re-render. Guards handleGuess against a stray guess during the win celebration, and against a
  // fast guess landing in the gap between crossing the loss threshold and the delayed
  // setOutcome('loss') below, either of which could otherwise flip a decided round's outcome.
  const roundOverRef = useRef(false)
  const lossTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const winDialogTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Both start false on every fresh mount (a new round is a new Game instance — see Main.tsx's
  // roundKey), and each flips true once, permanently, the moment its own owner reports it's fully
  // measured (see PuzzleStage's and Keyboard's own onReadyChange comments for what that covers:
  // the artwork box, the word row, and every keyboard key's real width). Before this fix, each of
  // those measured its own size independently and popped into its final layout the moment ITS OWN
  // measurement landed — meaning the artwork/word area and the keyboard could (and did) each
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
    onGuessProgress?.({ wrongGuesses, guessCount: guessedLetters.length })
  }, [guessedLetters, wrongGuesses, onGuessProgress])

  const handleGuess = (letter: string) => {
    if (locked || roundOverRef.current) return
    const L = letter.toUpperCase()
    if (guessedLetters.includes(L)) return
    const next = [...guessedLetters, L]
    setGuessedLetters(next)
    if (!phrase.includes(L)) {
      const w = wrongGuesses + 1
      setWrongGuesses(w)
      // Error, not selectionAsync — a wrong guess should feel distinctly different from a correct
      // one, not just a lighter version of the same tick.
      void haptics.notificationAsync(haptics.NotificationFeedbackType.Error)
      if (w >= maxWrong) {
        roundOverRef.current = true
        setKeyboardFalling(true)
        onLost?.({ wrongGuesses: w, guessCount: next.length })
        lossTimeoutRef.current = setTimeout(() => {
          setOutcome('loss')
          setDialogReady(true)
        }, 450)
      }
    } else {
      void haptics.impactAsync()
      const allRevealed = phrase.split('').every((c) => c === ' ' || next.includes(c))
      if (allRevealed) {
        roundOverRef.current = true
        onSolved?.({ wrongGuesses, hintRevealed, guessCount: next.length })
        setOutcome('win')
        // Drives the keyboard's own ripple (see Keyboard.tsx) — set in the same batch as
        // setOutcome so the ripple starts the instant the board freezes, not a tick later.
        setWinningLetter(L)
        // A distinctly more celebratory pulse than a regular correct-letter impact — timed to the
        // same guess that also kicks off the fireworks celebration below.
        void haptics.notificationAsync(haptics.NotificationFeedbackType.Success)
        winDialogTimeoutRef.current = setTimeout(() => setDialogReady(true), WIN_DIALOG_DELAY_MS)
      }
    }
  }

  // Physical keyboard guessing on web — deliberately no dep array so the listener always closes
  // over the current guess state.
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase()
      if (key.length === 1 && key >= 'A' && key <= 'Z') handleGuess(key)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const CelebrationView = celebration.Component
  const hasVisual = mode.hasVisual !== false
  // Order-preserving: guessedLetters is already in guess order, so this stays in the order the
  // wrong guesses actually happened — pip i (below, and in PuzzleStage's own Letters Only cluster)
  // shows wrongLetters[i], the i-th wrong guess, not just a count.
  const wrongLetters = guessedLetters.filter((letter) => !phrase.includes(letter))
  const pipsLabel = `Wrong guesses: ${wrongGuesses} of ${maxWrong}${wrongLetters.length > 0 ? ` (${wrongLetters.join(', ')})` : ''}`

  return (
    <View style={styles.root}>
      {/* One curtain over the whole screen, not per-piece — see gameReady's own comment for why a
          fade per measured region still isn't the same thing as this. PuzzleInfoRow and the pip
          row below have nothing of their own to measure, so they're covered by this for
          consistency (revealed as part of the same screen, not a beat ahead of it) rather than
          because they'd otherwise show anything wrong. */}
      <Animated.View testID='game-container' style={[styles.gameContainer, gameFadeStyle]}>
        <PuzzleInfoRow difficultyTier={difficultyTier} packLabel={packLabel} hint={hint} hintRevealed={hintRevealed} onRevealHint={() => setHintRevealed(true)} />
        <PuzzleStage mode={mode} phrase={phrase} guessedLetters={guessedLetters} wrongGuesses={wrongGuesses} wrongLetters={wrongLetters} maxWrong={maxWrong} pipsLabel={pipsLabel} onReadyChange={setPuzzleStageReady} started={gameReady} />
        {/* Anchored to the keyboard (not the artwork, and not wherever PuzzleStage's own word-row
            centering happens to land it) — the pips are a "guesses remaining" readout, most useful
            right where your eyes already are while choosing the next letter, rather than a step
            removed near the art that's already telling the same story its own way. Stays a plain
            dot row rather than showing letters (unlike PuzzleStage's own Letters Only cluster,
            which has the room to spare) — see PLAN.md's own reasoning: this row is deliberately
            small since the artwork alongside it already carries the "how many mistakes" drama, and
            legible letters wouldn't fit at this size without enlarging it. accessibilityLabel
            (pipsLabel) still spells the wrong letters out either way, for a screen reader. */}
        {hasVisual ? (
          <View style={styles.pipRow} accessibilityLabel={pipsLabel}>
            {Array.from({ length: maxWrong }, (_, i) => (
              <View key={i} style={[styles.pip, { borderColor: tertiaryColor }, i < wrongGuesses ? { backgroundColor: tertiaryColor } : null]} />
            ))}
          </View>
        ) : null}
        <Keyboard guessedLetters={guessedLetters} phrase={phrase} winningLetter={winningLetter} falling={keyboardFalling} started={gameReady} disabled={outcome !== null} layout={layout} onGuess={handleGuess} onReadyChange={setKeyboardReady} />
      </Animated.View>
      {outcome === 'win' ? (
        // Portal escapes this component's own box (which sits below the app header and inside
        // safe-area padding) to render at the app root instead — the same mechanism
        // RoundEndDialog's Dialog uses for its full-screen backdrop — so the celebration covers
        // the entire screen (header, keyboard, everything) rather than just Game's local area.
        <Portal>
          <CelebrationView key={celebrationCycle} colors={[theme.colors.primary, theme.colors.secondary, theme.colors.tertiary]} dark={theme.dark} onComplete={() => setCelebrationCycle((c) => c + 1)} />
        </Portal>
      ) : null}
      <RoundEndDialog visible={outcome !== null && dialogReady} outcome={outcome} phrase={phrase} categoryProgress={categoryProgress} unlockedAchievementTitles={unlockedAchievementTitles} onDismiss={onStop} continueLabel={continueLabel} />
    </View>
  )
}

const styles = StyleSheet.create({
  gameContainer: { alignItems: 'center', flex: 1 },
  pip: { borderRadius: 6, borderWidth: 1.5, height: 12, width: 12 },
  pipRow: { flexDirection: 'row', gap: 8, marginBottom: 12, marginTop: 4 },
  root: { flex: 1 }
})
