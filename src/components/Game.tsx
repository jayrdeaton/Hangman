import { JSX, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { Appbar, Button, Text } from 'react-native-paper'

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

  return (
    <View style={StyleSheet.absoluteFill}>
      <Appbar.Header>
        <Appbar.Content title='Game' />
        <Appbar.Action icon='exit-to-app' onPress={onStop} accessibilityLabel='Exit Game' />
      </Appbar.Header>
      <View style={styles.gameContainer}>
        <HangmanDrawingRandom wrongGuesses={wrongGuesses} manColor={color} />
        <Text style={styles.wordDisplay} accessibilityLabel='Secret word display'>
          {phrase
            .split('')
            .map((ch) => (ch === ' ' ? ' ' : guessedLetters.includes(ch) ? ch : '_'))
            .join(' ')}
        </Text>
        <Text style={styles.margin}>
          Wrong guesses: {wrongGuesses} / {maxWrong}
        </Text>
        <Keyboard guessedLetters={guessedLetters} color={color} onGuess={handleGuess} />
        <Button mode='outlined' onPress={onStop} style={styles.margin}>
          New Game
        </Button>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  gameContainer: {
    alignItems: 'center',
    width: '100%'
  },
  margin: { marginVertical: 8 },
  wordDisplay: {
    fontSize: 28
  }
})
