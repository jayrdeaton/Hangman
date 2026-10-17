import { useLocalSearchParams } from 'expo-router'
import { JSX } from 'react'

import { GameScreen } from '@/components/GameScreen'
import { parsePlayMode } from '@/utils/navigation'

// /game?mode=solo|pnp. Keyed on the mode: a share link can pop back to a Pass & Play game screen and
// switch it to solo (see PlayScreen), and that has to be a fresh screen, not the old one's state.
const GameRoute = (): JSX.Element => {
  const mode = parsePlayMode(useLocalSearchParams<{ mode?: string }>().mode)
  return <GameScreen key={mode} mode={mode} />
}

export default GameRoute
