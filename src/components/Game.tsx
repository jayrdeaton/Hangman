import { useThemeSettings } from '@rific/auto-paper'
import * as haptics from 'expo-haptics'
import { JSX, useEffect, useMemo, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Button, Text } from 'react-native-paper'

import { DEFAULT_MODE } from '@/modes/registry'
import type { GameMode } from '@/types/gameModes'
import { alert } from '@/utils/alert'

import { GameVisual } from './GameVisual'
import { Keyboard } from './Keyboard'

export type SolveDetails = { wrongGuesses: number; hintRevealed: boolean }

export type GameProps = {
  onStop: () => void
  onSolved?: (details: SolveDetails) => void
  onLost?: () => void
  phrase: string
  mode?: GameMode
  hint?: string
}

export const Game = ({ onStop, onSolved, onLost, phrase, mode = DEFAULT_MODE, hint }: GameProps): JSX.Element => {
  const { settings } = useThemeSettings()
  const color = settings.color
  const [guessedLetters, setGuessedLetters] = useState<string[]>([])
  const [wrongGuesses, setWrongGuesses] = useState(0)
  const [hintRevealed, setHintRevealed] = useState(false)
  const maxWrong = mode.maxMistakes

  const handleGuess = (letter: string) => {
    const L = letter.toUpperCase()
    if (guessedLetters.includes(L)) return
    const next = [...guessedLetters, L]
    setGuessedLetters(next)
    if (!phrase.includes(L)) {
      const w = wrongGuesses + 1
      setWrongGuesses(w)
      void haptics.selectionAsync()
      if (w >= maxWrong) {
        onLost?.()
        void alert('You lost!', `The phrase was ${phrase}.`).then(onStop)
      }
    } else {
      void haptics.impactAsync()
      const allRevealed = phrase.split('').every((c) => c === ' ' || next.includes(c))
      if (allRevealed) {
        onSolved?.({ wrongGuesses, hintRevealed })
        void alert('You win!', `The phrase was ${phrase}.`).then(onStop)
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

  const guessDisplay = useMemo(() => {
    // Word gaps use 3 non-breaking spaces — visually distinct from the single regular space
    // between letters within a word, and guaranteed not to collapse on any platform. Without
    // this, multi-word phrases read as one unbroken run of blanks with no way to spot word
    // boundaries.
    return phrase
      .split(' ')
      .map((word) =>
        word
          .split('')
          .map((ch) => (guessedLetters.includes(ch) ? ch : '_'))
          .join(' ')
      )
      .join('   ')
  }, [phrase, guessedLetters])

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={styles.gameContainer}>
        {mode.hasVisual === false ? (
          <View style={[styles.visual, styles.lettersOnly]}>
            <Text style={styles.textLarge} accessibilityLabel='Secret word display'>
              {guessDisplay}
            </Text>
          </View>
        ) : (
          <>
            <GameVisual mode={mode} mistakes={wrongGuesses} color={color} style={styles.visual} />
            <Text style={styles.text} accessibilityLabel='Secret word display'>
              {guessDisplay}
            </Text>
          </>
        )}
        <View style={styles.pipRow} accessibilityLabel={`Wrong guesses: ${wrongGuesses} of ${maxWrong}`}>
          {Array.from({ length: maxWrong }, (_, i) => (
            <View key={i} style={[styles.pip, { borderColor: color }, i < wrongGuesses ? { backgroundColor: color } : null]} />
          ))}
        </View>
        {hint ? (
          hintRevealed ? (
            <Text style={styles.hint} variant='bodyMedium'>
              Hint: {hint}
            </Text>
          ) : (
            <Button mode='text' icon='lightbulb-outline' compact onPress={() => setHintRevealed(true)}>
              Show hint
            </Button>
          )
        ) : null}
        <Keyboard guessedLetters={guessedLetters} color={color} onGuess={handleGuess} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  gameContainer: { alignItems: 'center', flex: 1 },
  hint: { marginBottom: 8, textAlign: 'center' },
  lettersOnly: { alignItems: 'center', justifyContent: 'center' },
  pip: { borderRadius: 6, borderWidth: 1.5, height: 12, width: 12 },
  pipRow: { flexDirection: 'row', gap: 8, marginVertical: 10 },
  text: { fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo', fontSize: 30, textAlign: 'center' },
  textLarge: { fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo', fontSize: 56, textAlign: 'center' },
  visual: { flex: 1, width: '100%' }
})
