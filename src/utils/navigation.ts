import { configureNavigation, safeBack } from '@rific/core'
import { router } from 'expo-router'

import type { PlayMode } from '@/redux/roundSlice'

// The fleet's back: router.back() when there's somewhere to go back to, otherwise Home. A screen
// reached with nothing beneath it (a resumed game, a share link opened cold, a web reload) would
// otherwise hit expo-router's "GO_BACK was not handled" error. @rific/core keeps expo-router out of
// its own dependencies, so the router is handed in here, once, as every fleet app does.
configureNavigation({ router })

export { safeBack }

// The Home corner (the loadouts'): dismissTo pops back to the Home already beneath, or replaces this
// screen with it when there's none (a loadout reached from a resumed game).
export const goHome = () => router.dismissTo('/')

// A door into the loadout (Home's Single Player and Pass & Play).
export const loadoutHref = (door: PlayMode) => ({ pathname: '/loadout' as const, params: { mode: door } })

// A game, and the door whose loadout it goes back to: the game's own unless it's said (the Pass & Play
// table on the packs takes turns playing solo rounds, gameHref('solo', 'pnp'), see utils/packTurns.ts).
// The door only goes in the URL when it differs, so every game's own URL is as it was.
export const gameHref = (mode: PlayMode, door: PlayMode = mode) => ({ pathname: '/game' as const, params: door === mode ? { mode } : { mode, door } })

export const parsePlayMode = (value: string | string[] | undefined): PlayMode => (value === 'pnp' ? 'pnp' : 'solo')
