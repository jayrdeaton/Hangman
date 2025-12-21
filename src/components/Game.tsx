import * as haptics from 'expo-haptics'
import { JSX, useEffect, useMemo, useState } from 'react'
import { Alert, Platform, StyleSheet, Text as RNText, View } from 'react-native'
import { Text } from 'react-native-paper'

import { useTheme } from '../hooks'
import { HangmanDrawingRandom } from './HangmanDrawingRandom'
import { Keyboard } from './Keyboard'

export type GameProps = {
  onStop: () => void
  phrase: string
}

export const Game = ({ onStop, phrase }: GameProps): JSX.Element => {
  const { color } = useTheme()
  // Game state
  const [guessedLetters, setGuessedLetters] = useState<string[]>([])
  const [wrongGuesses, setWrongGuesses] = useState(0)
  const maxWrong = 6

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
        // show the loss alert while leaving the full hangman visible
        Alert.alert(
          'You lost!',
          `The phrase was ${phrase}.`,
          [
            {
              text: 'OK',
              onPress: onStop
            }
          ],
          { cancelable: false }
        )
      }
    } else {
      void haptics.impactAsync()

      const allRevealed = phrase.split('').every((c) => c === ' ' || next.includes(c))
      if (allRevealed) {
        Alert.alert(
          'You win!',
          `The phrase was ${phrase}.`,
          [
            {
              text: 'OK',
              onPress: onStop
            }
          ],
          { cancelable: false }
        )
      }
    }
  }
  useEffect(() => {
    setGuessedLetters([])
    setWrongGuesses(0)
  }, [phrase])
  const guessDisplay = useMemo(() => {
    // Join letters with a narrow no-break space (\u202F) so words cannot
    // break internally, but use a regular space between words so the
    // visible gap stays (and wrapped lines won't gain a leading indent).
    return phrase
      .split(' ')
      .map((word) =>
        word
          .split('')
          .map((ch) => (guessedLetters.includes(ch) ? ch : '_'))
          .join('\u202F')
      )
      .join(' ')
  }, [phrase, guessedLetters])
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={styles.gameContainer}>
        <HangmanDrawingRandom wrongGuesses={wrongGuesses} color={color} style={styles.flex} />
        <RNText style={styles.text} accessibilityLabel='Secret word display'>
          {guessDisplay}
        </RNText>
        <Text style={styles.margin}>
          Wrong guesses: {wrongGuesses} / {maxWrong}
        </Text>
        <Keyboard guessedLetters={guessedLetters} color={color} onGuess={handleGuess} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, width: '100%' },
  gameContainer: { alignItems: 'center', flex: 1 },
  margin: { marginVertical: 8 },
  text: { fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo', fontSize: 30, textAlign: 'center' }
})
