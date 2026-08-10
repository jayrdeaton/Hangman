import React from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'

import type { GameMode } from '@/types/gameModes'

type Props = {
  mode: GameMode
  mistakes: number
  color: string
  colors?: string[]
  started?: boolean
  style?: StyleProp<ViewStyle>
}

// No measure-then-mount dance here anymore — GameMode['Visual'] no longer takes width/height (see
// its own doc comment for why), so there's nothing to wait on. Visual renders immediately, in the
// same commit as this component itself, and fills whatever box `style` gives it exactly the way
// any other flex-sized child would (its own <Svg> defaults to 100%/100% with no width/height
// passed — see react-native-svg's own Svg.tsx). This used to hold off rendering Visual until its
// own onLayout reported a nonzero width, which was a second, independent async round-trip on top
// of whatever the caller's own layout already needed — and the actual reason a fade-in wrapped
// around this (see PuzzleStage.tsx) raced ahead of the content it was supposed to be revealing.
export const GameVisual = ({ mode, mistakes, color, colors, started, style }: Props) => {
  const { Visual } = mode

  return (
    <View testID='game-visual-container' style={[styles.container, style]}>
      <Visual mistakes={mistakes} color={color} colors={colors} started={started} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'flex-start' }
})
