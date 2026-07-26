import { useThemeSettings } from '@rific/auto-paper'
import * as haptics from 'expo-haptics'
import { JSX, useEffect, useMemo, useRef, useState } from 'react'
import { LayoutChangeEvent, Platform, StyleSheet, View } from 'react-native'
import { Button, Portal, Text, useTheme } from 'react-native-paper'

import { type CelebrationEffect, DEFAULT_CELEBRATION } from '@/effects/registry'
import { useKeyboardLayout } from '@/hooks/useKeyboardLayout'
import { DEFAULT_MODE } from '@/modes/registry'
import type { GameMode } from '@/types/gameModes'

import { GameVisual } from './GameVisual'
import { Keyboard } from './Keyboard'
import { type CategoryProgress, RoundEndDialog } from './RoundEndDialog'

// Base sizes for the word display (also referenced by the shrink-to-fit calculation below).
const WORD_FONT_SIZE = 30
const WORD_FONT_SIZE_LARGE = 56
const MIN_WORD_FONT_SIZE = 16
// Fraction of fontSize a monospace glyph cell (Menlo / Android monospace) occupies. Approximate,
// so the fitted size leaves a little slack rather than exactly grazing the measured width.
const MONOSPACE_CHAR_WIDTH_RATIO = 0.62

export type SolveDetails = { wrongGuesses: number; hintRevealed: boolean }

export type GameProps = {
  onStop: () => void
  onSolved?: (details: SolveDetails) => void
  onLost?: () => void
  phrase: string
  mode?: GameMode
  hint?: string
  celebration?: CelebrationEffect
  categoryProgress?: CategoryProgress | null
  onAnotherInCategory?: () => void
}

export const Game = ({ onStop, onSolved, onLost, phrase, mode = DEFAULT_MODE, hint, celebration = DEFAULT_CELEBRATION, categoryProgress, onAnotherInCategory }: GameProps): JSX.Element => {
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

  const hasVisual = mode.hasVisual !== false

  // Measured rather than Dimensions-derived (module-scope window width is 0 on web - see the
  // same pattern in ModeSelector). 0 means "not measured yet"; the base size is used until then.
  const [rowWidth, setRowWidth] = useState(0)
  const handleWordRowLayout = (e: LayoutChangeEvent) => setRowWidth(e.nativeEvent.layout.width)

  const fittedWordFontSize = useMemo(() => {
    const baseFontSize = hasVisual ? WORD_FONT_SIZE : WORD_FONT_SIZE_LARGE
    if (!rowWidth) return baseFontSize
    // Letters render as N glyphs joined by N-1 non-breaking-space glyphs (see guessWords above),
    // so a word of N letters occupies 2N-1 monospace cells on its line.
    const longestWordLength = Math.max(...phrase.split(' ').map((word) => word.length))
    const renderedCells = longestWordLength * 2 - 1
    const maxFittingSize = Math.floor(rowWidth / (renderedCells * MONOSPACE_CHAR_WIDTH_RATIO))
    return Math.max(MIN_WORD_FONT_SIZE, Math.min(baseFontSize, maxFittingSize))
  }, [rowWidth, hasVisual, phrase])
  const pipsLabel = `Wrong guesses: ${wrongGuesses} of ${maxWrong}`

  return (
    <View style={styles.root}>
      <View style={styles.gameContainer}>
        {hint ? (
          <View style={styles.hintSlot}>
            {hintRevealed ? (
              <Text style={styles.hint} variant='bodyMedium' numberOfLines={1}>
                {hint}
              </Text>
            ) : (
              <Button mode='text' icon='lightbulb-outline' compact textColor={tertiaryColor} onPress={() => setHintRevealed(true)}>
                Show hint
              </Button>
            )}
          </View>
        ) : null}
        <View style={styles.visualArea}>
          {hasVisual ? (
            <GameVisual mode={mode} mistakes={wrongGuesses} color={color} style={styles.visual} />
          ) : (
            // No artwork to carry the "how many guesses left" tension in this mode, so the pips
            // take over the artwork's own slot (and its size) instead of trailing after the word
            // as a row of barely-there dots.
            <View style={styles.pipClusterWrap} accessibilityLabel={pipsLabel}>
              <View style={styles.pipClusterRow}>
                {Array.from({ length: maxWrong }, (_, i) => (
                  <View key={i} style={[styles.pipLarge, { borderColor: tertiaryColor }, i < wrongGuesses ? { backgroundColor: tertiaryColor } : null]} />
                ))}
              </View>
            </View>
          )}
        </View>
        {hasVisual ? (
          <View style={styles.pipRow} accessibilityLabel={pipsLabel}>
            {Array.from({ length: maxWrong }, (_, i) => (
              <View key={i} style={[styles.pip, { borderColor: tertiaryColor }, i < wrongGuesses ? { backgroundColor: tertiaryColor } : null]} />
            ))}
          </View>
        ) : null}
        <View style={hasVisual ? styles.wordRow : styles.wordRowLarge} accessible accessibilityLabel='Secret word display' onLayout={handleWordRowLayout}>
          {guessWords.map((word, i) => (
            <Text key={i} style={[hasVisual ? styles.text : styles.textLarge, { fontSize: fittedWordFontSize }]}>
              {word}
            </Text>
          ))}
        </View>
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
      <RoundEndDialog visible={outcome !== null} outcome={outcome} phrase={phrase} categoryProgress={categoryProgress} onDismiss={onStop} onAnotherInCategory={onAnotherInCategory} />
    </View>
  )
}

const styles = StyleSheet.create({
  gameContainer: { alignItems: 'center', flex: 1 },
  hint: { textAlign: 'center' },
  hintSlot: { alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center', marginBottom: 4, marginTop: 4, minHeight: 38, paddingHorizontal: 24 },
  pip: { borderRadius: 6, borderWidth: 1.5, height: 12, width: 12 },
  pipClusterRow: { columnGap: 18, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 24, rowGap: 18 },
  pipClusterWrap: { alignItems: 'center', flex: 1, justifyContent: 'center', width: '100%' },
  pipLarge: { borderRadius: 16, borderWidth: 3, height: 32, width: 32 },
  pipRow: { flexDirection: 'row', gap: 8, marginBottom: 12, marginTop: 4 },
  root: { flex: 1 },
  text: { fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo', fontSize: WORD_FONT_SIZE, textAlign: 'center' },
  textLarge: { fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo', fontSize: WORD_FONT_SIZE_LARGE, textAlign: 'center' },
  visual: { flex: 1, width: '100%' },
  visualArea: { flex: 1, width: '100%' },
  wordRow: { columnGap: 34, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 12, rowGap: 4 },
  wordRowLarge: { columnGap: 60, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 12, rowGap: 8 }
})
