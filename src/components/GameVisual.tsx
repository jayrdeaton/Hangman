import React, { useState } from 'react'
import { LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'

import type { GameMode } from '@/types/gameModes'

type Props = {
  mode: GameMode
  mistakes: number
  color: string
  style?: StyleProp<ViewStyle>
}

export const GameVisual = ({ mode, mistakes, color, style }: Props) => {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const { Visual } = mode

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setSize({ width, height })
  }

  return (
    <View style={[styles.container, style]} onLayout={handleLayout}>
      {size.width > 0 && <Visual mistakes={mistakes} color={color} width={size.width} height={size.height} />}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'flex-start' }
})
