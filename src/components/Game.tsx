import * as haptics from 'expo-haptics'
import { JSX, useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Portal, useTheme } from 'react-native-paper'

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

export const Game = ({ onStop, onSolved, onLost, onGuessProgress, phrase, mode = DEFAULT_MODE, hint, packLabel, difficultyTier, celebration = DEFAULT_CELEBRATION, categoryProgress, continueLabel, locked = false }: GameProps): JSX.Element => {
  const { layout } = useKeyboardLayout()
  const theme = useTheme()
  const tertiaryColor = theme.colors.tertiary
  const [guessedLetters, setGuessedLetters] = useState<string[]>([])
  const [wrongGuesses, setWrongGuesses] = useState(0)
  const [hintRevealed, setHintRevealed] = useState(false)
  const [outcome, setOutcome] = useState<'win' | 'loss' | null>(null)
  // Separate from `outcome` itself — outcome flips the instant the round is decided (disabling the
  // keyboard, starting the celebration), but RoundEndDialog's own visibility waits on this too, so
  // a win doesn't get cut off by the dialog popping up over the celebration that just started (see
  // WIN_DIALOG_DELAY_MS above). A loss sets this true in the same tick as its own already-delayed
  // setOutcome('loss') below — nothing extra to wait for there beyond what that delay already covers.
  const [dialogReady, setDialogReady] = useState(false)
  // Bumped every time the celebration effect finishes a cycle, which remounts CelebrationView
  // (keyed on this value below) to start a fresh cycle — keeping the effect running for as long
  // as outcome stays 'win', i.e. for as long as the win dialog is open.
  const [celebrationCycle, setCelebrationCycle] = useState(0)
  // Captured once, not read live from `mode` — `mode` itself updates immediately when the player
  // picks a new art style mid-round (see PuzzleDrawer's onModeChange), which should only change how
  // the round is drawn, never its mechanics. Almost every mode shares the same 6-mistake limit, but
  // Stars doesn't (see modes/stars.tsx), so without this freeze, switching to or from it mid-round
  // would shift how many wrong guesses the player has left partway through.
  const [maxWrong] = useState(() => mode.maxMistakes)
  // Set synchronously the instant the round is decided (win, or the wrong-guess threshold is
  // crossed) — a ref rather than state so it takes effect immediately, before React commits a
  // re-render. Guards handleGuess against a stray guess during the win celebration, and against a
  // fast guess landing in the gap between crossing the loss threshold and the delayed
  // setOutcome('loss') below, either of which could otherwise flip a decided round's outcome.
  const roundOverRef = useRef(false)
  const lossTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const winDialogTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const pipsLabel = `Wrong guesses: ${wrongGuesses} of ${maxWrong}`

  return (
    <View style={styles.root}>
      <View style={styles.gameContainer}>
        <PuzzleInfoRow difficultyTier={difficultyTier} packLabel={packLabel} hint={hint} hintRevealed={hintRevealed} onRevealHint={() => setHintRevealed(true)} />
        <PuzzleStage mode={mode} phrase={phrase} guessedLetters={guessedLetters} wrongGuesses={wrongGuesses} maxWrong={maxWrong} pipsLabel={pipsLabel} />
        {/* Anchored to the keyboard (not the artwork, and not wherever PuzzleStage's own word-row
            centering happens to land it) — the pips are a "guesses remaining" readout, most useful
            right where your eyes already are while choosing the next letter, rather than a step
            removed near the art that's already telling the same story its own way. */}
        {hasVisual ? (
          <View style={styles.pipRow} accessibilityLabel={pipsLabel}>
            {Array.from({ length: maxWrong }, (_, i) => (
              <View key={i} style={[styles.pip, { borderColor: tertiaryColor }, i < wrongGuesses ? { backgroundColor: tertiaryColor } : null]} />
            ))}
          </View>
        ) : null}
        <Keyboard guessedLetters={guessedLetters} disabled={outcome !== null} layout={layout} onGuess={handleGuess} />
      </View>
      {outcome === 'win' ? (
        // Portal escapes this component's own box (which sits below the app header and inside
        // safe-area padding) to render at the app root instead — the same mechanism
        // RoundEndDialog's Dialog uses for its full-screen backdrop — so the celebration covers
        // the entire screen (header, keyboard, everything) rather than just Game's local area.
        <Portal>
          <CelebrationView key={celebrationCycle} colors={[theme.colors.primary, theme.colors.secondary, theme.colors.tertiary]} dark={theme.dark} onComplete={() => setCelebrationCycle((c) => c + 1)} />
        </Portal>
      ) : null}
      <RoundEndDialog visible={outcome !== null && dialogReady} outcome={outcome} phrase={phrase} categoryProgress={categoryProgress} onDismiss={onStop} continueLabel={continueLabel} />
    </View>
  )
}

const styles = StyleSheet.create({
  gameContainer: { alignItems: 'center', flex: 1 },
  pip: { borderRadius: 6, borderWidth: 1.5, height: 12, width: 12 },
  pipRow: { flexDirection: 'row', gap: 8, marginBottom: 12, marginTop: 4 },
  root: { flex: 1 }
})
