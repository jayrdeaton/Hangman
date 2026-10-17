import { useLocalSearchParams } from 'expo-router'
import { JSX } from 'react'

import { LoadoutScreen } from '@/components/LoadoutScreen'
import { parsePlayMode } from '@/utils/navigation'

// /loadout?mode=solo|pnp. Keyed on the mode so a change of mode is a fresh page, never one page's state
// carried into the other's.
const LoadoutRoute = (): JSX.Element => {
  const mode = parsePlayMode(useLocalSearchParams<{ mode?: string }>().mode)
  return <LoadoutScreen key={mode} mode={mode} />
}

export default LoadoutRoute
