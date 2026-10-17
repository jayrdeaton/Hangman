import { useLocalSearchParams } from 'expo-router'
import { JSX } from 'react'

import { PlayScreen } from '@/components/PlayScreen'

// Keyed on the link itself: a second link opened while this screen is still asking about the first
// reuses the route with new params, and has to be a fresh request, not the first one's card.
const PlayRoute = (): JSX.Element => {
  const { phrase, hint, mode } = useLocalSearchParams<{ phrase?: string; hint?: string; mode?: string }>()
  return <PlayScreen key={JSON.stringify([phrase, hint, mode])} />
}

export default PlayRoute
