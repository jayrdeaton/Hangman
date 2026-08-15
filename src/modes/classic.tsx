import React from 'react'
import type { SharedValue } from 'react-native-reanimated'
import Animated, { useAnimatedProps, useSharedValue } from 'react-native-reanimated'
import Svg, { G } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'
import { Body, GallowsWithRope, Head, LeftArm, LeftLeg, RightArm, RightLeg } from './shared/classicParts'

const AnimatedG = Animated.createAnimatedComponent(G)

// Parts reveal order: head → body → arms → legs
const PARTS = [Head, Body, LeftArm, RightArm, LeftLeg, RightLeg]

const ClassicVisual = ({ mistakes, color, colors, started, partsOpacity }: { mistakes: number; color: string; colors?: string[]; started?: boolean; partsOpacity?: SharedValue<number> }) => {
  const count = clampStage(mistakes, PARTS.length)
  // The man is the focus (primary). The gallows is scaffold, same role hourglass's stand plays —
  // secondary. Falls back to the plain `color` when no triad is given (e.g. ModeSelector's card
  // preview, which only passes `color`).
  const gallowsColor = colors?.[1] ?? color
  // Real gameplay (Game.tsx/PuzzleStage) never passes partsOpacity — only ModePickerDrawer's demo
  // loop does, to fade the stick figure out between build cycles while leaving the gallows alone
  // (see gameModes.ts's own comment on this prop). Falls back to a plain always-1 shared value so
  // the animatedProps hook below always has something to read.
  const fallbackOpacity = useSharedValue(1)
  const opacity = partsOpacity ?? fallbackOpacity
  const animatedProps = useAnimatedProps(() => ({ opacity: opacity.value }))
  return (
    <Svg viewBox='0 0 100 100'>
      <GallowsWithRope color={gallowsColor} started={started} />
      <AnimatedG animatedProps={animatedProps}>
        {PARTS.slice(0, count).map((Part, i) => (
          <Part key={i} color={color} />
        ))}
      </AnimatedG>
    </Svg>
  )
}

export const classicMode: GameMode = {
  id: 'classic',
  label: 'Classic',
  description: 'The hangman appears piece by piece with each wrong guess',
  category: 'parts',
  behavior: 'additive',
  maxMistakes: 6,
  Visual: ClassicVisual
}
