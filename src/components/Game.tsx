import { useThemeSettings } from '@rific/auto-paper'
import * as haptics from 'expo-haptics'
import { JSX, useEffect, useMemo, useRef, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Button, Portal, Text, useTheme } from 'react-native-paper'

import { type CelebrationEffect, DEFAULT_CELEBRATION } from '@/effects/registry'
import { useKeyboardLayout } from '@/hooks/useKeyboardLayout'
import { DEFAULT_MODE } from '@/modes/registry'
import type { GameMode } from '@/types/gameModes'
import type { PuzzleDifficultyTier } from '@/utils/puzzleCatalog'

import { GameVisual } from './GameVisual'
import { Keyboard } from './Keyboard'
import { type CategoryProgress, RoundEndDialog } from './RoundEndDialog'

export type SolveDetails = { wrongGuesses: number; hintRevealed: boolean }

export type GameProps = {
  onStop: () => void
  onSolved?: (details: SolveDetails) => void
  onLost?: () => void
  phrase: string
  mode?: GameMode
  hint?: string
  difficultyTier?: PuzzleDifficultyTier
  celebration?: CelebrationEffect
  categoryProgress?: CategoryProgress | null
  onAnotherInCategory?: () => void
}

const DIFFICULTY_LABELS: Record<PuzzleDifficultyTier, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard'
}

const DIFFICULTY_COLORS: Record<PuzzleDifficultyTier, string> = {
  easy: '#2E7D32',
  medium: '#B8860B',
  hard: '#B00020'
}

