import React, { useState } from 'react'
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

const KEY_MARGIN = 2

export const Keyboard: React.FC<KeyboardProps> = ({ disabled = false, guessedLetters, layout = 'qwerty', onGuess, style }) => {
  const theme = useTheme()
  const rows = LAYOUT_ROWS[layout]
  const [containerWidth, setContainerWidth] = useState(0)
  // Every key gets the same fixed width, sized off the longest row, so the widest row spans the
  // full measured width edge to edge and shorter rows end up narrower but centered — same as a
  // physical keyboard's staggered rows. Pixel width (not a percentage flexBasis) because RN's
  // Yoga layout doesn't reliably resolve percentage flexBasis nested inside an alignItems:
  // 'center' ancestor chain.
  const maxCols = Math.max(...rows.map((r) => r.length))
  const keyWidth = containerWidth > 0 ? containerWidth / maxCols - KEY_MARGIN * 2 : undefined
  return (
    <View style={[styles.keyboard, style]} onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((letter) => {
            const isGuessed = guessedLetters.includes(letter)
            return (
              <Button mode='contained' key={letter} disabled={isGuessed || disabled} buttonColor={theme.colors.secondary} textColor={theme.colors.onSecondary} style={[styles.key, keyWidth ? { width: keyWidth } : null]} onPress={() => onGuess(letter)} labelStyle={styles.text}>
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
    borderRadius: 8,
    marginHorizontal: KEY_MARGIN,
    minWidth: 0
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
    marginHorizontal: 4
  }
})
