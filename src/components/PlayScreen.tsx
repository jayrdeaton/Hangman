import { router, useLocalSearchParams } from 'expo-router'
import { JSX, useEffect, useRef } from 'react'
import { Portal } from 'react-native-paper'

import { useActiveGame } from '@/hooks/useActiveGame'
import { useStartSolo } from '@/hooks/useStartSolo'
import { gameHref, safeBack } from '@/utils/navigation'
import { parseSharedPuzzleParams } from '@/utils/puzzleLink'
import { resolvePuzzle } from '@/utils/puzzlePicker'

// The /play route, where a shared puzzle link lands (hangman://play?phrase=...&hint=...&mode=..., or
// the same path on the web). It draws nothing itself: it puts the shared puzzle on the solo board and
// hands off to the game screen, asking first if that would abandon a round with guesses on it.
//
// dismissTo pops back to a game screen already in the stack (a link opened while playing), or
// replaces this route with one, so a link never leaves two game screens stacked. A link that isn't a
// playable puzzle, or a cancelled abandon, goes back where the player was (Home, opened cold).
export const PlayScreen = (): JSX.Element => {
  const params = useLocalSearchParams<{ phrase?: string; hint?: string; mode?: string }>()
  const { requestStart, abandonDialog } = useStartSolo()
  const { cancelResume } = useActiveGame()
  const handledRef = useRef(false)

  useEffect(() => {
    if (handledRef.current) return
    handledRef.current = true
    cancelResume()
    const config = parseSharedPuzzleParams(params)
    const result = config ? resolvePuzzle(config, []) : null
    if (!result?.ok) {
      safeBack()
      return
    }
    requestStart(result.payload, { onStarted: () => router.dismissTo(gameHref('solo')), onCancelled: safeBack })
  }, [params, requestStart, cancelResume])

  return <Portal.Host>{abandonDialog}</Portal.Host>
}
