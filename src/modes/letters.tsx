import React from 'react'
import Svg, { Text as SvgText } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

// Never actually rendered during play — Game skips it for hasVisual: false modes — this only
// illustrates the mode in the picker's preview card.
const LettersVisual = ({ color }: { mistakes: number; color: string }) => (
  <Svg viewBox='0 0 100 100'>
    <SvgText x='50' y='58' fontSize='36' fontWeight='700' fill={color} textAnchor='middle'>
      Aa
    </SvgText>
  </Svg>
)

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
