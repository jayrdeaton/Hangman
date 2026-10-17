import { configureNavigation, safeBack } from '@rific/core'
import { router } from 'expo-router'

import type { PlayMode } from '@/redux/roundSlice'

// The fleet's back: router.back() when there's somewhere to go back to, otherwise Home. A screen
// reached with nothing beneath it (a resumed game, a share link opened cold, a web reload) would
// otherwise hit expo-router's "GO_BACK was not handled" error. @rific/core keeps expo-router out of
// its own dependencies, so the router is handed in here, once, as every fleet app does.
configureNavigation({ router })

export { safeBack }

export const loadoutHref = (mode: PlayMode) => ({ pathname: '/loadout' as const, params: { mode } })
export const gameHref = (mode: PlayMode) => ({ pathname: '/game' as const, params: { mode } })

export const parsePlayMode = (value: string | string[] | undefined): PlayMode => (value === 'pnp' ? 'pnp' : 'solo')