export const Game = ({ onStop, onSolved, onLost, phrase, mode = DEFAULT_MODE, hint, difficultyTier, celebration = DEFAULT_CELEBRATION, categoryProgress, onAnotherInCategory }: GameProps): JSX.Element => {
  const { settings } = useThemeSettings()
  const { layout } = useKeyboardLayout()
  const theme = useTheme()
  const color = settings.color
  const tertiaryColor = theme.colors.tertiary
  const [guessedLetters, setGuessedLetters] = useState<string[]>([])
  const [wrongGuesses, setWrongGuesses] = useState(0)
  const [hintRevealed, setHintRevealed] = useState(false)
  const [outcome, setOutcome] = useState<'win' | 'loss' | null>(null)
  // Bumped every time the celebration effect finishes a cycle, which remounts CelebrationView
  // (keyed on this value below) to start a fresh cycle — keeping the effect running for as long
  // as outcome stays 'win', i.e. for as long as the win dialog is open.
  const [celebrationCycle, setCelebrationCycle] = useState(0)
  const maxWrong = mode.maxMistakes
  // Set synchronously the instant the round is decided (win, or the wrong-guess threshold is
  // crossed) — a ref rather than state so it takes effect immediately, before React commits a
  // re-render. Guards handleGuess against a stray guess during the win celebration, and against a
  // fast guess landing in the gap between crossing the loss threshold and the delayed
  // setOutcome('loss') below, either of which could otherwise flip a decided round's outcome.
  const roundOverRef = useRef(false)
  const lossTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (lossTimeoutRef.current) clearTimeout(lossTimeoutRef.current)
    },
    []
  )

  const handleGuess = (letter: string) => {
    if (roundOverRef.current) return
    const L = letter.toUpperCase()
    if (guessedLetters.includes(L)) return
    const next = [...guessedLetters, L]
    setGuessedLetters(next)
    if (!phrase.includes(L)) {
      const w = wrongGuesses + 1
      setWrongGuesses(w)
      void haptics.selectionAsync()
      if (w >= maxWrong) {
        roundOverRef.current = true
        onLost?.()
        lossTimeoutRef.current = setTimeout(() => setOutcome('loss'), 450)
      }
    } else {
      void haptics.impactAsync()
      const allRevealed = phrase.split('').every((c) => c === ' ' || next.includes(c))
      if (allRevealed) {
        roundOverRef.current = true
        onSolved?.({ wrongGuesses, hintRevealed })
        setOutcome('win')
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

  const guessWords = useMemo(() => {
    // Each word renders as its own flex item, letters joined by non-breaking spaces so a
    // word can never split across lines — a mid-word wrap is indistinguishable from a real
    // word boundary and reads as disingenuous. Wrapping happens between word items via
    // flexWrap, and the row's own gap supplies the visual separation, so no leftover
    // whitespace clings to the edge of a wrapped line and throws off centering.
    return phrase.split(' ').map((word) =>
      word
        .split('')
        .map((ch) => (guessedLetters.includes(ch) ? ch : '_'))
        .join('\u00A0')
    )
  }, [phrase, guessedLetters])

  const CelebrationView = celebration.Component

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={styles.gameContainer}>
        {difficultyTier ? (
          <View style={[styles.difficultyBadge, { borderColor: DIFFICULTY_COLORS[difficultyTier] }]} accessibilityLabel={`Difficulty: ${DIFFICULTY_LABELS[difficultyTier]}`}>
            <Text style={[styles.difficultyText, { color: DIFFICULTY_COLORS[difficultyTier] }]}>{DIFFICULTY_LABELS[difficultyTier]}</Text>
          </View>
        ) : null}
        {mode.hasVisual === false ? (
          <View style={[styles.visual, styles.lettersOnly]}>
            <View style={styles.wordRowLarge} accessible accessibilityLabel='Secret word display'>
              {guessWords.map((word, i) => (
                <Text key={i} style={styles.textLarge}>
                  {word}
                </Text>
              ))}
            </View>
          </View>
        ) : (
          <>
            <GameVisual mode={mode} mistakes={wrongGuesses} color={color} style={styles.visual} />
            <View style={styles.wordRow} accessible accessibilityLabel='Secret word display'>
              {guessWords.map((word, i) => (
                <Text key={i} style={styles.text}>
                  {word}
                </Text>
              ))}
            </View>
          </>
        )}
        <View style={styles.pipRow} accessibilityLabel={`Wrong guesses: ${wrongGuesses} of ${maxWrong}`}>
          {Array.from({ length: maxWrong }, (_, i) => (
            <View key={i} style={[styles.pip, { borderColor: tertiaryColor }, i < wrongGuesses ? { backgroundColor: tertiaryColor } : null]} />
          ))}
        </View>
        {hint ? (
          <View style={styles.hintSlot}>
            {hintRevealed ? (
              <Text style={styles.hint} variant='bodyMedium' numberOfLines={1}>
                {hint}
              </Text>
            ) : (
              <Button mode='text' icon='lightbulb-outline' compact onPress={() => setHintRevealed(true)}>
                Show hint
              </Button>
            )}
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
          <CelebrationView
            key={celebrationCycle}
            colors={[theme.colors.primary, theme.colors.secondary, theme.colors.tertiary]}
            dark={theme.dark}
            onComplete={() => setCelebrationCycle((c) => c + 1)}
          />
        </Portal>
      ) : null}
      <RoundEndDialog visible={outcome !== null} outcome={outcome} phrase={phrase} categoryProgress={categoryProgress} onDismiss={onStop} onAnotherInCategory={onAnotherInCategory} />
    </View>
  )
}

const styles = StyleSheet.create({
  difficultyBadge: {
    borderRadius: 12,
    borderWidth: 1.5,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 3
  },
  difficultyText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  gameContainer: { alignItems: 'center', flex: 1 },
  hint: { textAlign: 'center' },
  hintSlot: { alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center', marginBottom: 8, minHeight: 38, paddingHorizontal: 24 },
  lettersOnly: { alignItems: 'center', justifyContent: 'center' },
  pip: { borderRadius: 6, borderWidth: 1.5, height: 12, width: 12 },
  pipRow: { flexDirection: 'row', gap: 8, marginBottom: 12, marginTop: 12 },
  text: { fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo', fontSize: 30, textAlign: 'center' },
  textLarge: { fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo', fontSize: 56, textAlign: 'center' },
  visual: { flex: 1, width: '100%' },
  wordRow: { columnGap: 34, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 4 },
  wordRowLarge: { columnGap: 60, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 8 }
})
