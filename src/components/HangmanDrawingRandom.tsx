import React, { useMemo, useState } from 'react'
import { LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import Svg, { Circle, Line } from 'react-native-svg'

export type HangmanDrawingRandomProps = {
  color?: string
  wrongGuesses: number
  style?: StyleProp<ViewStyle>
}

const PART_KEYS = ['leftarm', 'rightarm', 'leftleg', 'rightleg', 'body', 'head'] as const
const LIMBS = ['leftarm', 'rightarm', 'leftleg', 'rightleg'] as const

function shuffle<T>(arr: T[]) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

export const HangmanDrawingRandom: React.FC<HangmanDrawingRandomProps> = ({ color = 'black', style, wrongGuesses }) => {
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 })
  // Generate a random removal order once per mounted component instance
  // Shuffle limbs first so arms/legs disappear randomly, then remove body, then head
  const [removalOrder] = useState<(typeof PART_KEYS)[number][]>(() => {
    const shuffledLimbs = shuffle(Array.from(LIMBS)) as (typeof PART_KEYS)[number][]
    return [...shuffledLimbs, 'body', 'head']
  })

  // Parts mapped by key so we can selectively hide them. Coordinates are
  // chosen to center the figure in a 200x260 viewBox so the character
  // occupies most of the available space (no gallows area).
  const parts = useMemo(
    () => ({
      head: <Circle key='head' cx='100' cy='60' r='40' stroke={color} strokeWidth='4' fill='none' />,
      body: <Line key='body' x1='100' y1='100' x2='100' y2='180' stroke={color} strokeWidth='4' />,
      leftarm: <Line key='leftarm' x1='100' y1='120' x2='60' y2='140' stroke={color} strokeWidth='4' />,
      rightarm: <Line key='rightarm' x1='100' y1='120' x2='140' y2='140' stroke={color} strokeWidth='4' />,
      leftleg: <Line key='leftleg' x1='100' y1='180' x2='70' y2='230' stroke={color} strokeWidth='4' />,
      rightleg: <Line key='rightleg' x1='100' y1='180' x2='130' y2='230' stroke={color} strokeWidth='4' />
    }),
    [color]
  )

  const totalParts = PART_KEYS.length
  const removeCount = Math.min(Math.max(0, wrongGuesses), totalParts)
  const removed = new Set(removalOrder.slice(0, removeCount))

  // Show parts that are NOT removed
  const visibleParts = PART_KEYS.filter((k) => !removed.has(k)).map((k) => parts[k])
  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setDimensions({ width, height })
  }
  return (
    <View style={[styles.container, style]} onLayout={handleLayout}>
      <Svg width={dimensions.width} height={dimensions.height} viewBox='0 0 200 260'>
        {visibleParts}
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', marginVertical: 20 }
})
