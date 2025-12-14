import { StatusBar } from 'expo-status-bar'
import { JSX, useState } from 'react'
import { Alert, Platform, StyleSheet, View } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { Appbar, Button, Text, TextInput } from 'react-native-paper'

import { useTheme } from '../hooks'
import { ColorPicker } from './ColorPicker'
import { HangmanDrawingRandom } from './HangmanDrawingRandom'
import { Keyboard } from './Keyboard'

export const Main = (): JSX.Element => {
  const { color, setColor } = useTheme()
  // Game state
  const [setupWord, setSetupWord] = useState('')
  const [secretVisible, setSecretVisible] = useState(false)
  const [secretWord, setSecretWord] = useState('')
  const [guessedLetters, setGuessedLetters] = useState<string[]>([])
  const [wrongGuesses, setWrongGuesses] = useState(0)
  const maxWrong = 6

  const handleGuess = (letter) => {
    const L = letter.toUpperCase()
    if (guessedLetters.includes(L)) return
    const next = [...guessedLetters, L]
    setGuessedLetters(next)
    if (!secretWord.includes(L)) {
      const w = wrongGuesses + 1
      setWrongGuesses(w)
      if (w >= maxWrong) {
        // show the loss alert while leaving the full hangman visible
        Alert.alert(
          'You lost',
          `The word was ${secretWord}`,
          [
            {
              text: 'OK',
              onPress: () => {
                setSecretWord('')
                setGuessedLetters([])
                setWrongGuesses(0)
              }
            }
          ],
          { cancelable: false }
        )
      }
    } else {
      const allRevealed = secretWord.split('').every((c) => c === ' ' || next.includes(c))
      if (allRevealed) {
        Alert.alert(
          'You win',
          'All letters guessed!',
          [
            {
              text: 'OK',
              onPress: () => {
                setSecretWord('')
                setGuessedLetters([])
                setWrongGuesses(0)
              }
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
        <Appbar.Content title='Hangman' />
        {/* <Appbar.Action icon='cog' onPress={() => setSettingsVisible(true)} accessibilityLabel='Settings' /> */}
      </Appbar.Header>

      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}>
        {!secretWord ? (
          <View style={styles.setupContainer}>
            <Text style={styles.title}>Pass & Play — Enter a secret word</Text>
            <TextInput style={styles.input} value={setupWord} onChangeText={setSetupWord} placeholder='Secret word (letters and spaces allowed)' autoCapitalize='characters' secureTextEntry={!secretVisible} maxLength={128} numberOfLines={3} mode='outlined' right={<TextInput.Icon icon={secretVisible ? 'eye-off' : 'eye'} onPress={() => setSecretVisible((s) => !s)} />} />
            <ColorPicker label='Pick accent color for this round' color={color} onChange={setColor} />
            <Button
              mode='contained'
              onPress={() => {
                const normalized = setupWord
                  .replace(/[^A-Za-z ]/g, '')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .toUpperCase()
                if (!normalized || normalized.replace(/ /g, '').length === 0) {
                  Alert.alert('Enter a valid word', 'Please enter a secret word using letters A–Z (spaces allowed)')
                  return
                }
                setSecretWord(normalized)
                setGuessedLetters([])
                setWrongGuesses(0)
                setSetupWord('')
              }}
              style={styles.margin}
            >
              Start Game
            </Button>
          </View>
        ) : (
          <View style={styles.gameContainer}>
            <HangmanDrawingRandom wrongGuesses={wrongGuesses} manColor={color} />
            {/* <HangmanDrawing wrongGuesses={wrongGuesses} color={theme.colors.onBackground} manColor={primaryColor} /> */}
            <Text style={styles.wordDisplay} accessibilityLabel='Secret word display'>
              {secretWord
                .split('')
                .map((ch) => (ch === ' ' ? ' ' : guessedLetters.includes(ch) ? ch : '_'))
                .join(' ')}
            </Text>
            <Text style={styles.margin}>
              Wrong guesses: {wrongGuesses} / {maxWrong}
            </Text>
            <Keyboard guessedLetters={guessedLetters} color={color} onGuess={handleGuess} />
            <Button
              mode='outlined'
              onPress={() => {
                setSecretWord('')
                setGuessedLetters([])
                setWrongGuesses(0)
              }}
              style={styles.margin}
            >
              New Game
            </Button>
          </View>
        )}
        <StatusBar style='auto' />
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 16
  },
  gameContainer: {
    alignItems: 'center',
    width: '100%'
  },
  input: {
    textAlignVertical: 'top',
    width: '100%'
  },
  margin: { marginVertical: 8 },
  setupContainer: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    width: '100%'
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12
  },
  wordDisplay: {
    fontSize: 28
  }
})
