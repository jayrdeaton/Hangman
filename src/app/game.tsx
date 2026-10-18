import { useKeepAwake } from '@rific/core'
import { useLocalSearchParams } from 'expo-router'
import { JSX } from 'react'

import { GameScreen } from '@/components/GameScreen'
import { parsePlayMode } from '@/utils/navigation'

// /game?mode=solo|pnp[&door=solo|pnp]: the game, and the door whose loadout it goes back to (its own
// when left out; see gameHref). Keyed on both: a share link can pop back to a Pass & Play game screen
// and switch it to solo (see PlayScreen), and that has to be a fresh screen, not the old one's state.
const GameRoute = (): JSX.Element => {
  const params = useLocalSearchParams<{ mode?: string; door?: string }>()
  const mode = parsePlayMode(params.mode)
  const door = params.door === undefined ? mode : parsePlayMode(params.door)
  // Keeps the screen from dimming and locking while a round is up, unless Keep Awake is off in
  // Settings (read live, so the toggle applies mid-round). Expo only does this by itself in
  // development builds, and the OS auto-lock only counts screen touches, so a long think on a guess
  // (or a Pass & Play hand-over) could let a release build lock mid-round. The setting and the
  // expo-keep-awake module are @rific/core's, from Providers.tsx's KeepAwakeBridge.
  useKeepAwake('game')
  return <GameScreen key={`${mode}:${door}`} mode={mode} door={door} />
}

export default GameRoute
