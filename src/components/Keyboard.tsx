import React from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { Button, useTheme } from 'react-native-paper'

import type { KeyboardLayout } from '@/hooks/useKeyboardLayout'

export type KeyboardProps = {
  disabled?: boolean
  guessedLetters: string[]
  layout?: KeyboardLayout
  onGuess: (letter: string) => void
  style?: StyleProp<ViewStyle>
}

const LAYOUT_ROWS: Record<KeyboardLayout, string[][]> = {
  abc: ['ABCDEFGHI'.split(''), 'JKLMNOPQR'.split(''), 'STUVWXYZ'.split('')],
  qwerty: ['QWERTYUIOP'.split(''), 'ASDFGHJKL'.split(''), 'ZXCVBNM'.split('')]
}

export const Keyboard: React.FC<KeyboardProps> = ({ disabled = false, guessedLetters, layout = 'qwerty', onGuess, style }) => {
  const theme = useTheme()
  const rows = LAYOUT_ROWS[layout]
  return (
    <View style={[styles.keyboard, style]}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((letter) => {
            const isGuessed = guessedLetters.includes(letter)
            return (
              <Button mode='contained' key={letter} disabled={isGuessed || disabled} buttonColor={theme.colors.secondary} textColor={theme.colors.onSecondary} style={styles.key} onPress={() => onGuess(letter)} labelStyle={styles.text}>
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
