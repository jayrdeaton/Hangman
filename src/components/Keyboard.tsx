import React from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { Button } from 'react-native-paper'

export type KeyboardProps = {
  color?: string
  disabled?: boolean
  guessedLetters: string[]
  onGuess: (letter: string) => void
  style?: StyleProp<ViewStyle>
}

export const Keyboard: React.FC<KeyboardProps> = ({ guessedLetters, onGuess, style }) => {
  const rows = ['QWERTYUIOP'.split(''), 'ASDFGHJKL'.split(''), 'ZXCVBNM'.split('')]
  return (
    <View style={[styles.keyboard, style]}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((letter) => {
            const isGuessed = guessedLetters.includes(letter)
            return (
              <Button mode='contained' key={letter} disabled={isGuessed} style={styles.key} onPress={() => onGuess(letter)} labelStyle={styles.text}>
                {letter}
              </Button>
            )
          })}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  key: {
    alignItems: 'center',
    borderRadius: 8,
    marginHorizontal: 2,
    minWidth: 30
  },
  keyboard: {
    width: '100%'
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 4
  },
  text: {
    marginHorizontal: 10
  }
})
