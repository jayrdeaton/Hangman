import Svg from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'
import { CenteredBody, CenteredHead, CenteredLeftArm, CenteredLeftLeg, CenteredRightArm, CenteredRightLeg } from './shared/classicParts'

// Same head-to-toe reveal order as classic.tsx's own PARTS, just without its gallows frame - so
// the figure is horizontally centered rather than offset to clear a gallows pole.
const PARTS = [CenteredHead, CenteredBody, CenteredLeftArm, CenteredRightArm, CenteredLeftLeg, CenteredRightLeg]

const AppearingVisual = ({ mistakes, color }: { mistakes: number; color: string }) => {
  const count = clampStage(mistakes, PARTS.length)
  return (
    <Svg viewBox='0 0 100 100'>
      {PARTS.slice(0, count).map((Part, i) => (
        <Part key={i} color={color} />
      ))}
    </Svg>
  )
}

export const appearingMode: GameMode = {
  id: 'appearing',
  label: 'Appearing',
  // Hidden 2026-10-18: Jay found it weak beside the others (the same stick figure as Classic, without
  // its gallows). Still resolves for a shared link or a player who already picked it.
  hidden: true,
  description: 'The figure appears head to toe with each wrong guess',
  category: 'parts',
  behavior: 'additive',
  maxMistakes: 6,
  Visual: AppearingVisual
}
