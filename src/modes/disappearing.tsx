import React from 'react'
import Svg from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'
import { CenteredBody, CenteredHead, CenteredLeftArm, CenteredLeftLeg, CenteredRightArm, CenteredRightLeg } from './shared/classicParts'
import { SCENE_START_DELAY_MS } from './shared/sceneReveal'

// Starts complete. Parts scrub away — the same pen-stroke reveal in reverse, retracing the exact
// dash it drew in with (see sketchShapes.tsx's own `erased`) — in removal order on each wrong
// guess. Stays mounted for the whole round rather than being conditionally unmounted the instant a
// wrong guess removes it: react-native-svg's shapes have no exit animation of their own to unmount
// into, so an instant unmount was always just an instant pop, never the erase this now actually is.
// Removal order: head first, legs last (psychological: "saving" the character). No gallows frame, so the
// figure is horizontally centered rather than offset to clear a gallows pole.
const REMOVAL_ORDER = [CenteredHead, CenteredBody, CenteredLeftArm, CenteredRightArm, CenteredLeftLeg, CenteredRightLeg]

// How much each surviving part's sketch-in staggers behind the next one drawn, in the round-start
// reveal below.
const STAGGER_MS = 90

const DisappearingVisual = ({ mistakes, color, started }: { mistakes: number; color: string; started?: boolean }) => {
  const removedCount = clampStage(mistakes, REMOVAL_ORDER.length)
  return (
    <Svg viewBox='0 0 100 100'>
      {REMOVAL_ORDER.map((Part, index) => (
        // Reveal order runs opposite to REMOVAL_ORDER (legs and arms first, head last) so the
        // one-time round-start reveal reads as the same bottom-up construction appearing.tsx
        // uses, even though wrong guesses then remove head-first once the round is under way.
        <Part key={index} color={color} started={started} erased={index < removedCount} delayMs={SCENE_START_DELAY_MS + (REMOVAL_ORDER.length - 1 - index) * STAGGER_MS} />
      ))}
    </Svg>
  )
}

export const disappearingMode: GameMode = {
  id: 'disappearing',
  label: 'Disappearing',
  description: 'The figure starts complete and gets erased, piece by piece, with each wrong guess',
  category: 'parts',
  behavior: 'subtractive',
  maxMistakes: 6,
  Visual: DisappearingVisual
}
