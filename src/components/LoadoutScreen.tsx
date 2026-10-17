import { JSX } from 'react'

import type { PlayMode } from '@/redux/roundSlice'

import { PnpLoadout } from './PnpLoadout'
import { SoloLoadout } from './SoloLoadout'

export type LoadoutScreenProps = { mode: PlayMode }

// The /loadout route: what to play before playing it, one page per play mode (SoloLoadout, PnpLoadout,
// both on LoadoutShell), between Home and the game. Each mode keeps its own round (see roundSlice), so
// Continue picks up exactly where that mode was left.
export const LoadoutScreen = ({ mode }: LoadoutScreenProps): JSX.Element => (mode === 'pnp' ? <PnpLoadout /> : <SoloLoadout />)
