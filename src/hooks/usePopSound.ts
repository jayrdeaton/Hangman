import { type AudioPlayer, useAudioPlayer } from 'expo-audio'
import { useCallback, useMemo, useRef } from 'react'

import { useSoundSettings } from './useSoundSettings'

// Relative, not the @/ alias — see useSoundEffects.ts's own comment on why static asset
// requires in this codebase stick to plain relative paths.
const POP_SOUND = require('../../assets/sounds/pop.wav')
const PLAYER_POOL_SIZE = 4

// Round-robin pool (mirrors CashierFu-Utility's useSound.ts PLAYER_POOL_SIZE pattern) because
// fireworks.tsx spawns a burst every 180-420ms while each burst's own animation runs ~1200ms —
// pops routinely overlap themselves, unlike the single-shot correct/wrong/win/loss/click sounds.
export const usePopSound = () => {
  const { settings } = useSoundSettings()
  const player1 = useAudioPlayer(POP_SOUND)
  const player2 = useAudioPlayer(POP_SOUND)
  const player3 = useAudioPlayer(POP_SOUND)
  const player4 = useAudioPlayer(POP_SOUND)
  const players = useMemo<AudioPlayer[]>(() => [player1, player2, player3, player4], [player1, player2, player3, player4])
  const nextIndexRef = useRef(0)

  const playPop = useCallback(() => {
    if (!settings.enabled) return
    const player = players[nextIndexRef.current]
    nextIndexRef.current = (nextIndexRef.current + 1) % PLAYER_POOL_SIZE
    setTimeout(() => {
      void player.seekTo(0).then(() => player.play())
    }, 0)
  }, [settings.enabled, players])

  return { playPop }
}
