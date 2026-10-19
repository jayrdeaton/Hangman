import { useCallback, useState } from 'react'
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native'

import { fitSketchWordFontSize } from '@/components/SketchWord'
import { SolvingWord } from '@/components/SolvingWord'
import type { GameMode } from '@/types/gameModes'

// HANGMAN (Jay, 2026-10-18: it drew "AB"), solved the way the board and Home's hero solve a word:
// SolvingWord, the one shared reveal, its blanks first, then each giving way to its letter. Sized to the
// preview it's drawn in (a thumbnail in the Settings sheet, a whole card in the loadout's carousel).
const PREVIEW_WORD = 'HANGMAN'
// The word across most of the preview's width, and never taller than this share of its height.
const PREVIEW_WIDTH_SHARE = 0.9
const PREVIEW_HEIGHT_SHARE = 0.3

// Never actually rendered during play - Game skips it for hasVisual: false modes - this only
// illustrates the mode in the pickers' previews. Measured, since a preview's size is its picker's.
const LettersVisual = ({ color }: { mistakes: number; color: string }) => {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setSize((previous) => (previous?.width === width && previous.height === height ? previous : { width, height }))
  }, [])
  const fontSize = size ? fitSketchWordFontSize(PREVIEW_WORD.length, size.width * PREVIEW_WIDTH_SHARE, size.height * PREVIEW_HEIGHT_SHARE) : 0
  return (
    <View testID='letters-preview' style={styles.fill} onLayout={handleLayout}>
      {fontSize > 0 ? <SolvingWord word={PREVIEW_WORD} fontSize={fontSize} color={color} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { alignItems: 'center', alignSelf: 'stretch', flex: 1, justifyContent: 'center' }
})

export const lettersMode: GameMode = {
  id: 'letters',
  label: 'Letters Only',
  description: 'No artwork, just the letters, bigger',
  category: 'minimal',
  behavior: 'none',
  maxMistakes: 6,
  hasVisual: false,
  Visual: LettersVisual
}
